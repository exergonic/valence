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

// Render π system highlights as one tube per π BOND: for every bond whose
// two atoms are in the same detected system (bonded AND with parallel p
// orbitals), connect the positive lobe tips above the nodal plane and the
// negative tips below it.
//
// This is deliberately simpler than threading a single curve through all the
// atoms — a simple ring gets one tube per ring bond, and a fused system
// (naphthalene) gets one tube per bond INCLUDING the shared fusion bond,
// which no single curve through the atoms can traverse without special
// ordering. The per-bond rule needs no ordering at all.
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
    const atomSet = new Set(system.atomIndices);

    // Lobe tip along/against piDir for any atom in the system.
    const tip = (idx: number, sign: 1 | -1): THREE.Vector3 => {
      const atom = molecule.atoms[idx];
      const extent = PI_LENGTH * (getCovalentRadius(atom.element) + 0.2);
      const center = new THREE.Vector3(atom.x, atom.y, atom.z);
      return center.clone().addScaledVector(piDir, sign * extent);
    };

    const posMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const negMat = posMat.clone();

    // The whole highlight: one tube per π bond within this system.
    for (const bond of molecule.bonds) {
      if (!atomSet.has(bond.atom1Index) || !atomSet.has(bond.atom2Index)) continue;
      const a = bond.atom1Index;
      const b = bond.atom2Index;
      group.add(makeBondTube(tip(a, 1), tip(b, 1), posMat));
      group.add(makeBondTube(tip(a, -1), tip(b, -1), negMat));
    }
  }
}

/** A straight tube between two lobe tips — the highlight for one π bond. */
function makeBondTube(
  from: THREE.Vector3,
  to: THREE.Vector3,
  material: THREE.MeshPhongMaterial,
): THREE.Mesh {
  const curve = new THREE.LineCurve3(from, to);
  const geometry = new THREE.TubeGeometry(curve, 1, 0.08, 8, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { lobeType: 'pi-system' };
  return mesh;
}