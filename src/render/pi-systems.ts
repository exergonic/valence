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

    // Compute lobe tip positions for each atom (mirrors orbitals.ts)
    const positiveTips: THREE.Vector3[] = [];
    const negativeTips: THREE.Vector3[] = [];

    for (const idx of system.atomIndices) {
      const atom = molecule.atoms[idx];
      const atomScale = getCovalentRadius(atom.element) + 0.2;
      const lobeExtent = PI_LENGTH * atomScale;
      const center = new THREE.Vector3(atom.x, atom.y, atom.z);

      positiveTips.push(center.clone().addScaledVector(piDir, lobeExtent));
      negativeTips.push(center.clone().addScaledVector(piDir, -lobeExtent));
    }

    // Need at least 2 tips to draw a tube
    if (positiveTips.length < 2) continue;

    // Order tips along the spine (by projecting onto the first-to-last
    // direction so the tube follows the molecular chain)
    const orderedPos = orderTips(positiveTips);
    const orderedNeg = orderTips(negativeTips);

    const tubeMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Tube connecting positive lobe tips
    const posCurve = new THREE.CatmullRomCurve3(orderedPos);
    const posTube = new THREE.TubeGeometry(posCurve, 32, 0.08, 8, false);
    const posMesh = new THREE.Mesh(posTube, tubeMat);
    posMesh.userData = { lobeType: 'pi-system' };
    group.add(posMesh);

    // Tube connecting negative lobe tips
    const negCurve = new THREE.CatmullRomCurve3(orderedNeg);
    const negTube = new THREE.TubeGeometry(negCurve, 32, 0.08, 8, false);
    const negMesh = new THREE.Mesh(negTube, tubeMat.clone());
    negMesh.userData = { lobeType: 'pi-system' };
    group.add(negMesh);
  }
}

// Order tip positions along the molecular chain by projecting onto the
// vector from the first to last tip. This ensures the tube follows the
// spine of the molecule rather than jumping between non-adjacent atoms.
function orderTips(tips: THREE.Vector3[]): THREE.Vector3[] {
  if (tips.length <= 2) return tips;
  const first = tips[0];
  const last = tips[tips.length - 1];
  const axis = new THREE.Vector3().subVectors(last, first).normalize();
  return [...tips].sort((a, b) => {
    const pa = new THREE.Vector3().subVectors(a, first).dot(axis);
    const pb = new THREE.Vector3().subVectors(b, first).dot(axis);
    return pa - pb;
  });
}