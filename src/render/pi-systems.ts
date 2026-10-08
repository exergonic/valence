import * as THREE from 'three';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { Molecule } from '../mol-parser';
import type { MoSurfaceData } from '../chem/extended-huckel/mo-surface';
import { marchSignedField } from '../utils/march-tetrahedra';
import { renderMoIsosurface } from './mo-isosurface';

// A π system: a set of connected atoms whose p orbitals are parallel and
// overlap to form a delocalized π system. Distinct π systems get
// different colors.
export interface PiSystem {
  atomIndices: number[];
  color: number;
  direction: [number, number, number];
}

// One colour per π system: clear of the π lobes' own blue and the lone pairs'
// amber, and distinct from one another on dark and light backgrounds.
const PI_SYSTEM_COLORS = [0x4fd1b5, 0xc58cf2, 0xf2789a, 0xf2c45a, 0x7fb2ff];

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
  atomOrbitals: AtomOrbitals[],
): PiSystem[] {
  const n = molecule.atoms.length;

  const atomDirections: [number, number, number][][] = [];
  for (let i = 0; i < n; i++) {
    const dirs: [number, number, number][] = [];
    const c = atomOrbitals[i];
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

// The π cloud: how a π system is drawn when highlighted. Each system gets two
// smooth translucent sheets, one either side of the σ framework, in the
// system's colour — the textbook picture of delocalisation (Silberberg's
// ethene and ethyne, the benzene "doughnut"). It replaced one straight tube
// per π bond between the lobe tips, which read as plumbing (2026-10-08).
//
// The sheets are a contour of the IN-PHASE SUM of the members' p orbitals — a
// Gaussian p function on each atom, all aligned with the system — the
// all-bonding combination a chemist draws for "the π system". It is a guide
// to which p orbitals overlap, not a calculated density. The sum is positive
// on one side of the nodal plane and negative on the other, and the two sheets
// are marched separately on the signed field, so they never fuse through it.

/** Gaussian exponent (Å⁻²): a p function peaks 1/√(2α) ≈ 0.65 Å from its atom. */
const CLOUD_EXPONENT = 1.2;
/** One p function's peak value, so the contour reads as a share of it. */
const P_PEAK = Math.exp(-0.5) / Math.sqrt(2 * CLOUD_EXPONENT);
/** The contour, as a share of one p function's peak: low enough that a sheet
 *  runs unbroken along each bond (a bond midpoint sums to about 1.1), high
 *  enough that a ring keeps its hole (benzene's centre sums to about 0.57). */
const CLOUD_LEVEL = 0.9;
const CLOUD_SPACING = 0.1; // Å
const CLOUD_PADDING = 1.8; // Å beyond the outermost member atom
const CLOUD_OPACITY = 0.55;
/** Beyond 3.5 Å a p function is below 1e-6 of its peak: skip the atom. */
const CLOUD_CUTOFF_SQ = 3.5 * 3.5;
/** The member lobes stay visible inside the cloud, but the cloud leads. */
const MEMBER_LOBE_OPACITY = 0.45;

type Vec3 = [number, number, number];

/** Each member atom's p direction that belongs to this system, all signed
 *  alike so the sum is in phase. An sp atom has two; only the parallel one
 *  takes part. */
function memberDirections(system: PiSystem, atomOrbitals: AtomOrbitals[]): Map<number, Vec3> {
  const d = system.direction;
  const out = new Map<number, Vec3>();
  for (const i of system.atomIndices) {
    for (const p of [atomOrbitals[i]?.piDirection, atomOrbitals[i]?.piDirection2]) {
      if (!p) continue;
      const length = Math.hypot(p[0], p[1], p[2]);
      const dot = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / length;
      if (Math.abs(dot) > 0.9) {
        const sign = Math.sign(dot) / length;
        out.set(i, [p[0] * sign, p[1] * sign, p[2] * sign]);
        break;
      }
    }
  }
  return out;
}

/** The two sheets of one π system's cloud, in the molecule's coordinates. */
export function piCloudSurface(molecule: Molecule, atomOrbitals: AtomOrbitals[], system: PiSystem): MoSurfaceData {
  const members = [...memberDirections(system, atomOrbitals)].map(([i, d]) => {
    const a = molecule.atoms[i];
    return { x: a.x, y: a.y, z: a.z, d };
  });

  // the summed field at a point, and its gradient
  const probe = { value: 0, gx: 0, gy: 0, gz: 0 };
  const evaluate = (x: number, y: number, z: number) => {
    let value = 0, gx = 0, gy = 0, gz = 0;
    for (const m of members) {
      const rx = x - m.x, ry = y - m.y, rz = z - m.z;
      const r2 = rx * rx + ry * ry + rz * rz;
      if (r2 > CLOUD_CUTOFF_SQ) continue;
      const g = Math.exp(-CLOUD_EXPONENT * r2) / P_PEAK;
      const s = rx * m.d[0] + ry * m.d[1] + rz * m.d[2];
      value += s * g;
      // ∇(s·g) = g·d − 2α·s·g·r
      gx += g * (m.d[0] - 2 * CLOUD_EXPONENT * s * rx);
      gy += g * (m.d[1] - 2 * CLOUD_EXPONENT * s * ry);
      gz += g * (m.d[2] - 2 * CLOUD_EXPONENT * s * rz);
    }
    probe.value = value; probe.gx = gx; probe.gy = gy; probe.gz = gz;
  };

  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of members) {
    const at = [m.x, m.y, m.z];
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], at[k] - CLOUD_PADDING);
      hi[k] = Math.max(hi[k], at[k] + CLOUD_PADDING);
    }
  }
  const n = (k: number) => Math.max(2, Math.ceil((hi[k] - lo[k]) / CLOUD_SPACING) + 1);
  const dimensions: Vec3 = [n(0), n(1), n(2)];
  const [nx, ny, nz] = dimensions;
  const values = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        evaluate(lo[0] + i * CLOUD_SPACING, lo[1] + j * CLOUD_SPACING, lo[2] + k * CLOUD_SPACING);
        values[i + j * nx + k * nx * ny] = probe.value;
      }
    }
  }

  const sheets = marchSignedField({ values, origin: lo, dimensions, spacing: CLOUD_SPACING }, CLOUD_LEVEL, (x, y, z, sign) => {
    evaluate(x, y, z);
    const length = Math.hypot(probe.gx, probe.gy, probe.gz) || 1;
    return [(-sign * probe.gx) / length, (-sign * probe.gy) / length, (-sign * probe.gz) / length];
  });
  return {
    positions: new Float32Array(sheets.positions),
    normals: new Float32Array(sheets.normals),
    phases: new Float32Array(sheets.phases),
    vertexCount: sheets.positions.length / 3,
    isovalue: CLOUD_LEVEL,
  };
}

const cloudCache = new WeakMap<Molecule, Map<string, MoSurfaceData>>();

/** Draw every π system's cloud, in the orbital finish the user chose; returns
 *  the systems, so their member lobes can be tinted to match. */
export function renderPiSystems(
  group: THREE.Group,
  molecule: Molecule,
  atomOrbitals: AtomOrbitals[],
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
): PiSystem[] {
  const systems = detectPiSystems(molecule, atomOrbitals);
  // a rebuild for any display change redraws the highlight, and anthracene's
  // cloud takes ~0.3 s to compute: keep each one for as long as its molecule
  let cache = cloudCache.get(molecule);
  if (!cache) cloudCache.set(molecule, (cache = new Map()));
  for (const system of systems) {
    const key = `${system.atomIndices.join(',')}|${system.direction.map((v) => v.toFixed(4)).join(',')}`;
    let surface = cache.get(key);
    if (!surface) cache.set(key, (surface = piCloudSurface(molecule, atomOrbitals, system)));
    renderMoIsosurface(group, surface, preset, CLOUD_OPACITY, [system.color, system.color]);
  }
  for (const child of group.children) child.userData = { lobeType: 'pi-system' };
  return systems;
}

/** The touch of colour that ties a cloud to its orbitals: each member atom's p
 *  lobes in the system's direction take the system's colour, translucent, so
 *  they show through the cloud they make rather than filling it. */
export function tintPiSystemLobes(orbitalGroup: THREE.Group, systems: PiSystem[]): void {
  for (const system of systems) {
    const members = new Set(system.atomIndices);
    const d = system.direction;
    const color = new THREE.Color(system.color);
    for (const child of orbitalGroup.children) {
      const data = child.userData as { lobeType?: string; atomIndex?: number; direction?: Vec3 };
      if (data.lobeType !== 'pi' || data.atomIndex === undefined || !members.has(data.atomIndex) || !data.direction) continue;
      const p = data.direction;
      if (Math.abs(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) < 0.9) continue;
      const mesh = child as THREE.Mesh;
      const material = (mesh.material as THREE.MeshPhongMaterial).clone();
      material.color = color;
      material.transparent = true;
      material.opacity = MEMBER_LOBE_OPACITY;
      material.depthWrite = false;
      mesh.material = material;
    }
  }
}
