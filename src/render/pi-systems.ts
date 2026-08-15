import * as THREE from 'three';
import type { AtomClassification } from '../chem/classify';
import type { Molecule } from '../mol-parser';

// A π system: a set of connected atoms whose p orbitals are parallel and
// overlap to form a delocalized π system (e.g., benzene's 6 π electrons,
// butadiene's 4). Distinct π systems in the same molecule (e.g., two
// non-coplanar ring systems) get different colors.
export interface PiSystem {
  atomIndices: number[];
  color: number;
}

const PI_SYSTEM_COLORS = [0xff66aa, 0x66ffaa, 0x66aaff, 0xffaa66, 0xaa66ff];

// Detect π systems in a molecule.
//
// Algorithm:
// 1. Find connected components of π atoms (atoms with hasPi === true)
//    connected through any σ bond.
// 2. Within each component, group atoms whose p orbitals are parallel
//    (|dot product| > 0.9). Each such group is one π system.
//
// This correctly handles:
// - Benzene → 1 π system (6 atoms, all p's parallel)
// - Butadiene → 1 π system (4 atoms)
// - But-1-en-3-yne → 1 π system (all 4 carbons, all p's coplanar)
// - Two isolated alkenes → 2 π systems (different colors)
export function detectPiSystems(
  molecule: Molecule,
  classifications: AtomClassification[],
): PiSystem[] {
  const n = molecule.atoms.length;
  const piAtoms = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (classifications[i]?.hasPi) {
      piAtoms.add(i);
    }
  }

  // Build adjacency among π atoms (connected through any bond)
  const adj: Map<number, number[]> = new Map();
  for (const bond of molecule.bonds) {
    if (piAtoms.has(bond.atom1Index) && piAtoms.has(bond.atom2Index)) {
      if (!adj.has(bond.atom1Index)) adj.set(bond.atom1Index, []);
      if (!adj.has(bond.atom2Index)) adj.set(bond.atom2Index, []);
      adj.get(bond.atom1Index)!.push(bond.atom2Index);
      adj.get(bond.atom2Index)!.push(bond.atom1Index);
    }
  }

  // Collect all p-orbital directions for each atom
  const atomDirections: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const dirs: [number, number, number][] = [];
    const c = classifications[i];
    if (c?.piDirection) dirs.push(c.piDirection);
    if (c?.piDirection2) dirs.push(c.piDirection2);
    atomDirections.push(dirs);
  }

  // Group directions into "direction classes": two directions are in the
  // same class if they are parallel (|dot| > 0.9). Each class represents
  // one π system orientation.
  const directionClasses: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (const dir of atomDirections[i]) {
      let found = false;
      for (const cls of directionClasses) {
        const dot = Math.abs(dir[0] * cls[0] + dir[1] * cls[1] + dir[2] * cls[2]);
        if (dot > 0.9) {
          found = true;
          break;
        }
      }
      if (!found) {
        directionClasses.push([...dir]);
      }
    }
  }

  // For each direction class, find the connected set of atoms that have
  // a p orbital in that direction. Each connected set with ≥ 2 atoms is
  // a π system.
  const systems: PiSystem[] = [];
  for (let dc = 0; dc < directionClasses.length; dc++) {
    const dir = directionClasses[dc];
    const atomsWithDir: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!piAtoms.has(i)) continue;
      for (const ad of atomDirections[i]) {
        const dot = Math.abs(ad[0] * dir[0] + ad[1] * dir[1] + ad[2] * dir[2]);
        if (dot > 0.9) {
          atomsWithDir.push(i);
          break;
        }
      }
    }

    // Find connected components among atomsWithDir
    const visited = new Set<number>();
    const atomSet = new Set(atomsWithDir);
    for (const start of atomsWithDir) {
      if (visited.has(start)) continue;
      const component: number[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(curr);
        for (const nb of adj.get(curr) || []) {
          if (atomSet.has(nb) && !visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      if (component.length >= 2) {
        systems.push({
          atomIndices: component,
          color: PI_SYSTEM_COLORS[dc % PI_SYSTEM_COLORS.length],
        });
      }
    }
  }

  return systems;
}

// Render π systems as continuous electron-density clouds above and below
// the molecular plane — like merged p-orbital lobes spanning the atoms.
//
// Each π system is rendered as two "slabs" (above and below the plane),
// following the spine of atom centers, tapering at the ends. The gap
// between the slabs at the molecular plane represents the p-orbital node.
export function renderPiSystems(
  group: THREE.Group,
  molecule: Molecule,
  classifications: AtomClassification[],
): void {
  const systems = detectPiSystems(molecule, classifications);
  for (const system of systems) {
    const atomPositions = system.atomIndices.map((i) => {
      const a = molecule.atoms[i];
      return new THREE.Vector3(a.x, a.y, a.z);
    });

    // Average p-orbital direction for this system
    const piDir = new THREE.Vector3();
    for (const idx of system.atomIndices) {
      const d = classifications[idx].piDirection!;
      piDir.set(d[0], d[1], d[2]);
    }
    piDir.normalize();

    // Spine through atom centers
    const spine = new THREE.CatmullRomCurve3(atomPositions);

    // Build the cloud geometry (two slabs above and below the plane)
    const cloudGeo = buildCloudGeometry(spine, piDir);
    const cloudMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.userData = { lobeType: 'pi-system' };
    group.add(cloud);
  }
}

// Build a π-cloud geometry: two slabs above and below the molecular plane,
// following the spine curve, tapering at the ends.
function buildCloudGeometry(spine: THREE.Curve<THREE.Vector3>, piDir: THREE.Vector3): THREE.BufferGeometry {
  const N = 40;        // samples along spine
  const M = 8;         // samples across width
  const height = 0.45; // distance above/below the plane
  const halfWidth = 0.35; // in-plane half-width of the cloud

  const positions: number[] = [];
  const indices: number[] = [];

  // Build above and below ribbons
  for (let layer = 0; layer < 2; layer++) {
    const h = layer === 0 ? height : -height;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const center = spine.getPoint(t);
      const tangent = spine.getTangent(t).normalize();
      // In-plane direction perpendicular to spine
      const binormal = new THREE.Vector3().crossVectors(tangent, piDir).normalize();

      // Taper width at ends for smooth cloud shape
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));

      for (let j = 0; j <= M; j++) {
        const s = (j / M - 0.5) * 2 * halfWidth * taper;
        const v = center.clone()
          .addScaledVector(binormal, s)
          .addScaledVector(piDir, h);
        positions.push(v.x, v.y, v.z);
      }
    }
  }

  // Build triangle indices
  const vertsPerRing = M + 1;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = layer * (N + 1) * vertsPerRing + i * vertsPerRing + j;
        const b = a + 1;
        const c = a + vertsPerRing;
        const d = c + 1;
        if (layer === 0) {
          indices.push(a, c, b, b, c, d);
        } else {
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
