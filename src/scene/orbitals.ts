import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import type { ColorScheme } from './setup';
import { createLobeMesh, orientLobe } from '../orbitals';
import { sigmaLobe, piLobe, lonePairLobe } from '../orbitals/lathe';
import { getElementColor, getElementRadius } from './chem-data';
import { classifyMolecule } from '../utils/classify';
import { vecNormalize, vecDot, crossProduct, findPerpendicular, rotateRodrigues, rotateToward } from '../utils/vec3';

export function renderOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  colorScheme: { scheme: ColorScheme; sigma: number; pi: number; lonePair: number } = { scheme: 'element', sigma: 0xcccccc, pi: 0x4488ff, lonePair: 0xffaa44 },
): void {
  const classifications = classifyMolecule(molecule);
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  for (let i = 0; i < n; i++) {
    const atom = molecule.atoms[i];
    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];
    const info = classifications[i];

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

    const color = colorScheme.scheme === 'element' ? getElementColor(atom.element) : colorScheme.sigma;
    const atomScale = getElementRadius(atom.element) + 0.2;

    // Sigma bonds: lobes pointing toward each neighbor
    for (const vec of neighborVectors) {
      const mesh = createLobeMesh(sigmaLobe(), color, 0.6, preset, atomScale);
      mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'sigma', label: info.hybridization };
      orientLobe(mesh, atomPos, vec);
      group.add(mesh);
    }

    // Lone pairs in unfilled hybrid orbital directions
    if (info.lonePairs > 0) {
      const sigmaBonds = neighbors.length;
      const totalHybrids = sigmaBonds + info.lonePairs;
      const lpDirs = getLonePairDirections(neighborVectors, totalHybrids, info.piDirection);
      for (const lpDir of lpDirs) {
        const mesh = createLobeMesh(lonePairLobe(), colorScheme.lonePair, 0.5, preset, atomScale);
        mesh.userData = { atomIndex: i, element: atom.element, lobeType: 'lone_pair', label: info.hybridization };
        orientLobe(mesh, atomPos, lpDir);
        group.add(mesh);
      }
    }

    // Pi orbitals based on hybridization
    if (info.hybridization === 'sp' && neighborVectors.length >= 1) {
      // sp atoms have 2 perpendicular p orbitals.
      const axis = neighborVectors[0];
      if (info.piDirection) {
        // One p aligns with the conjugating neighbor's π direction (e.g. enyne,
        // ynone).  The second is perpendicular to both the bond axis and the first.
        const perp2 = vecNormalize(crossProduct(axis, info.piDirection));
        addPiOrbital(group, atomPos, [info.piDirection, perp2], colorScheme.pi, preset, atomScale, i, atom.element);
      } else {
        // No conjugating neighbor — pick arbitrary perpendiculars (e.g. ethyne).
        const perp = vecNormalize(findPerpendicular(axis));
        const perp2 = vecNormalize(crossProduct(axis, perp));
        addPiOrbital(group, atomPos, [perp, perp2], colorScheme.pi, undefined, undefined, i, atom.element);
      }
    } else if (info.piDirection) {
      addPiOrbital(group, atomPos, [info.piDirection], colorScheme.pi, preset, atomScale, i, atom.element);
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
