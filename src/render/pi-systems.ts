import * as THREE from 'three';
import type { AtomClassification } from '../chem/classify';
import type { Molecule } from '../mol-parser';

// A π system: a set of connected atoms whose p orbitals are parallel and
// overlap to form a delocalized π system (e.g., benzene's 6 π electrons,
// butadiene's 4). Distinct π systems in the same molecule (e.g., the two
// perpendicular π bonds of an alkyne) get different colors.
export interface PiSystem {
  atomIndices: number[];
  color: number;
  direction: [number, number, number]; // the p-orbital direction shared by this system
}

const PI_SYSTEM_COLORS = [0xff66aa, 0x66ffaa, 0x66aaff, 0xffaa66, 0xaa66ff];

// Detect π systems in a molecule.
//
// Algorithm:
// 1. Collect every p-orbital direction from every atom (piDirection and
//    piDirection2). An sp atom contributes two perpendicular directions;
//    an sp² atom contributes one.
// 2. Group these directions into parallel classes (|dot| > 0.9). Each
//    class is one π system orientation.
// 3. For each direction class, find the set of atoms that have a p orbital
//    in that direction. Find connected components among those atoms
//    (connected through bonds). Each component with ≥ 2 adjacent atoms
//    is a π system.
//
// This correctly handles:
// - Ethyne → 2 π systems (both sp carbons, two perpendicular p's each)
// - N₂ → 2 π systems (same as ethyne)
// - Benzene → 1 π system (6 sp² carbons, all p's parallel)
// - But-1-en-3-yne → 2 π systems:
//     System 1: all 4 carbons (alkene p ∥ alkyne p₁)
//     System 2: the 2 alkyne carbons (alkyne p₂, perpendicular to p₁)
export function detectPiSystems(
  molecule: Molecule,
  classifications: AtomClassification[],
): PiSystem[] {
  const n = molecule.atoms.length;

  // Collect all p-orbital directions for each atom
  const atomDirections: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const dirs: [number, number, number][] = [];
    const c = classifications[i];
    if (c?.piDirection) dirs.push(c.piDirection);
    if (c?.piDirection2) dirs.push(c.piDirection2);
    atomDirections.push(dirs);
  }

  // Group directions into parallel classes: two directions are in the
  // same class if they are parallel (|dot| > 0.9).
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

  // Build adjacency among all atoms (for connectivity check)
  const adj: Map<number, number[]> = new Map();
  for (const bond of molecule.bonds) {
    if (!adj.has(bond.atom1Index)) adj.set(bond.atom1Index, []);
    if (!adj.has(bond.atom2Index)) adj.set(bond.atom2Index, []);
    adj.get(bond.atom1Index)!.push(bond.atom2Index);
    adj.get(bond.atom2Index)!.push(bond.atom1Index);
  }

  // For each direction class, find connected sets of atoms that have
  // a p orbital in that direction. Each connected set with ≥ 2 atoms
  // is a π system.
  const systems: PiSystem[] = [];
  for (let dc = 0; dc < directionClasses.length; dc++) {
    const dir = directionClasses[dc];
    const atomsWithDir = new Set<number>();
    for (let i = 0; i < n; i++) {
      for (const ad of atomDirections[i]) {
        const dot = Math.abs(ad[0] * dir[0] + ad[1] * dir[1] + ad[2] * dir[2]);
        if (dot > 0.9) {
          atomsWithDir.add(i);
          break;
        }
      }
    }

    // Find connected components among atomsWithDir
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

// Render π systems as full electron-density clouds — the textbook style
// where the π cloud is a thick, rounded surface above and below the
// molecular plane, spanning all participating atoms. Each cloud is a
// single merged lobe (top + bottom) with a smooth, rounded profile.
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

    const piDir = new THREE.Vector3(
      system.direction[0],
      system.direction[1],
      system.direction[2],
    ).normalize();

    const spine = new THREE.CatmullRomCurve3(atomPositions);
    const cloudGeo = buildCloudGeometry(spine, piDir);
    const cloudMat = new THREE.MeshPhongMaterial({
      color: system.color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
      shininess: 80,
      specular: 0x444444,
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.userData = { lobeType: 'pi-system' };
    group.add(cloud);
  }
}

// Build a π-cloud geometry: two separate rounded lobes — one above, one
// below the molecular plane — each connecting the corresponding p-orbital
// lobes of adjacent atoms. The gap at the molecular plane is the p-orbital
// node. Each lobe is a half-ellipse cross-section (sitting entirely on one
// side of the plane) swept along the spine.
function buildCloudGeometry(spine: THREE.Curve<THREE.Vector3>, piDir: THREE.Vector3): THREE.BufferGeometry {
  const N = 48;           // samples along spine
  const M = 20;           // angular samples around the half-ellipse cross-section
  const lobeHeight = 0.65; // how far above/below the plane the cloud extends
  const lobeWidth = 0.50;  // in-plane half-width at each cross-section

  const positions: number[] = [];
  const indices: number[] = [];

  // Build two separate lobes — top (+piDir) and bottom (−piDir).
  // Each lobe is a half-ellipse that starts at the molecular plane,
  // bulges outward, and returns to the plane. The nodal plane (the
  // gap between lobes) is never filled.
  for (let layer = 0; layer < 2; layer++) {
    const sign = layer === 0 ? 1 : -1;
    const baseOffset = layer * (N + 1) * (M + 1);

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const center = spine.getPoint(t);
      const tangent = spine.getTangent(t).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, piDir).normalize();

      // Thickness profile: fattest at atom centers, thinner between them.
      // The raised-cosine envelope gives a smooth bumpy shape.
      const envelope = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(2 * Math.PI * t - Math.PI));
      const width = lobeWidth * envelope;
      const height = lobeHeight * envelope;

      for (let j = 0; j <= M; j++) {
        // Half-ellipse from θ=0 (right edge at plane) to θ=π (left edge
        // at plane). The lobe sits entirely on one side of the plane.
        const theta = (j / M) * Math.PI;
        const w = Math.cos(theta) * width;      // in-plane: +w → −w
        const h = Math.sin(theta) * height * sign; // out-of-plane: 0 → max → 0

        const v = center.clone()
          .addScaledVector(binormal, w)
          .addScaledVector(piDir, h);
        positions.push(v.x, v.y, v.z);
      }
    }

    // Triangle indices for this lobe
    const vertsPerRing = M + 1;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        const a = baseOffset + i * vertsPerRing + j;
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