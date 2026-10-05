/**
 * The electrostatic potential surface — charge-model ESP, Phase 1 of PLAN.md.
 *
 * Surface: the united vdW molecular surface, extracted by marching
 * tetrahedra over the signed-distance field of the union of the atoms' vdW
 * spheres — f(p) = min_i(|p − aᵢ| − rᵢ) < 0 inside, 0 on the boundary.
 * This gives the exact union surface, honest cusps at the sphere
 * intersections included; only the finite grid rounds them slightly. The
 * individual atomic spheres are resolved into this fused surface FIRST; the
 * charges/potentials are probed at the fused boundary, not at the
 * individual-sphere vertices (a vertex of one sphere can sit inside a
 * neighbor).
 *
 * Potential: the electric potential of the molecule's point charges at a
 * surface vertex, V(r) = Σ qᵢ/|r − rᵢ|. Units: e/Å (× 332.06 for kcal/mol
 * per unit charge); only the colour reads it, so the unit never shows. This
 * is the charge model (the resolved BCI charges the dipole and the labels
 * use), never quantum-mechanical.
 *
 * Color: the textbook diverging map — negative red, neutral green, positive
 * blue — mapped onto a symmetric scale. The scale is percentile-clipped on
 * |V| so a charged species' near-field blow-up cannot wash out the rest of
 * the surface.
 */
import type { Molecule } from '../../mol-parser';
import { getVdwRadius } from '../radii';

/** Floor on |r − rᵢ| (Å), so `espPotentialAt` is finite everywhere. It never
 *  acts on the surface itself: every point of the vdW union is at least one
 *  vdW radius (≥ 1.2 Å) from every nucleus. */
export const ESP_CUTOFF = 0.35;
/** Isosurface grid spacing (Å) — the resolution of the fused surface. */
export const ESP_GRID_SPACING = 0.25;
/** The least padding around the molecule's bounding box (Å). The actual pad
 *  also covers the largest vdW radius present — see computeEspSurface. */
export const ESP_GRID_MARGIN = 2.0;

/** The electric potential of the point charges at one point in space. */
export function espPotentialAt(
  x: number,
  y: number,
  z: number,
  atoms: Molecule['atoms'],
  charges: number[],
): number {
  let v = 0;
  for (let i = 0; i < atoms.length; i++) {
    const dx = x - atoms[i].x;
    const dy = y - atoms[i].y;
    const dz = z - atoms[i].z;
    const r = Math.hypot(dx, dy, dz);
    v += charges[i] / Math.max(r, ESP_CUTOFF);
  }
  return v;
}

export type RGB = [number, number, number];

/** The textbook ESP diverging map on the unit scale: t ∈ [−1, 1] →
 *  red (negative) → green (neutral) → blue (positive), piecewise-linear in
 *  RGB between the three named stops. */
export function espColor(t: number): RGB {
  const x = Math.max(-1, Math.min(1, t));
  if (x <= 0) {
    const f = x + 1; // 0 → red, 1 → green
    return [Math.round(255 * (1 - f)), Math.round(255 * f), 0];
  }
  const f = x; // 0 → green, 1 → blue
  return [0, Math.round(255 * (1 - f)), Math.round(255 * f)];
}

/** The symmetric scale bound for a set of surface potentials: the
 *  `clipPercentile`-th percentile of |V|, so outliers (an ion's near-field)
 *  are clipped while the typical range keeps its resolution. The scale is
 *  symmetric about zero by construction — V is mapped to t = V/Vmax.
 *  Returns 1 when nothing anchors the scale (all-zero potentials). */
export function espVmax(potentials: number[], clipPercentile = 90): number {
  if (potentials.length === 0) return 1;
  const abs = potentials.map(Math.abs).sort((a, b) => a - b);
  const idx = Math.min(abs.length - 1, Math.max(0, Math.floor((clipPercentile / 100) * abs.length)));
  const peak = abs[idx];
  return peak > 1e-9 ? peak : 1;
}

/** The signed-distance field of the union of vdW spheres: < 0 inside the
 *  contact surface, > 0 outside, ~0 on the boundary. */
export function unionVdwField(x: number, y: number, z: number, atoms: Molecule['atoms']): number {
  let min = Infinity;
  const n = atoms.length;
  for (let i = 0; i < n; i++) {
    const dx = x - atoms[i].x;
    const dy = y - atoms[i].y;
    const dz = z - atoms[i].z;
    const d = Math.hypot(dx, dy, dz) - getVdwRadius(atoms[i].element);
    if (d < min) min = d;
  }
  return min;
}

/** The fused ESP surface: per-vertex soup of positions (Å), outward unit
 *  normals, and the surface value V (e/Å) at each vertex. `vmax` anchors the
 *  color scale; `vertexCount` = number of vertices (3 per emitted triangle). */
export interface EspSurfaceData {
  positions: Float32Array;
  normals: Float32Array;
  potentials: Float32Array;
  vmax: number;
  vertexCount: number;
}

// Cube corner → (x, y, z) offset in grid units.
const CORNER = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// The six cube faces, each as a CCW corner walk; the diagonal is the
// corners' first-to-third pair, chosen so neighboring cubes share edges.
const FACES = [
  [0, 3, 7, 4], // x = 0
  [1, 2, 6, 5], // x = 1
  [0, 1, 5, 4], // y = 0
  [3, 2, 6, 7], // y = 1
  [0, 1, 2, 3], // z = 0
  [4, 5, 6, 7], // z = 1
];

/**
 * Build the fused vdW molecular surface (marching tetrahedra, cube center
 * decomposition into 12 tets) and probe the charge-model potential at every
 * surface vertex. Pure — no Three.js — so the physics and the surface are
 * unit-testable. Cached per molecule by the caller (the surface does not
 * change when opacity changes).
 */
export function computeEspSurface(
  molecule: Molecule,
  charges: number[],
  spacing = ESP_GRID_SPACING,
  margin = ESP_GRID_MARGIN,
): EspSurfaceData {
  const atoms = molecule.atoms;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let largestRadius = 0;
  for (const a of atoms) {
    if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
    if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
    largestRadius = Math.max(largestRadius, getVdwRadius(a.element));
  }
  // The box has to reach past every sphere, or the outermost atom's cap is cut
  // off and the surface is open there. A fixed 2 Å pad did that to iodine
  // (vdW 1.98 Å), and worse, the grid's last point could fall a whole step
  // short of the pad: I₂'s surface had 199 grid-face points inside it. So the
  // pad is at least the largest radius plus a step, and the count has the +1
  // that puts the last point at or beyond the far edge.
  const reach = Math.max(margin, largestRadius + spacing);
  const ox = minX - reach, oy = minY - reach, oz = minZ - reach;
  const nx = Math.ceil((maxX - minX + 2 * reach) / spacing) + 1;
  const ny = Math.ceil((maxY - minY + 2 * reach) / spacing) + 1;
  const nz = Math.ceil((maxZ - minZ + 2 * reach) / spacing) + 1;

  // Field on the grid: f(gx, gy, gz) at grid index gx + gy*nx + gz*nx*ny.
  const grid = new Float32Array(nx * ny * nz);
  for (let gz = 0; gz < nz; gz++) {
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        grid[gx + gy * nx + gz * nx * ny] = unionVdwField(
          ox + gx * spacing, oy + gy * spacing, oz + gz * spacing, atoms,
        );
      }
    }
  }
  const field = (ci: number, cj: number, ck: number): number => grid[ci + cj * nx + ck * nx * ny];
  const point = (ci: number, cj: number, ck: number): [number, number, number] =>
    [ox + ci * spacing, oy + cj * spacing, oz + ck * spacing];

  const positions: number[] = [];
  const normals: number[] = [];
  const potentials: number[] = [];

  // Outward unit normal of the union field at p: away from the atom whose
  // SIGNED distance |p − aᵢ| − rᵢ is smallest — the field's true argmin, i.e.
  // its analytic gradient direction wherever the min is unique. Picking the
  // nearest CENTER instead disagrees at heteronuclear cusps (C vs H at a
  // C–H intersection): external review, 2026-09-28, measured 71 triangles
  // flipped inward on trimethylamine against a finite-difference gradient,
  // which backface culling then punched out as the white cracks.
  const outwardNormal = (px: number, py: number, pz: number): [number, number, number] => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < atoms.length; i++) {
      const d = Math.hypot(px - atoms[i].x, py - atoms[i].y, pz - atoms[i].z) - getVdwRadius(atoms[i].element);
      if (d < bestD) { bestD = d; best = i; }
    }
    const dx = px - atoms[best].x, dy = py - atoms[best].y, dz = pz - atoms[best].z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return [dx / len, dy / len, dz / len];
  };
  // Zero-crossing on the edge u→v (field values carry opposite signs).
  const cross = (
    u: [number, number, number], fu: number,
    v: [number, number, number], fv: number,
  ): [number, number, number] => {
    const denom = fu - fv;
    const t = denom === 0 ? 0.5 : fu / denom;
    return [u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1]), u[2] + t * (v[2] - u[2])];
  };

  const emit = (tri: Array<[number, number, number]>, insidePt: [number, number, number]) => {
    // Orient the triangle AWAY from a corner the field sampled as inside.
    // That corner and the crossing triangle sit on opposite sides of the
    // zero plane by the linear interpolation itself, so the sign is exact —
    // unlike a sampled gradient, which is ambiguous where a triangle
    // straddles a sphere-union crease. Orienting on that ambiguous gradient
    // (2026-09-28 CCl4 report) left whole connected patches wound inward;
    // backface culling then punched them out as the missing near side.
    // Degenerate slivers are emitted too: skipping them left zero-width
    // slits, and the surface must stay closed for backface culling.
    const [a, b, c] = tri;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const ox = (a[0] + b[0] + c[0]) / 3 - insidePt[0];
    const oy = (a[1] + b[1] + c[1]) / 3 - insidePt[1];
    const oz = (a[2] + b[2] + c[2]) / 3 - insidePt[2];
    if (n[0] * ox + n[1] * oy + n[2] * oz < 0) {
      const tmp = tri[1]; tri[1] = tri[2]; tri[2] = tmp; // flip winding
    }
    for (const p of tri) {
      const [nxv, nyv, nzv] = outwardNormal(p[0], p[1], p[2]);
      positions.push(p[0], p[1], p[2]);
      normals.push(nxv, nyv, nzv);
      potentials.push(espPotentialAt(p[0], p[1], p[2], atoms, charges));
    }
  };

  // Marching tetrahedra: each cube is the 6-face, center decomposition into
  // 12 tets (each face [a,b,c,d] → tets (a,b,c,C) and (a,c,d,C)). A tet
  // contributes a triangle when 1 or 3 corners are inside, a quad when 2.
  for (let ck = 0; ck < nz - 1; ck++) {
    for (let cj = 0; cj < ny - 1; cj++) {
      for (let ci = 0; ci < nx - 1; ci++) {
        const cornerPt = CORNER.map(([dx, dy, dz]) => point(ci + dx, cj + dy, ck + dz));
        const cornerVal = CORNER.map(([dx, dy, dz]) => field(ci + dx, cj + dy, ck + dz));
        const centerPt = point(ci + 0.5, cj + 0.5, ck + 0.5);
        const centerVal = unionVdwField(centerPt[0], centerPt[1], centerPt[2], atoms);

        let lo = Math.min(...cornerVal, centerVal);
        let hi = Math.max(...cornerVal, centerVal);
        if (lo >= 0 || hi <= 0) continue; // cell entirely out/inside — no boundary

        // A tet's isosurface within the cube: 1 or 3 inside corners give a
        // triangle, 2 give a quad (two triangles). Whichever corner the field
        // puts deepest INSIDE the molecule is the orientation reference: the
        // crossing plane separates it from the outside, so pointing the
        // triangle away from it is pointing it outward.
        const checkTet = (vals: number[], pts: Array<[number, number, number]>) => {
          const inside: number[] = [];
          const outside: number[] = [];
          for (let t = 0; t < 4; t++) (vals[t] <= 0 ? inside : outside).push(t);
          if (inside.length === 0 || inside.length === 4) return;
          let deep = inside[0];
          for (const t of inside) if (vals[t] < vals[deep]) deep = t;
          const ref = pts[deep];
          if (inside.length === 1) {
            const i = inside[0];
            emit(outside.map((o) => cross(pts[i], vals[i], pts[o], vals[o])), ref);
          } else if (inside.length === 3) {
            const o = outside[0];
            emit(inside.map((i) => cross(pts[o], vals[o], pts[i], vals[i])), ref);
          } else {
            const [i1, i2] = inside;
            const [o1, o2] = outside;
            const a = cross(pts[i1], vals[i1], pts[o1], vals[o1]);
            const b = cross(pts[i1], vals[i1], pts[o2], vals[o2]);
            const c = cross(pts[i2], vals[i2], pts[o1], vals[o1]);
            const d = cross(pts[i2], vals[i2], pts[o2], vals[o2]);
            emit([a, b, d], ref);
            emit([a, d, c], ref);
          }
        };

        // 12 tets from the 6 faces: (a,b,c,C) and (a,c,d,C).
        const pts = new Array(4) as Array<[number, number, number]>;
        const vals = new Array(4) as number[];
        for (const face of FACES) {
          for (const tet of [face.slice(0, 3), [face[0], face[2], face[3]] as number[]]) {
            for (let t = 0; t < 3; t++) {
              pts[t] = cornerPt[tet[t]];
              vals[t] = cornerVal[tet[t]];
            }
            pts[3] = centerPt;
            vals[3] = centerVal;
            checkTet(vals, pts);
          }
        }
      }
    }
  }

  const positionsF = Float32Array.from(positions);
  const normalsF = Float32Array.from(normals);
  const potentialsF = Float32Array.from(potentials);
  return {
    positions: positionsF,
    normals: normalsF,
    potentials: potentialsF,
    vmax: espVmax(Array.from(potentialsF)),
    vertexCount: potentialsF.length,
  };
}