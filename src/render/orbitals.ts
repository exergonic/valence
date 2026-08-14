import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import type { ColorScheme } from './setup';
import { createLobeMesh, orientLobe, sigmaLobe, piLobe, lonePairLobe } from './lobes';
import { getElementColor, getCovalentRadius } from './chem-data';
import type { AtomClassification } from '../chem/classify';
import { getLonePairDirections } from '../utils/lone-pairs';
import { vecNormalize, crossProduct, findPerpendicular } from '../utils/vec3';

export function renderOrbitals(
  group: THREE.Group,
  molecule: Molecule,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  colorScheme: { scheme: ColorScheme; sigma: number; pi: number; lonePair: number } = { scheme: 'element', sigma: 0xcccccc, pi: 0x4488ff, lonePair: 0xffaa44 },
  classifications: AtomClassification[] | null = null,
): void {
  const cached = classifications ?? [];
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  for (let i = 0; i < n; i++) {
    const atom = molecule.atoms[i];
    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];
    const info = cached[i];

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
    const atomScale = getCovalentRadius(atom.element) + 0.2;

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
        addPiOrbital(group, atomPos, [perp, perp2], colorScheme.pi, preset, atomScale, i, atom.element);
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
