/**
 * The ESP surface as the textbook draws it, from any engine's density: the
 * surface is where the electron density falls to 0.001 e/bohr³ (Bader's
 * contour), so it bulges over lone pairs and π clouds instead of following
 * fixed spheres, and each vertex carries the exact electrostatic potential
 * of the calculation's charge distribution there.
 *
 * Two engines feed it: GFN2-xTB (gfn2-refine.worker.ts, its valence density
 * with free-atom cores added back) and Hartree–Fock (hf-single-point.worker.ts,
 * an all-electron density). The engine supplies the density on a grid, the
 * density at scattered points (for the normals) and the potential at points;
 * this module does the rest, so the two surfaces are built the same way and
 * differ only in the density they are built from.
 */
import { marchSignedField } from '../utils/march-tetrahedra';
import type { Vec3 } from '../utils/vec3';

const ANGSTROM_PER_BOHR = 0.529177210903;

/** The density the ESP is drawn on (e/bohr³): Bader's 0.001 au, the
 *  convention of the textbook ESP map. */
const ESP_DENSITY_LEVEL = 0.001;
/** How far past the nuclei the density grid reaches (Å): the 0.001 au contour
 *  lies 1.5–2.5 Å out on a neutral molecule, further on an anion. */
const ESP_DENSITY_PAD = 4.0;
/** Grid points at most for the density, and the step for its gradient. */
const ESP_GRID_POINTS = 400_000;
const DENSITY_GRADIENT_STEP_BOHR = 0.02;

/** A box of grid points (Å), x fastest. */
export interface DensityGrid {
  origin: Vec3;
  dimensions: Vec3;
  spacing: number;
  count: number;
}

/** The box around `lo`–`hi` (Å) with at most `maxPoints` points: a spacing of
 *  0.15–0.25 Å, fine enough for a contour, coarse enough for a large molecule. */
export function gridAround(lo: number[], hi: number[], maxPoints: number): DensityGrid {
  const volume = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  const spacing = Math.max(0.15, Math.min(0.25, Math.cbrt(volume / maxPoints)));
  const dimensions = [0, 1, 2].map((c) => Math.ceil((hi[c] - lo[c]) / spacing) + 1) as Vec3;
  return { origin: lo as Vec3, dimensions, spacing, count: dimensions[0] * dimensions[1] * dimensions[2] };
}

/** An engine's view of its charge distribution. Points are flat x, y, z
 *  triples in bohr; densities in e/bohr³; potentials in Eh/e (e/bohr). */
export interface ChargeDistribution {
  densityOnGrid(grid: DensityGrid): Float32Array;
  densityAt(pointsBohr: number[]): number[];
  potentialAt(pointsBohr: number[]): number[];
}

export interface EspSoup {
  /** Triangle soup (Å), in the atoms' coordinates. */
  positions: number[];
  normals: Float32Array;
  /** The exact potential at each vertex, e/Å (the app's unit). */
  potentials: number[];
  vertexCount: number;
}

/** The 0.001 au surface of the distribution around `atoms` (Å), with outward
 *  normals and the potential at each vertex; null when nothing contours. */
export function densitySurface(atoms: Array<{ x: number; y: number; z: number }>, source: ChargeDistribution): EspSoup | null {
  const lo = [0, 1, 2].map((c) => Math.min(...atoms.map((a) => [a.x, a.y, a.z][c])) - ESP_DENSITY_PAD);
  const hi = [0, 1, 2].map((c) => Math.max(...atoms.map((a) => [a.x, a.y, a.z][c])) + ESP_DENSITY_PAD);
  const grid = gridAround(lo, hi, ESP_GRID_POINTS);
  const values = source.densityOnGrid(grid);

  // a density has one sign, so only the positive sheet comes back
  const sheets = marchSignedField({ values, origin: grid.origin, dimensions: grid.dimensions, spacing: grid.spacing },
    ESP_DENSITY_LEVEL, () => [0, 0, 0]);
  const vertexCount = sheets.positions.length / 3;
  if (vertexCount === 0) return null;

  // the soup repeats each point in every triangle that shares it
  const unique = new Map<string, number>();
  const which = new Int32Array(vertexCount);
  const points: number[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const p = sheets.positions.slice(3 * v, 3 * v + 3);
    const id = p.map((x) => x.toFixed(5)).join(',');
    let u = unique.get(id);
    if (u === undefined) {
      u = points.length / 3;
      unique.set(id, u);
      points.push(...p);
    }
    which[v] = u;
  }
  const n = points.length / 3;

  // outward normals: down the density's gradient, by central differences
  const h = DENSITY_GRADIENT_STEP_BOHR;
  const probes: number[] = new Array(18 * n);
  for (let u = 0; u < n; u++) {
    for (let axis = 0; axis < 3; axis++) {
      for (const [slot, sign] of [[0, 1], [1, -1]] as const) {
        const col = 6 * u + 2 * axis + slot;
        for (let c = 0; c < 3; c++) probes[3 * col + c] = points[3 * u + c] / ANGSTROM_PER_BOHR + (c === axis ? sign * h : 0);
      }
    }
  }
  const around = source.densityAt(probes);
  const uniqueNormals: number[] = [];
  for (let u = 0; u < n; u++) {
    const g = [0, 1, 2].map((axis) => around[6 * u + 2 * axis] - around[6 * u + 2 * axis + 1]);
    const length = Math.hypot(g[0], g[1], g[2]) || 1;
    uniqueNormals.push(-g[0] / length, -g[1] / length, -g[2] / length);
  }

  // the exact potential, once per point; Eh/e to the app's e/Å
  const phi = source.potentialAt(points.map((x) => x / ANGSTROM_PER_BOHR));
  const uniquePotentials = phi.map((v) => v / ANGSTROM_PER_BOHR);

  const normals = new Float32Array(3 * vertexCount);
  const potentials: number[] = new Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) normals[3 * v + c] = uniqueNormals[3 * which[v] + c];
    potentials[v] = uniquePotentials[which[v]];
  }
  windAlongNormals(sheets.positions, normals, potentials);
  return { positions: sheets.positions, normals, potentials, vertexCount };
}

/** The marcher winds each triangle by the normal it is handed, and here it is
 *  handed none (the gradients come in one batch, afterwards): wind each
 *  triangle so its face points the way its vertices' normals do. In place;
 *  `carried` holds a value per vertex that must follow the swap. */
export function windAlongNormals(p: number[], normals: Float32Array, carried: number[]): void {
  for (let t = 0; t < p.length / 3; t += 3) {
    const i = 3 * t, j = i + 3, k = i + 6;
    const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2];
    const vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = normals[i] + normals[j] + normals[k];
    const ny = normals[i + 1] + normals[j + 1] + normals[k + 1];
    const nz = normals[i + 2] + normals[j + 2] + normals[k + 2];
    if (fx * nx + fy * ny + fz * nz < 0) {
      for (let c = 0; c < 3; c++) {
        [p[j + c], p[k + c]] = [p[k + c], p[j + c]];
        [normals[j + c], normals[k + c]] = [normals[k + c], normals[j + c]];
      }
      [carried[t + 1], carried[t + 2]] = [carried[t + 2], carried[t + 1]];
    }
  }
}

/** Flat bohr points as an OCC Mat3N, for either engine's module. */
export function occPoints(M: any, pointsBohr: number[]): any {
  const n = pointsBohr.length / 3;
  const at = M.Mat3N.create(n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) at.set(c, i, pointsBohr[3 * i + c]);
  return at;
}

/** The grid's points as an OCC Mat3N (bohr), x fastest. */
export function occGridPoints(M: any, grid: DensityGrid): any {
  const points = M.Mat3N.create(grid.count);
  let index = 0;
  for (let gz = 0; gz < grid.dimensions[2]; gz++) {
    for (let gy = 0; gy < grid.dimensions[1]; gy++) {
      for (let gx = 0; gx < grid.dimensions[0]; gx++) {
        points.set(0, index, (grid.origin[0] + gx * grid.spacing) / ANGSTROM_PER_BOHR);
        points.set(1, index, (grid.origin[1] + gy * grid.spacing) / ANGSTROM_PER_BOHR);
        points.set(2, index, (grid.origin[2] + gz * grid.spacing) / ANGSTROM_PER_BOHR);
        index++;
      }
    }
  }
  return points;
}
