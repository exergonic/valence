import * as THREE from 'three';
import type { AtomClassification } from '../chem/classify';
import type { Molecule } from '../mol-parser';

// A π system: a set of connected atoms whose p orbitals are parallel and
// overlap to form a delocalized π system (e.g., benzene's 6 π electrons,
// butadiene's 4). Distinct π systems in the same molecule (e.g., the two
// perpendicular π bonds of an alkyne, or non-coplanar ring systems) get
// different colors.
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
    if (classifications[i]?.hasPi && classifications[i]?.piDirection) {
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

  // Find connected components via BFS
  const visited = new Set<number>();
  const systems: PiSystem[] = [];

  for (const startAtom of piAtoms) {
    if (visited.has(startAtom)) continue;

    // BFS to find this connected component
    const component: number[] = [];
    const queue = [startAtom];
    visited.add(startAtom);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      component.push(curr);
      for (const nb of adj.get(curr) || []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    // Group by p-orbital direction (parallel detection)
    // Use Union-Find to cluster atoms with parallel p orbitals
    const parent = new Array(component.length).fill(0).map((_, i) => i);

    function find(x: number): number {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    }
    function union(a: number, b: number): void {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }

    // Only merge atoms that are adjacent AND have parallel p orbitals
    for (let i = 0; i < component.length; i++) {
      for (let j = i + 1; j < component.length; j++) {
        const ai = component[i];
        const aj = component[j];
        // Only consider adjacent atoms for same π system
        if (!adj.get(ai)?.includes(aj)) continue;
        const di = classifications[ai].piDirection!;
        const dj = classifications[aj].piDirection!;
        const dot = Math.abs(di[0] * dj[0] + di[1] * dj[1] + di[2] * dj[2]);
        if (dot > 0.9) {
          union(i, j);
        }
      }
    }

    // Group by cluster
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < component.length; i++) {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(component[i]);
    }

    // Each cluster with ≥ 2 atoms is a π system
    let colorIdx = 0;
    for (const [, atomIndices] of clusters) {
      if (atomIndices.length >= 2) {
        systems.push({
          atomIndices,
          color: PI_SYSTEM_COLORS[colorIdx % PI_SYSTEM_COLORS.length],
        });
        colorIdx++;
      }
    }
  }

  return systems;
}

// Render a translucent tube through the center of each π system.
// The tube connects the participating atoms' positions, giving a visual
// indication of the delocalized π electron cloud spanning the system.
export function renderPiSystems(
  group: THREE.Group,
  molecule: Molecule,
  classifications: AtomClassification[],
): void {
  const systems = detectPiSystems(molecule, classifications);
  for (const system of systems) {
    const points = system.atomIndices.map((i) => {
      const a = molecule.atoms[i];
      return new THREE.Vector3(a.x, a.y, a.z);
    });
    if (points.length < 2) continue;

    // Create a smooth curve through the atom centers
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.06, 8, false);
    const tubeMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.userData = { lobeType: 'pi-system' };
    group.add(tube);

    // Add a small sphere at each atom center for visual emphasis
    for (const idx of system.atomIndices) {
      const a = molecule.atoms[idx];
      const sphereGeo = new THREE.SphereGeometry(0.08, 12, 12);
      const sphereMat = new THREE.MeshPhongMaterial({
        color: system.color,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.set(a.x, a.y, a.z);
      sphere.userData = { lobeType: 'pi-system' };
      group.add(sphere);
    }
  }
}
