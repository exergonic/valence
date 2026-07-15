import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import { assignHybridization } from '../hybridization';
import { createLobeMesh, orientLobe } from '../orbitals';
import { sigmaLobe, piLobe, lonePairLobe } from '../orbitals/lathe';
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

    const neighbors = adj[i];
    const neighborVectors: [number, number, number][] = neighbors.map((ni) => {
      const n = molecule.atoms[ni];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z];
    });

    const hyb = assignHybridization(atom.element, neighborVectors);
    const color = getElementColor(atom.element);

    // Sigma bonds: lobes pointing toward each neighbor
    for (const vec of neighborVectors) {
      const mesh = createLobeMesh(sigmaLobe(), color, 0.6);
      orientLobe(mesh, atomPos, vec);
      group.add(mesh);
    }

    // Lone pairs: unfilled hybrid orbital directions
    if (hyb.hybridization === 'sp3' && neighborVectors.length < 4) {
      const lonePairDirs = getLonePairDirections(neighborVectors, 4);
      for (const lpDir of lonePairDirs) {
        const mesh = createLobeMesh(lonePairLobe(), 0xffaa44, 0.5);
        orientLobe(mesh, atomPos, lpDir);
        group.add(mesh);
      }
    } else if (hyb.hybridization === 'sp2' && neighborVectors.length === 2) {
      const lonePairDirs = getLonePairDirections(neighborVectors, 3);
      for (const lpDir of lonePairDirs) {
        const mesh = createLobeMesh(lonePairLobe(), 0xffaa44, 0.5);
        orientLobe(mesh, atomPos, lpDir);
        group.add(mesh);
      }
    }

    // Pi orbitals based on hybridization
    if (hyb.hybridization === 'sp2' && neighborVectors.length >= 2) {
      const normal = crossProduct(neighborVectors[0], neighborVectors[1]);
      const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
      if (len > 1e-6) {
        normal[0] /= len;
        normal[1] /= len;
        normal[2] /= len;
        addPiOrbital(group, atomPos, [normal], 0x4488ff);
      }
    } else if (hyb.hybridization === 'sp' && neighborVectors.length >= 2) {
      const axis = neighborVectors[0];
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

function vecNormalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function rotateRodrigues(
  v: [number, number, number],
  axis: [number, number, number],
  cosA: number,
  sinA: number,
): [number, number, number] {
  const dot = vecDot(v, axis);
  const cross: [number, number, number] = [
    axis[1] * v[2] - axis[2] * v[1],
    axis[2] * v[0] - axis[0] * v[2],
    axis[0] * v[1] - axis[1] * v[0],
  ];
  return [
    v[0] * cosA + cross[0] * sinA + axis[0] * dot * (1 - cosA),
    v[1] * cosA + cross[1] * sinA + axis[1] * dot * (1 - cosA),
    v[2] * cosA + cross[2] * sinA + axis[2] * dot * (1 - cosA),
  ];
}

// Translate: find rotation that maps 'from' to 'to', return rotated 'v'
function rotateToward(
  v: [number, number, number],
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number] {
  const dot = vecDot(from, to);
  if (Math.abs(dot - 1) < 1e-6) return v;
  if (Math.abs(dot + 1) < 1e-6) return [-v[0], -v[1], -v[2]];

  const axis = vecNormalize([
    from[1] * to[2] - from[2] * to[1],
    from[2] * to[0] - from[0] * to[2],
    from[0] * to[1] - from[1] * to[0],
  ]);
  return rotateRodrigues(v, axis, dot, Math.sqrt(1 - dot * dot));
}

function getLonePairDirections(
  sigmaDirs: [number, number, number][],
  total: number,
): [number, number, number][] {
  const missing = total - sigmaDirs.length;
  if (missing <= 0) return [];

  // 1 lone pair: opposite the centroid of the sigma vectors
  if (missing === 1) {
    const sum: [number, number, number] = [0, 0, 0];
    for (const d of sigmaDirs) { sum[0] += d[0]; sum[1] += d[1]; sum[2] += d[2]; }
    const lp = vecNormalize([-sum[0], -sum[1], -sum[2]]);
    if (lp[0] === 0 && lp[1] === 0 && lp[2] === 0) return [[0, 0, 1]];
    return [lp];
  }

  // 2 lone pairs: exact tetrahedral positions
  // Given two sigma vectors a and b, find the two remaining tetrahedral vertices
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

  if (missing === 2 && sigmaDirs.length >= 1) {
    const a = vecNormalize(sigmaDirs[0]);
    const perp = findPerpendicular(a);
    return [perp, [-perp[0], -perp[1], -perp[2]]];
  }

  // 3 lone pairs: canonical tetrahedron aligned to sigma bond
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
