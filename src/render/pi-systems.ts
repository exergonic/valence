import * as THREE from 'three';
import type { AtomClassification } from '../chem/classify';
import type { Molecule } from '../mol-parser';
import { getCovalentRadius } from './chem-data';

// A π system: a set of connected atoms whose p orbitals are parallel and
// overlap to form a delocalized π system. Distinct π systems get
// different colors.
export interface PiSystem {
  atomIndices: number[];
  color: number;
  direction: [number, number, number];
}

const PI_SYSTEM_COLORS = [0xff66aa, 0x66ffaa, 0x66aaff, 0xffaa66, 0xaa66ff];

// PI_LENGTH mirrors the constant in lobes.ts — the lobe extends this
// far from the atom center (before atomScale).
const PI_LENGTH = 1.1;

// Detect π systems in a molecule.
//
// Algorithm:
// 1. Collect every p-orbital direction from every atom (piDirection and
//    piDirection2). An sp atom contributes two perpendicular directions.
// 2. Group these directions into parallel classes (|dot| > 0.9). Each
//    class is one π system orientation.
// 3. For each direction class, find connected sets of atoms that have
//    a p orbital in that direction. Each connected set with ≥ 2 atoms
//    is a π system.
export function detectPiSystems(
  molecule: Molecule,
  classifications: AtomClassification[],
): PiSystem[] {
  const n = molecule.atoms.length;

  const atomDirections: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const dirs: [number, number, number][] = [];
    const c = classifications[i];
    if (c?.piDirection) dirs.push(c.piDirection);
    if (c?.piDirection2) dirs.push(c.piDirection2);
    atomDirections.push(dirs);
  }

  const directionClasses: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (const dir of atomDirections[i]) {
      let found = false;
      for (const cls of directionClasses) {
        const dot = Math.abs(dir[0] * cls[0] + dir[1] * cls[1] + dir[2] * cls[2]);
        if (dot > 0.9) { found = true; break; }
      }
      if (!found) directionClasses.push([...dir]);
    }
  }

  const adj: Map<number, number[]> = new Map();
  for (const bond of molecule.bonds) {
    if (!adj.has(bond.atom1Index)) adj.set(bond.atom1Index, []);
    if (!adj.has(bond.atom2Index)) adj.set(bond.atom2Index, []);
    adj.get(bond.atom1Index)!.push(bond.atom2Index);
    adj.get(bond.atom2Index)!.push(bond.atom1Index);
  }

  const systems: PiSystem[] = [];
  for (let dc = 0; dc < directionClasses.length; dc++) {
    const dir = directionClasses[dc];
    const atomsWithDir = new Set<number>();
    for (let i = 0; i < n; i++) {
      for (const ad of atomDirections[i]) {
        if (Math.abs(ad[0] * dir[0] + ad[1] * dir[1] + ad[2] * dir[2]) > 0.9) {
          atomsWithDir.add(i);
          break;
        }
      }
    }

    const visited = new Set<number>();
    for (const start of atomsWithDir) {
      if (visited.has(start)) continue;
      const component: number[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        component.push(curr);
        for (const nb of adj.get(curr) || []) {
          if (atomsWithDir.has(nb) && !visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      if (component.length >= 2) {
        systems.push({
          atomIndices: component,
          color: PI_SYSTEM_COLORS[dc % PI_SYSTEM_COLORS.length],
          direction: dir,
        });
      }
    }
  }

  return systems;
}

// Render π system highlights by connecting the tips of the p-orbital
// lobes. For each atom in a π system, the p-orbital lobe extends from
// the atom center along ±direction by PI_LENGTH * atomScale. We connect
// the positive tips with a tube and the negative tips with a tube —
// two tubes per π system, one above and one below the molecular plane.
export function renderPiSystems(
  group: THREE.Group,
  molecule: Molecule,
  classifications: AtomClassification[],
): void {
  const systems = detectPiSystems(molecule, classifications);
  for (const system of systems) {
    const piDir = new THREE.Vector3(
      system.direction[0],
      system.direction[1],
      system.direction[2],
    ).normalize();

    // Build adjacency restricted to atoms in this system
    const atomSet = new Set(system.atomIndices);
    const adj = new Map<number, number[]>();
    for (const bond of molecule.bonds) {
      if (atomSet.has(bond.atom1Index) && atomSet.has(bond.atom2Index)) {
        if (!adj.has(bond.atom1Index)) adj.set(bond.atom1Index, []);
        if (!adj.has(bond.atom2Index)) adj.set(bond.atom2Index, []);
        adj.get(bond.atom1Index)!.push(bond.atom2Index);
        adj.get(bond.atom2Index)!.push(bond.atom1Index);
      }
    }

    // Order atoms by walking the bond graph from a terminal atom (one
    // with only 1 neighbor in the system). For rings (no terminal atoms),
    // start at any atom and walk until we revisit.
    const ordered = orderAlongBonds(system.atomIndices, adj);

    // Compute lobe tip positions for each atom in bond order
    const positiveTips: THREE.Vector3[] = [];
    const negativeTips: THREE.Vector3[] = [];

    for (const idx of ordered) {
      const atom = molecule.atoms[idx];
      const atomScale = getCovalentRadius(atom.element) + 0.2;
      const lobeExtent = PI_LENGTH * atomScale;
      const center = new THREE.Vector3(atom.x, atom.y, atom.z);

      positiveTips.push(center.clone().addScaledVector(piDir, lobeExtent));
      negativeTips.push(center.clone().addScaledVector(piDir, -lobeExtent));
    }

    // Need at least 2 tips to draw a tube
    if (positiveTips.length < 2) continue;

    const tubeMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Tube connecting positive lobe tips (above the nodal plane)
    const posCurve = new THREE.CatmullRomCurve3(positiveTips, false);
    const posTube = new THREE.TubeGeometry(posCurve, 32, 0.08, 8, false);
    const posMesh = new THREE.Mesh(posTube, tubeMat);
    posMesh.userData = { lobeType: 'pi-system' };
    group.add(posMesh);

    // Tube connecting negative lobe tips (below the nodal plane)
    const negCurve = new THREE.CatmullRomCurve3(negativeTips, false);
    const negTube = new THREE.TubeGeometry(negCurve, 32, 0.08, 8, false);
    const negMesh = new THREE.Mesh(negTube, tubeMat.clone());
    negMesh.userData = { lobeType: 'pi-system' };
    group.add(negMesh);
  }
}

// Order atom indices by walking the bond graph. Starts from a terminal
// atom (only 1 neighbor in the system) if one exists; for rings, starts
// at any atom and walks until it revisits. Returns atoms in bond-chain
// order so the tube traces the molecule's connectivity, not a geometric
// shortcut across a ring.
function orderAlongBonds(atoms: number[], adj: Map<number, number[]>): number[] {
  if (atoms.length <= 2) return [...atoms];

  // Find a terminal atom (degree 1 in the subgraph)
  let start = atoms[0];
  for (const a of atoms) {
    if ((adj.get(a) || []).length <= 1) { start = a; break; }
  }

  const visited = new Set<number>([start]);
  const order: number[] = [start];
  let current = start;

  while (order.length < atoms.length) {
    const neighbors = adj.get(current) || [];
    let next: number | null = null;
    for (const nb of neighbors) {
      if (!visited.has(nb)) { next = nb; break; }
    }
    if (next === null) break; // ring closed or disconnected
    visited.add(next);
    order.push(next);
    current = next;
  }

  return order;
}