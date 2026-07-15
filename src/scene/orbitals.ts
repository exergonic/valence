import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import { assignHybridization } from '../hybridization';
import { createLobeMesh, orientLobe } from '../orbitals';
import { sigmaLobe, piLobe } from '../orbitals/lathe';
import { getElementColor } from './chem-data';

export function renderOrbitals(
  group: THREE.Group,
  molecule: Molecule,
): void {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];

    // Hydrogen: 1s sphere in distinct color
    if (atom.element === 'H') {
      const geo = new THREE.SphereGeometry(0.28, 16, 16);
      const mat = new THREE.MeshPhongMaterial({
        color: 0xff8866,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      group.add(mesh);
      continue;
    }

    const steric = adj[i].length;
    const hyb = assignHybridization(steric);
    const color = getElementColor(atom.element);

    const neighbors = adj[i];
    const neighborPositions: [number, number, number][] = neighbors.map(
      (ni) => {
        const n = molecule.atoms[ni];
        return [n.x, n.y, n.z];
      },
    );

    // Sigma bonds: lobes pointing toward each neighbor
    for (const nPos of neighborPositions) {
      const dir: [number, number, number] = [
        nPos[0] - atomPos[0],
        nPos[1] - atomPos[1],
        nPos[2] - atomPos[2],
      ];
      const mesh = createLobeMesh(sigmaLobe(), color, 0.6);
      orientLobe(mesh, atomPos, dir);
      group.add(mesh);
    }

    // Pi orbitals based on hybridization
    if (hyb.hybridization === 'sp2' && neighborPositions.length >= 3) {
      const v1: [number, number, number] = [
        neighborPositions[0][0] - atomPos[0],
        neighborPositions[0][1] - atomPos[1],
        neighborPositions[0][2] - atomPos[2],
      ];
      const v2: [number, number, number] = [
        neighborPositions[1][0] - atomPos[0],
        neighborPositions[1][1] - atomPos[1],
        neighborPositions[1][2] - atomPos[2],
      ];
      const normal = crossProduct(v1, v2);
      addPiOrbital(group, atomPos, [normal], 0x4488ff);
    } else if (hyb.hybridization === 'sp' && neighborPositions.length >= 2) {
      const axis: [number, number, number] = [
        neighborPositions[0][0] - atomPos[0],
        neighborPositions[0][1] - atomPos[1],
        neighborPositions[0][2] - atomPos[2],
      ];
      const perp = findPerpendicular(axis);
      const perp2 = crossProduct(axis, perp);
      addPiOrbital(group, atomPos, [perp, perp2], 0x4488ff);
    }
  }
}

function addPiOrbital(
  group: THREE.Group,
  origin: [number, number, number],
  directions: [number, number, number][],
  color: number,
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

    const positive = createLobeMesh(piLobe(), color, 0.75);
    orientLobe(positive, origin, normalized);
    group.add(positive);

    const negative = createLobeMesh(piLobe(), color, 0.75);
    orientLobe(negative, origin, [
      -normalized[0],
      -normalized[1],
      -normalized[2],
    ]);
    group.add(negative);
  }
}

function findPerpendicular(v: [number, number, number]): [number, number, number] {
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  if (absX <= absY && absX <= absZ) {
    return crossProduct(v, [1, 0, 0]);
  } else if (absY <= absX && absY <= absZ) {
    return crossProduct(v, [0, 1, 0]);
  }
  return crossProduct(v, [0, 0, 1]);
}

function crossProduct(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
