/**
 * The MO isosurface — |ψ| = c, the continuous picture of a molecular orbital.
 *
 * Why: drawing an MO as its individual atomic orbitals is honest and
 * informative (which AO, which phase, how much) but it is not what an orbital
 * *looks* like. A chemist reading an MO expects a surface of constant
 * amplitude, where the atomic character shows as the shape of the lobes and
 * the nodes between them rather than as separate beads on each atom. This
 * module builds that surface from the same coefficients the AO picture uses,
 * so the two views are the same physics and can be switched between freely.
 *
 * Everything is evaluated in the calculation frame, where "pz" means the p
 * orbital along z (see align-principal-axes.ts), and mapped back to the
 * molecule's own coordinates on the way out — the displayed structure is not
 * touched by the choice of frame.
 *
 * The amplitude is the *normalized* Slater-type orbital the overlap integrals
 * are built from (ζ in bohr⁻¹, the Mulliken normalization of slater-overlap.ts
 * and YAeHMOP), because a surface is a statement about relative amplitudes:
 * getting the s-to-p normalization wrong would put the wrong size on every
 * lobe. Both sheets of the MO (ψ = +c and ψ = −c) are extracted in one pass
 * over |ψ|; the sign travels with each vertex so the renderer can paint the
 * two phases.
 *
 * Pure — no Three.js — so the field and the surface are unit-testable.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from './assign-basis';
import { alignToPrincipalAxes } from './align-principal-axes';

/** The coarsest grid spacing (Å) — the caller's preference, used when the
 *  budget does not allow finer. The actual step adapts down from here: see
 *  MAX_EVALUATIONS. */
export const MO_SURFACE_SPACING = 0.25;

/** The finest grid spacing (Å), whatever the budget. Below this the surface
 *  gains nothing a screen can show. */
export const MO_SURFACE_MIN_SPACING = 0.1;

/** Margin around the contributing atoms (Å). */
export const MO_SURFACE_MARGIN = 2.5;

/** Amplitudes evaluated per surface, i.e. grid points × orbitals. The step is
 *  chosen to stay inside this: a small molecule gets a fine grid (water lands
 *  at 0.1 Å, ~30 ms) and a large one a coarser grid rather than a stall. The
 *  facets were the complaint — at 0.25 Å a 1 Å lobe shows a dozen flat faces,
 *  which is what "jagged" was. */
const MAX_EVALUATIONS = 4_000_000;

/** The isovalue as a fraction of the MO's largest amplitude on the grid. A
 *  fraction rather than an absolute value so the pictures are comparable as
 *  the user clicks down the level diagram: every MO is drawn at the same
 *  fraction of its own peak, which is what makes a bonding/antibonding pair
 *  read as a shape difference rather than a size difference. */
export const MO_SURFACE_FRACTION = 0.2;

/** Grid points above which the spacing is coarsened, so a large delocalized
 *  MO cannot stall the frame. */
const MAX_GRID_POINTS = 400_000;

/** 1 Å in bohr — the Slater exponents are in bohr⁻¹. */
const BOHR_PER_ANGSTROM = 1.8897259886;

const FOUR_PI = 4 * Math.PI;
const SQRT_3_OVER_4PI = Math.sqrt(3 / FOUR_PI);
const INV_SQRT_FOUR_PI = 1 / Math.sqrt(FOUR_PI);

export interface MoSurfaceData {
  /** Å, in the molecule's coordinates */
  positions: Float32Array;
  /** outward unit normals (from ∇|ψ|) */
  normals: Float32Array;
  /** +1 / −1 per vertex: which phase sheet the vertex belongs to */
  phases: Float32Array;
  /** number of vertices (3 per triangle) */
  vertexCount: number;
  /** the isovalue actually used */
  isovalue: number;
}

type Vec3 = [number, number, number];

/**
 * ψ and ∇ψ at a point, in the frame's coordinates (Å). The gradient is the
 * analytic one — the normals are what the eye reads as the shape, and a
 * finite difference of the grid would facet it. Exported for the tests, which
 * check it against finite differences and against the known normalization of
 * a 1s Slater orbital.
 */
/**
 * The per-orbital constants, flattened: [x, y, z, zeta, c·norm, ax, ay, az,
 * angular] per contributing AO. The inner loop runs once per grid point per
 * orbital, so the normalization (a power and a factorial) and the coefficient
 * are folded in here rather than recomputed a million times — that alone is
 * the difference between a 150 ms stall and a usable toggle.
 */
export function prepareOrbitals(
  atoms: Molecule['atoms'],
  basis: BasisFunction[],
  coefficients: number[],
): Float64Array {
  const prepared: number[] = [];
  for (let i = 0; i < basis.length; i++) {
    const c = coefficients[i];
    if (c === 0) continue;
    const orbital = basis[i];
    const atom = atoms[orbital.atomIndex];
    // the radial normalization of a Slater orbital, (2ζ)^(n+½)/√((2n)!)
    let factorial = 1;
    for (let k = 2; k <= 2 * orbital.n; k++) factorial *= k;
    const norm = Math.pow(2 * orbital.zeta, orbital.n + 0.5) / Math.sqrt(factorial);
    const angular = orbital.angular === 's' ? 1 : 2;
    prepared.push(
      atom.x, atom.y, atom.z, orbital.zeta, c * norm,
      orbital.axis[0], orbital.axis[1], orbital.axis[2], orbital.n, angular,
    );
  }
  return new Float64Array(prepared);
}

/**
 * ψ and ∇ψ at a point, in the frame's coordinates (Å). The gradient is the
 * analytic one — the normals are what the eye reads as the shape, and a
 * finite difference of the grid would facet it. Exported for the tests, which
 * check it against finite differences and against the known normalization of
 * a 1s Slater orbital.
 */
export function evaluateMo(
  px: number, py: number, pz: number,
  atoms: Molecule['atoms'],
  basis: BasisFunction[],
  coefficients: number[],
  out: { value: number; gx: number; gy: number; gz: number },
): void {
  const prepared = prepareOrbitals(atoms, basis, coefficients);
  evaluatePrepared(px, py, pz, prepared, out);
}

const STRIDE = 10;

/** The hot loop: see prepareOrbitals for the layout. */
export function evaluatePrepared(
  px: number, py: number, pz: number,
  prepared: Float64Array,
  out: { value: number; gx: number; gy: number; gz: number },
): void {
  let value = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;

  for (let i = 0; i < prepared.length; i += STRIDE) {
    const dx = px - prepared[i];
    const dy = py - prepared[i + 1];
    const dz = pz - prepared[i + 2];
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-12) continue;
    const r = Math.sqrt(r2);

    const zeta = prepared[i + 3];
    const scale = prepared[i + 4];
    const n = prepared[i + 8];
    const rb = r * BOHR_PER_ANGSTROM;
    const decay = Math.exp(-zeta * rb);
    // radial part r^(n−1) e^(−ζr) and its derivative — n is 1 or 2 in this
    // basis, so the powers are written out rather than raised
    const rp = n === 1 ? 1 : rb;
    const radial = rp * decay;
    // d/dr [r^(n−1) e^(−ζr)] = r^(n−2)·[(n−1) − ζr]·e^(−ζr); n is 1 or 2 here
    const rpDerivative = n === 1 ? 1 / rb : 1;
    const dRadial = ((n - 1) - zeta * rb) * rpDerivative * decay * BOHR_PER_ANGSTROM;

    // angular part (and its gradient, in Å⁻¹)
    let angular: number;
    let gax = 0;
    let gay = 0;
    let gaz = 0;
    if (prepared[i + 9] === 1) {
      angular = INV_SQRT_FOUR_PI;
    } else {
      const ax = prepared[i + 5];
      const ay = prepared[i + 6];
      const az = prepared[i + 7];
      const dot = dx * ax + dy * ay + dz * az;
      angular = SQRT_3_OVER_4PI * (dot / r);
      // ∇[(d·a)/r] = a/r − d (d·a)/r³
      const along = dot / (r2 * r);
      gax = SQRT_3_OVER_4PI * (ax / r - dx * along);
      gay = SQRT_3_OVER_4PI * (ay / r - dy * along);
      gaz = SQRT_3_OVER_4PI * (az / r - dz * along);
    }

    value += scale * radial * angular;
    const ur = (dRadial * angular) / r;
    gx += scale * (ur * dx + radial * gax);
    gy += scale * (ur * dy + radial * gay);
    gz += scale * (ur * dz + radial * gaz);
  }

  out.value = value;
  out.gx = gx;
  out.gy = gy;
  out.gz = gz;
}

/** The six tetrahedra of a cube, as corner-index quadruples around the
 *  (0,0,0)–(1,1,1) diagonal. The same decomposition in every cube, so
 *  neighbouring cubes agree on their shared faces. */
const TETRAHEDRA: number[][] = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];
const CORNER: number[][] = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

/**
 * Build the MO isosurface. Returns an empty surface (vertexCount 0) when the
 * MO has no amplitude, or when every grid point is below the isovalue.
 */
export function computeMoSurface(
  molecule: Molecule,
  basis: BasisFunction[],
  coefficients: number[],
  spacing = MO_SURFACE_SPACING,
  margin = MO_SURFACE_MARGIN,
  fraction = MO_SURFACE_FRACTION,
): MoSurfaceData {
  const empty: MoSurfaceData = {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    phases: new Float32Array(0),
    vertexCount: 0,
    isovalue: 0,
  };
  if (basis.length === 0 || coefficients.length !== basis.length) return empty;

  // the calculation frame: the same one the solver used, so "pz" here means
  // the same pz the coefficients do
  const frame = alignToPrincipalAxes(molecule);
  const atoms = frame.atoms;

  // bound the grid by the atoms the MO actually uses: a coefficient below the
  // drawing threshold contributes nothing a surface would show, and excluding
  // it keeps a localized MO from paying for the whole molecule
  let largest = 0;
  for (const c of coefficients) largest = Math.max(largest, Math.abs(c));
  if (largest <= 1e-9) return empty;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let contributing = 0;
  for (let i = 0; i < basis.length; i++) {
    if (Math.abs(coefficients[i]) / largest < 0.02) continue;
    contributing++;
    const atom = atoms[basis[i].atomIndex];
    if (atom.x < minX) minX = atom.x; if (atom.x > maxX) maxX = atom.x;
    if (atom.y < minY) minY = atom.y; if (atom.y > maxY) maxY = atom.y;
    if (atom.z < minZ) minZ = atom.z; if (atom.z > maxZ) maxZ = atom.z;
  }
  if (contributing === 0) return empty;

  const prepared = prepareOrbitals(atoms, basis, coefficients);

  minX -= margin; minY -= margin; minZ -= margin;
  maxX += margin; maxY += margin; maxZ += margin;

  // Choose the step from the budget rather than fixing it: a small molecule
  // can afford a fine grid, and its lobes are small enough that a coarse one
  // looks faceted. Never finer than MIN_SPACING, never coarser than the
  // caller's preference.
  const volume = (maxX - minX) * (maxY - minY) * (maxZ - minZ);
  const orbitals = Math.max(1, prepared.length / STRIDE);
  const budget = Math.max(20_000, MAX_EVALUATIONS / orbitals);
  let step = Math.min(spacing, Math.max(MO_SURFACE_MIN_SPACING, Math.cbrt(volume / budget)));
  for (let guard = 0; guard < 8; guard++) {
    const nx = Math.ceil((maxX - minX) / step) + 1;
    const ny = Math.ceil((maxY - minY) / step) + 1;
    const nz = Math.ceil((maxZ - minZ) / step) + 1;
    if (nx * ny * nz <= MAX_GRID_POINTS) break;
    step *= 1.35;
  }
  const nx = Math.ceil((maxX - minX) / step) + 1;
  const ny = Math.ceil((maxY - minY) / step) + 1;
  const nz = Math.ceil((maxZ - minZ) / step) + 1;

  // ψ on the grid — signed, because the phase of each sheet is read from it —
  // plus the gradient, which the normals need and which is cheaper to keep
  // than to recompute at every crossing
  const count = nx * ny * nz;
  const field = new Float32Array(count);
  const gradient = new Float32Array(count * 3);
  const probe = { value: 0, gx: 0, gy: 0, gz: 0 };
  let peak = 0;
  for (let gz = 0; gz < nz; gz++) {
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        evaluatePrepared(minX + gx * step, minY + gy * step, minZ + gz * step, prepared, probe);
        const index = gx + gy * nx + gz * nx * ny;
        field[index] = probe.value;
        gradient[index * 3] = probe.gx;
        gradient[index * 3 + 1] = probe.gy;
        gradient[index * 3 + 2] = probe.gz;
        peak = Math.max(peak, Math.abs(probe.value));
      }
    }
  }
  const isovalue = peak * fraction;
  if (isovalue <= 0) return empty;

  const positions: number[] = [];
  const normals: number[] = [];
  const phases: number[] = [];

  // Scratch for one tetrahedron and its crossings, allocated once: the
  // extraction visits a million of them on a fine grid, and a per-tet object
  // or closure was most of the cost.
  const cx = new Float64Array(4);
  const cy = new Float64Array(4);
  const cz = new Float64Array(4);
  const cf = new Float64Array(4); // |ψ|
  const cSigned = new Float64Array(4); // ψ, for the phase
  const px = new Float64Array(4);
  const py = new Float64Array(4);
  const pz = new Float64Array(4);
  const pSign = new Float64Array(4);

  /** ∇ψ at a point, trilinear interpolation of the stored grid gradients —
   *  smooth, and consistent with the field the crossings came from. */
  function gradientAt(x: number, y: number, z: number, out: Vec3): void {
    const fx = (x - minX) / step;
    const fy = (y - minY) / step;
    const fz = (z - minZ) / step;
    const x0 = Math.min(nx - 1, Math.max(0, Math.floor(fx)));
    const y0 = Math.min(ny - 1, Math.max(0, Math.floor(fy)));
    const z0 = Math.min(nz - 1, Math.max(0, Math.floor(fz)));
    const x1 = Math.min(nx - 1, x0 + 1);
    const y1 = Math.min(ny - 1, y0 + 1);
    const z1 = Math.min(nz - 1, z0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    for (let k = 0; k < 3; k++) {
      const at = (i: number, j: number, l: number) => gradient[(i + j * nx + l * nx * ny) * 3 + k];
      const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
      const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
      const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
      const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
      out[k] = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    }
  }

  const geometric: Vec3 = [0, 0, 0];
  const midGradient: Vec3 = [0, 0, 0];

  /** Append one triangle of crossings a, b, c (indices into the scratch). */
  function emit(a: number, b: number, c: number): void {
    // the geometric normal of the winding; if it disagrees with the outward
    // direction (the sign of ∇|ψ|, which is sign(ψ)·∇ψ) two vertices are
    // swapped — cheaper and more robust than a per-case winding table
    const abx = px[b] - px[a], aby = py[b] - py[a], abz = pz[b] - pz[a];
    const acx = px[c] - px[a], acy = py[c] - py[a], acz = pz[c] - pz[a];
    const gx = aby * acz - abz * acy;
    const gy = abz * acx - abx * acz;
    const gz = abx * acy - aby * acx;
    gradientAt((px[a] + px[b] + px[c]) / 3, (py[a] + py[b] + py[c]) / 3, (pz[a] + pz[b] + pz[c]) / 3, midGradient);
    const swap = gx * midGradient[0] + gy * midGradient[1] + gz * midGradient[2] < 0;
    const order = swap ? [a, c, b] : [a, b, c];
    for (const v of order) {
      positions.push(px[v], py[v], pz[v]);
      gradientAt(px[v], py[v], pz[v], geometric);
      const length = Math.hypot(geometric[0], geometric[1], geometric[2]) || 1;
      const sign = pSign[v];
      normals.push((sign * geometric[0]) / length, (sign * geometric[1]) / length, (sign * geometric[2]) / length);
      phases.push(sign);
    }
  }

  const EDGE: number[][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  for (let gz = 0; gz < nz - 1; gz++) {
    for (let gy = 0; gy < ny - 1; gy++) {
      for (let gx = 0; gx < nx - 1; gx++) {
        for (const tet of TETRAHEDRA) {
          let mask = 0;
          for (let c = 0; c < 4; c++) {
            const corner = tet[c];
            const index = (gx + CORNER[corner][0]) + (gy + CORNER[corner][1]) * nx + (gz + CORNER[corner][2]) * nx * ny;
            const signed = field[index];
            const magnitude = Math.abs(signed);
            cx[c] = minX + (gx + CORNER[corner][0]) * step;
            cy[c] = minY + (gy + CORNER[corner][1]) * step;
            cz[c] = minZ + (gz + CORNER[corner][2]) * step;
            cf[c] = magnitude;
            cSigned[c] = signed;
            if (magnitude > isovalue) mask |= 1 << c;
          }
          if (mask === 0 || mask === 15) continue;

          let crossings = 0;
          for (const [i, j] of EDGE) {
            const insideI = (mask >> i) & 1;
            const insideJ = (mask >> j) & 1;
            if (insideI === insideJ) continue;
            const denom = cf[j] - cf[i];
            const t = denom === 0 ? 0.5 : (isovalue - cf[i]) / denom;
            px[crossings] = cx[i] + t * (cx[j] - cx[i]);
            py[crossings] = cy[i] + t * (cy[j] - cy[i]);
            pz[crossings] = cz[i] + t * (cz[j] - cz[i]);
            pSign[crossings] = cSigned[i] + t * (cSigned[j] - cSigned[i]) >= 0 ? 1 : -1;
            crossings++;
          }
          if (crossings === 3) {
            emit(0, 1, 2);
          } else if (crossings === 4) {
            // the quad in edge order (a-c, a-d, b-d, b-c for inside a,b)
            emit(0, 1, 3);
            emit(0, 3, 2);
          }
          // 6 crossings would mean a degenerate tet; the 6-tet decomposition
          // cannot produce one, and emitting nothing keeps the mesh closed
        }
      }
    }
  }

  // back to the molecule's coordinates: the frame is a rotation about the
  // centre of mass, so undo both
  const [ax, ay, az] = frame.axes;
  const world = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    world[i] = frame.origin[0] + x * ax[0] + y * ay[0] + z * az[0];
    world[i + 1] = frame.origin[1] + x * ax[1] + y * ay[1] + z * az[1];
    world[i + 2] = frame.origin[2] + x * ax[2] + y * ay[2] + z * az[2];
  }
  const worldNormals = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];
    worldNormals[i] = x * ax[0] + y * ay[0] + z * az[0];
    worldNormals[i + 1] = x * ax[1] + y * ay[1] + z * az[1];
    worldNormals[i + 2] = x * ax[2] + y * ay[2] + z * az[2];
  }

  return {
    positions: world,
    normals: worldNormals,
    phases: new Float32Array(phases),
    vertexCount: positions.length / 3,
    isovalue,
  };
}
