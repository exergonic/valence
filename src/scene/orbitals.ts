import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import type { ColorScheme } from './setup';
import { assignHybridization, assignBySteric } from '../hybridization';
import { createLobeMesh, orientLobe } from '../orbitals';
import { sigmaLobe, piLobe, lonePairLobe } from '../orbitals/lathe';
import { getElementColor, getElementRadius } from './chem-data';
import { VALENCE } from '../data/valence';
import { vecNormalize, vecDot, crossProduct, findPerpendicular, rotateRodrigues, rotateToward } from '../utils/vec3';

export function renderOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  colorScheme: { scheme: ColorScheme; sigma: number; pi: number; lonePair: number } = { scheme: 'element', sigma: 0xcccccc, pi: 0x4488ff, lonePair: 0xffaa44 },
): void {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const piCount: number[] = new Array(n).fill(0);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
    const pi = Math.max(0, bond.order - 1);
    piCount[bond.atom1Index] += pi;
    piCount[bond.atom2Index] += pi;
  }

  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];

    // Hydrogen: 1s sphere in distinct color
    if (atom.element === 'H') {
      const geo = new THREE.SphereGeometry(0.28, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        color: colorScheme.lonePair,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      mesh.userData = { atomIndex: i, element: 'H', lobeType: '1s', label: '1s' };
      group.add(mesh);
      continue;
    }

    const neighbors = adj[i];
    const neighborVectors: [number, number, number][] = neighbors.map((ni) => {
      const n = molecule.atoms[ni];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z];
    });

    // Determine hybridization from geometry or steric fallback
    const hyb = neighborVectors.length >= 2
      ? assignHybridization(atom.element, neighborVectors, piCount[i])
      : assignBySteric(Math.min(4, Math.max(2, neighbors.length + Math.round(Math.max(0, (VALENCE[atom.element] || 4) - neighbors.length - piCount[i]) / 2))));

    // Label for userData: map 'sp2' → 'sp²', 'sp3' → 'sp³'
    const hybLabel = hyb.hybridization === 'sp2' ? 'sp²' : hyb.hybridization === 'sp3' ? 'sp³' : hyb.hybridization;

    // Steric number from hybridization: sp→2, sp²→3, sp³→4
    const stericNumber = hyb.hybridization === 'sp' ? 2
      : hyb.hybridization === 'sp2' ? 3 : 4;
    const sigmaBonds = neighbors.length;
    let lonePairs = Math.max(0, stericNumber - sigmaBonds);

    // Conjugation: if any neighbor has external π bonds and atom itself has none,
    // promote one σ lone pair into the p orbital (furan O, aniline N, amide N, H₂SO₄ O).
    const PI_CONJ_SOURCES = new Set(['C', 'N', 'O', 'S']);
    const piNeighborCount = neighbors.filter((ni) => {
      if (!PI_CONJ_SOURCES.has(molecule.atoms[ni].element)) return false;
      const sharedPi = molecule.bonds
        .filter((b) => (b.atom1Index === i && b.atom2Index === ni) || (b.atom1Index === ni && b.atom2Index === i))
        .reduce((s, b) => s + Math.max(0, b.order - 1), 0);
      return (piCount[ni] - sharedPi) > 0;
    }).length;

    const conjugated = lonePairs > 0 && piNeighborCount > 0 && piCount[i] === 0;
    if (conjugated && hyb.hybridization === 'sp3') lonePairs -= 1;

    // Effective hybridization label
    const effectiveHyb = conjugated && hyb.hybridization === 'sp3' ? 'sp²' : hybLabel;

    const color = colorScheme.scheme === 'element' ? getElementColor(atom.element) : colorScheme.sigma;
    const atomScale = getElementRadius(atom.element) + 0.2;

    // Sigma bonds: lobes pointing toward each neighbor
    for (const vec of neighborVectors) {
      const mesh = createLobeMesh(sigmaLobe(), color, 0.6, preset, atomScale);
      mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'sigma', label: effectiveHyb };
      orientLobe(mesh, atomPos, vec);
      group.add(mesh);
    }

    // Compute π direction
    let piDirection: [number, number, number] | null = null;
    if (conjugated) {
      piDirection = getPiDirectionFromNeighbor(i, adj, molecule, piCount, atomPos);
    }
    // sp² with 1 neighbor and its own π bonds (e.g. carbonyl O): compute π from neighbor geometry
    if (!piDirection && hyb.hybridization === 'sp2' && neighborVectors.length === 1 && piCount[i] > 0) {
      piDirection = getPiDirectionFromNeighbor(i, adj, molecule, piCount, atomPos);
    }
    // sp² with enough own neighbors: compute π from own σ plane
    if (!piDirection && hyb.hybridization === 'sp2' && neighborVectors.length >= 2 && (piCount[i] > 0 || conjugated || piCount[i] === 0)) {
      const nrm = vecNormalize(crossProduct(neighborVectors[0], neighborVectors[1]));
      if (nrm[0] !== 0 || nrm[1] !== 0 || nrm[2] !== 0) piDirection = nrm;
    }

    // Ensure π direction is perpendicular to the σ bond (project out parallel component)
    if (piDirection && neighborVectors.length > 0) {
      const ref = vecNormalize(neighborVectors[0]);
      const dot = vecDot(ref, piDirection);
      piDirection = vecNormalize([
        piDirection[0] - dot * ref[0],
        piDirection[1] - dot * ref[1],
        piDirection[2] - dot * ref[2],
      ]);
    }

    // Lone pairs in unfilled hybrid orbital directions
    if (lonePairs > 0) {
      const totalHybrids = sigmaBonds + lonePairs;
      const lpDirs = getLonePairDirections(neighborVectors, totalHybrids, piDirection);
      for (const lpDir of lpDirs) {
        const mesh = createLobeMesh(lonePairLobe(), colorScheme.lonePair, 0.5, preset, atomScale);
        mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'lone_pair', label: effectiveHyb };
        orientLobe(mesh, atomPos, lpDir);
        group.add(mesh);
      }
    }

    // Pi orbitals based on hybridization
    if (piDirection) {
      addPiOrbital(group, atomPos, [piDirection], colorScheme.pi, preset, atomScale, i, atom.element);
    } else if (hyb.hybridization === 'sp' && neighborVectors.length >= 1) {
      const axis = neighborVectors[0];
      const perp = vecNormalize(findPerpendicular(axis));
      const perp2 = vecNormalize(crossProduct(axis, perp));
      addPiOrbital(group, atomPos, [perp, perp2], colorScheme.pi, undefined, undefined, i, atom.element);
    }
  }
}

function addPiOrbital(
  group: THREE.Group,
  origin: [number, number, number],
  directions: [number, number, number][],
  color: number,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  atomScale: number = 1,
  atomIndex?: number,
  element?: string,
): void {
  for (const dir of directions) {
    const normalized: [number, number, number] = [
      dir[0], dir[1], dir[2],
    ];
    const len = Math.sqrt(normalized[0] ** 2 + normalized[1] ** 2 + normalized[2] ** 2);
    if (len < 1e-6) continue;
    normalized[0] /= len;
    normalized[1] /= len;
    normalized[2] /= len;

    const positive = createLobeMesh(piLobe(), color, 0.75, preset, atomScale);
    positive.userData = { atomIndex, element, lobeType: 'pi', label: 'p' };
    orientLobe(positive, origin, normalized);
    group.add(positive);

    const negative = createLobeMesh(piLobe(), color, 0.75, preset, atomScale);
    negative.userData = { atomIndex, element, lobeType: 'pi', label: 'p' };
    orientLobe(negative, origin, [
      -normalized[0],
      -normalized[1],
      -normalized[2],
    ]);
    group.add(negative);
  }
}

function getPiDirectionFromNeighbor(
  atomIdx: number,
  adj: number[][],
  molecule: Molecule,
  piCount: number[],
  atomPos: [number, number, number],
): [number, number, number] | null {
  const piNeighbor = adj[atomIdx].find((ni) => piCount[ni] > 0);
  if (piNeighbor === undefined) return null;

  const otherBonds = adj[piNeighbor].filter((ni) => ni !== atomIdx);
  if (otherBonds.length >= 2) {
    const nb = molecule.atoms[piNeighbor];
    const s1 = molecule.atoms[otherBonds[0]];
    const s2 = molecule.atoms[otherBonds[1]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const v2: [number, number, number] = [s2.x - nb.x, s2.y - nb.y, s2.z - nb.z];
    return vecNormalize(crossProduct(v1, v2));
  }

  if (otherBonds.length === 1) {
    const nb = molecule.atoms[piNeighbor];
    const s1 = molecule.atoms[otherBonds[0]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
    return vecNormalize(crossProduct(v1, bd));
  }

  // Fallback: perpendicular to the bond to the π neighbor
  const nb = molecule.atoms[piNeighbor];
  const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
  return vecNormalize(findPerpendicular(bd));
}

function getLonePairDirections(
  sigmaDirs: [number, number, number][],
  total: number,
  sigmaPlaneNormal?: [number, number, number] | null,
): [number, number, number][] {
  const missing = total - sigmaDirs.length;
  if (missing <= 0) return [];

  if (missing === 1) {
    const sum: [number, number, number] = [0, 0, 0];
    for (const d of sigmaDirs) { sum[0] += d[0]; sum[1] += d[1]; sum[2] += d[2]; }
    const lp = vecNormalize([-sum[0], -sum[1], -sum[2]]);
    if (lp[0] === 0 && lp[1] === 0 && lp[2] === 0) return [[0, 0, 1]];
    return [lp];
  }

  if (missing === 2 && sigmaDirs.length >= 2) {
    const a = vecNormalize(sigmaDirs[0]);
    const b = vecNormalize(sigmaDirs[1]);
    const cosPhi = vecDot(a, b);

    if (Math.abs(cosPhi + 1) < 1e-6) {
      const perp = findPerpendicular(a);
      return [perp, [-perp[0], -perp[1], -perp[2]]];
    }

    const sumAB: [number, number, number] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const normal = vecNormalize(crossProduct(a, b));
    const alpha = -1 / (3 * (1 + cosPhi));
    const gamma = Math.sqrt(1 - 2 / (9 * (1 + cosPhi)));

    const lp1: [number, number, number] = [
      alpha * sumAB[0] + gamma * normal[0],
      alpha * sumAB[1] + gamma * normal[1],
      alpha * sumAB[2] + gamma * normal[2],
    ];
    const lp2: [number, number, number] = [
      alpha * sumAB[0] - gamma * normal[0],
      alpha * sumAB[1] - gamma * normal[1],
      alpha * sumAB[2] - gamma * normal[2],
    ];
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  if (missing === 2 && sigmaDirs.length === 1 && sigmaPlaneNormal) {
    const a = vecNormalize(sigmaDirs[0]);
    let axis: [number, number, number] = sigmaPlaneNormal;
    const dotAV = vecDot(a, axis);
    axis = [axis[0] - dotAV * a[0], axis[1] - dotAV * a[1], axis[2] - dotAV * a[2]];
    axis = vecNormalize(axis);
    if (axis[0] === 0 && axis[1] === 0 && axis[2] === 0) {
      axis = findPerpendicular(a);
    }
    const cos120 = -0.5;
    const sin120 = Math.sqrt(3) / 2;
    const lp1 = rotateRodrigues(a, axis, cos120, sin120);
    const lp2 = rotateRodrigues(a, axis, cos120, -sin120);
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  if (missing === 2 && sigmaDirs.length >= 1) {
    const a = vecNormalize(sigmaDirs[0]);
    const perp = findPerpendicular(a);
    const cos120 = -0.5;
    const sin120 = Math.sqrt(3) / 2;
    const lp1: [number, number, number] = [
      cos120 * a[0] + sin120 * perp[0],
      cos120 * a[1] + sin120 * perp[1],
      cos120 * a[2] + sin120 * perp[2],
    ];
    const lp2: [number, number, number] = [
      cos120 * a[0] - sin120 * perp[0],
      cos120 * a[1] - sin120 * perp[1],
      cos120 * a[2] - sin120 * perp[2],
    ];
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  if (missing === 3 && sigmaDirs.length >= 1) {
    const a = vecNormalize(sigmaDirs[0]);
    const invSqrt3 = 1 / Math.sqrt(3);
    const tets: [number, number, number][] = [
      [invSqrt3, invSqrt3, invSqrt3],
      [invSqrt3, -invSqrt3, -invSqrt3],
      [-invSqrt3, invSqrt3, -invSqrt3],
      [-invSqrt3, -invSqrt3, invSqrt3],
    ];
    const rotated = tets.map((v) => rotateToward(v, tets[0], a));
    return rotated.slice(1).map((v) => vecNormalize(v));
  }

  return [];
}
