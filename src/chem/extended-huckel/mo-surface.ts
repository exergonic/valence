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
 * and YAeHMOP): (2ζ)^(n+½)/√((2n)!) · r^(n−1) e^(−ζr) · Y, with that
 * orbital's own principal quantum number. The basis runs from 1s (hydrogen)
 * to 5p (iodine); a radial power written out for n ≤ 2 collapses every
 * heavier lobe onto the nucleus. The contour is a fraction of each atomic
 * orbital's own peak: the normalized peak falls as the shell gets larger, and
 * a fixed |ψ| that draws fluorine draws nothing on iodine. Both sheets
 * (ψ = +c and ψ = −c) are extracted separately, so an edge that straddles a
 * node cannot fuse the two lobes. The sign travels with each vertex so the
 * renderer can paint the two phases.
 *
 * Pure — no Three.js — so the field and the surface are unit-testable.
 */
import type { Molecule } from '../../mol-parser';
import type { BasisFunction } from './assign-basis';
import { alignToPrincipalAxes } from './align-principal-axes';
import { BOHR_RADIUS } from './slater-overlap';
import { D_FUNCTIONS } from './assign-basis';
import { slaterTerms } from './parameters';

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
 *  at 0.1 Å) and a large one a coarser grid rather than a stall. Measured
 *  2026-09-30, whole-surface extraction: 100 ms on water, 300-950 ms on
 *  benzene, PCl₅ and I₂ — the cost tracks the vertex count, and it is paid
 *  once per orbital because the renderer caches. The facets were the
 *  complaint — at 0.25 Å a 1 Å lobe shows a dozen flat faces, which is what
 *  "jagged" was. */
const MAX_EVALUATIONS = 4_000_000;

/**
 * The isovalue, as a fraction of a full atomic orbital's own peak.
 *
 * The surface is not drawn at a fixed |ψ|. A normalized Slater orbital's peak
 * falls as the shell spreads out — fluorine 2p reaches ~0.78, iodine 5p ~0.19,
 * a potassium 4s ~0.035 — so one absolute contour that sits inside a 2p lies
 * above a 5p entirely, and the heavy atom's lobe never appears. Each basis
 * function is divided by its own peak before the contour is taken (see
 * `prepareOrbitals`), and the number here is that fraction: 0.04 draws the
 * outer part of every shell, 0.30 only its core. The same setting then shows
 * a hydrogen and an iodine.
 */
export const MO_SURFACE_ISOVALUE = 0.04;

/**
 * The localized picture's own default. It sits higher than the MO default
 * because a localized orbital is concentrated on one or two atoms and so is
 * drawn oversized at the MO level; and lower than a single bond would like,
 * because a level that shrinks a σ bond nicely also strips the outer carbons
 * off a delocalized ring orbital. NOTES.md has the measurements behind both.
 */
export const LOCALIZED_ISOVALUE = 0.1;

/** The levels the panel offers. */
export const MO_SURFACE_ISOVALUES = [0.02, 0.03, 0.04, 0.06, 0.1, 0.2, 0.3];

/** Grid points above which the spacing is coarsened, so a large delocalized
 *  MO cannot stall the frame. */
const MAX_GRID_POINTS = 400_000;

/** 1 Å in bohr — the same radius the overlap integrals use, so a lobe and
 *  the S matrix are measured in one unit. */
const BOHR_PER_ANGSTROM = 1 / BOHR_RADIUS;

const FOUR_PI = 4 * Math.PI;
const SQRT_3_OVER_4PI = Math.sqrt(3 / FOUR_PI);
// the normalized real d harmonics' prefactors (∫|Y|² dΩ = 1)
const SQRT_15_OVER_16PI = Math.sqrt(15 / (16 * Math.PI));
const SQRT_5_OVER_16PI = Math.sqrt(5 / (16 * Math.PI));
const SQRT_15_OVER_4PI = Math.sqrt(15 / (4 * Math.PI));
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
 * The per-orbital constants, flattened: [x, y, z, zeta, c·norm, ax, ay, az,
 * angular] per contributing AO. The inner loop runs once per grid point per
 * orbital, so the normalization (a power and a factorial) and the coefficient
 * are folded in here rather than recomputed a million times — that alone is
 * the difference between a 150 ms stall and a usable toggle.
 *
 * `unitPeak` divides each AO by the maximum of |χ| at coefficient 1. The
 * overlap integrals need the true normalization; the picture does not. Without
 * that division a coefficient of 1 on iodine peaks at a quarter of the same
 * coefficient on fluorine, and the isovalue that draws the fluorine deletes
 * the iodine. Both terms of a contracted d share one peak — the maximum of
 * the sum, which is the orbital the basis actually contains.
 */
export function prepareOrbitals(
  atoms: Molecule['atoms'],
  basis: BasisFunction[],
  coefficients: number[],
  unitPeak = false,
): Float64Array {
  const prepared: number[] = [];
  for (let i = 0; i < basis.length; i++) {
    const c = coefficients[i];
    if (c === 0) continue;
    const orbital = basis[i];
    const atom = atoms[orbital.atomIndex];
    // 1 = s, 2 = p (with the axis), 3..7 = the five real d functions in
    // D_FUNCTIONS order. The d kind rides in the same slot the flag used, so
    // the hot loop's stride is unchanged.
    const angular = orbital.angular === 's'
      ? 1
      : orbital.angular === 'p' ? 2 : 3 + D_FUNCTIONS.indexOf(orbital.d!);
    const peak = unitPeak ? aoPeakAmplitude(orbital) : 1;
    // One entry per Slater term: a contracted d contributes two, and the
    // evaluator's sum over entries is the sum over ζ for free.
    for (const term of slaterTerms(orbital)) {
      let factorial = 1;
      for (let k = 2; k <= 2 * orbital.n; k++) factorial *= k;
      const norm = Math.pow(2 * term.zeta, orbital.n + 0.5) / Math.sqrt(factorial);
      prepared.push(
        atom.x, atom.y, atom.z, term.zeta, c * term.coefficient * norm / peak,
        orbital.axis[0], orbital.axis[1], orbital.axis[2], orbital.n, angular,
      );
    }
  }
  return new Float64Array(prepared);
}

/** Where a shell's |χ| is largest: along its lobe, or anywhere for an s. */
function lobeDirection(orbital: BasisFunction): [number, number, number] {
  if (orbital.angular === 'p') return orbital.axis;
  if (orbital.angular !== 'd') return [0, 0, 1];
  const h = Math.SQRT1_2;
  switch (orbital.d) {
    case 'z2': return [0, 0, 1];
    case 'x2-y2': return [1, 0, 0];
    case 'xy': return [h, h, 0];
    case 'xz': return [h, 0, h];
    default: return [0, h, h];
  }
}

const peakCache = new Map<string, number>();

/**
 * The maximum of |χ| for this basis function at coefficient 1, in the same
 * units `evaluateMo` returns. Cached per shell: every carbon 2p in a molecule
 * is the same number, and the surface divides by it.
 */
export function aoPeakAmplitude(orbital: BasisFunction): number {
  const key = [
    orbital.n, orbital.angular, orbital.d ?? '',
    orbital.zeta, orbital.zeta2 ?? '', orbital.coefficients?.join(',') ?? '',
  ].join('|');
  const cached = peakCache.get(key);
  if (cached !== undefined) return cached;

  const prepared = prepareOrbitals(
    [{ element: 'X', x: 0, y: 0, z: 0, charge: 0 }],
    [{ ...orbital, atomIndex: 0 }],
    [1],
  );
  const [dx, dy, dz] = lobeDirection(orbital);
  const probe = { value: 0, gx: 0, gy: 0, gz: 0 };
  let peak = 0;
  let rPeak = 0;
  // 0.01 Å is fine on the scale of 1/ζ; a second pass tightens the sample.
  for (let i = 0; i <= 500; i++) {
    const r = i * 0.01;
    evaluatePrepared(r * dx, r * dy, r * dz, prepared, probe);
    const amplitude = Math.abs(probe.value);
    if (amplitude > peak) { peak = amplitude; rPeak = r; }
  }
  for (let i = -20; i <= 20; i++) {
    const r = Math.max(0, rPeak + i * 0.0005);
    evaluatePrepared(r * dx, r * dy, r * dz, prepared, probe);
    peak = Math.max(peak, Math.abs(probe.value));
  }
  // a vanished shell must not turn the coefficient into an infinity
  if (peak < 1e-12) peak = 1;
  peakCache.set(key, peak);
  return peak;
}

/** How far from its nucleus this AO stays above the display isovalue (Å).
 *  The grid's margin has to reach it, or a diffuse shell is clipped open
 *  while a compact one still fits in the old fixed pad. */
function lobeReach(orbital: BasisFunction, coefficient: number, isovalue: number): number {
  const prepared = prepareOrbitals(
    [{ element: 'X', x: 0, y: 0, z: 0, charge: 0 }],
    [{ ...orbital, atomIndex: 0 }],
    [coefficient],
    true,
  );
  const [dx, dy, dz] = lobeDirection(orbital);
  const probe = { value: 0, gx: 0, gy: 0, gz: 0 };
  let outer = 0;
  for (let i = 0; i <= 800; i++) {
    const r = i * 0.01;
    evaluatePrepared(r * dx, r * dy, r * dz, prepared, probe);
    if (Math.abs(probe.value) >= isovalue) outer = r;
  }
  return outer;
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
    const zeta = prepared[i + 3];
    const scale = prepared[i + 4];
    const n = prepared[i + 8];
    const code = prepared[i + 9];
    const isS = code === 1;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-12) {
      // Exactly at the nucleus. A 1s is *finite* there — it peaks there — and
      // treating it as zero (as a plain `continue` did) puts a spurious little
      // sphere at every hydrogen: the field dips below the isovalue at a point
      // the surface should enclose. Higher s orbitals and every p vanish at
      // the point, and their gradients are bounded, so they are left out.
      if (n === 1 && isS) value += scale * INV_SQRT_FOUR_PI;
      continue;
    }
    const r = Math.sqrt(r2);
    const rb = r * BOHR_PER_ANGSTROM;
    const decay = Math.exp(-zeta * rb);
    // r^(n−1) e^(−ζr). Multiplies, not Math.pow: this runs once per grid
    // point per orbital, and a general power was the 150 ms stall. n is
    // 1 through 5; stopping at "1 or r" is what ate the halogen lobes.
    let rp = 1;
    for (let k = 1; k < n; k++) rp *= rb;
    const radial = rp * decay;
    // d/dr_bohr [r^(n−1) e^(−ζr)] = r^(n−2)·[(n−1) − ζr]·e^(−ζr).
    // For n = 1 the r^(−1) cancels the ζr and leaves −ζ e^(−ζr).
    const rToTheNm2 = n === 1 ? 1 / rb : rp / rb;
    const dRadial = rToTheNm2 * ((n - 1) - zeta * rb) * decay * BOHR_PER_ANGSTROM;

    // angular part (and its gradient, in Å⁻¹)
    let angular: number;
    let gax = 0;
    let gay = 0;
    let gaz = 0;
    if (code === 1) {
      angular = INV_SQRT_FOUR_PI;
    } else if (code === 2) {
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
    } else {
      // A real d function, normalized: N_k · f_k(d)/r², with f_k the Cartesian
      // numerator. The gradient follows from f being homogeneous of degree 2:
      // ∇[f/r²] = ∇f/r² − 2 f d/r⁴.
      const kind = code - 3;
      let f: number;
      let gfx: number;
      let gfy: number;
      let gfz: number;
      let scaleAngular: number;
      switch (kind) {
        case 0: // x²−y²
          f = dx * dx - dy * dy; gfx = 2 * dx; gfy = -2 * dy; gfz = 0;
          scaleAngular = SQRT_15_OVER_16PI;
          break;
        case 1: // z² ∝ 3z²−r² = 2z²−x²−y²
          f = 2 * dz * dz - dx * dx - dy * dy; gfx = -2 * dx; gfy = -2 * dy; gfz = 4 * dz;
          scaleAngular = SQRT_5_OVER_16PI;
          break;
        case 2: // xy
          f = dx * dy; gfx = dy; gfy = dx; gfz = 0;
          scaleAngular = SQRT_15_OVER_4PI;
          break;
        case 3: // xz
          f = dx * dz; gfx = dz; gfy = 0; gfz = dx;
          scaleAngular = SQRT_15_OVER_4PI;
          break;
        default: // yz
          f = dy * dz; gfx = 0; gfy = dz; gfz = dy;
          scaleAngular = SQRT_15_OVER_4PI;
          break;
      }
      const inv2 = 1 / r2;
      const inv4 = inv2 * inv2;
      angular = scaleAngular * f * inv2;
      gax = scaleAngular * (gfx * inv2 - 2 * f * dx * inv4);
      gay = scaleAngular * (gfy * inv2 - 2 * f * dy * inv4);
      gaz = scaleAngular * (gfz * inv2 - 2 * f * dz * inv4);
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
  isovalue = MO_SURFACE_ISOVALUE,
  spacing = MO_SURFACE_SPACING,
  margin = MO_SURFACE_MARGIN,
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

  // Display scale: each AO divided by its own peak, so the isovalue is a
  // fraction of a full shell and means the same thing on every element.
  const prepared = prepareOrbitals(atoms, basis, coefficients, true);

  // The fixed pad is enough for a first-row atom. A diffuse shell at the same
  // fraction extends further, and clipping it leaves the mesh open.
  let pad = margin;
  for (let i = 0; i < basis.length; i++) {
    if (Math.abs(coefficients[i]) / largest < 0.02) continue;
    pad = Math.max(pad, lobeReach(basis[i], coefficients[i], isovalue) + 0.5);
  }
  pad = Math.min(pad, 8);

  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

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

  // ψ on the grid — signed, because the phase of each sheet is read from it.
  // Normals come from the analytic gradient at each vertex. A gradient
  // interpolated off this grid points the wrong way on a shallow sheet, and
  // storing one per grid point was a several-megabyte array for no gain.
  const count = nx * ny * nz;
  const field = new Float32Array(count);
  const probe = { value: 0, gx: 0, gy: 0, gz: 0 };
  for (let gz = 0; gz < nz; gz++) {
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        evaluatePrepared(minX + gx * step, minY + gy * step, minZ + gz * step, prepared, probe);
        const index = gx + gy * nx + gz * nx * ny;
        field[index] = probe.value;
      }
    }
  }
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
  const cSigned = new Float64Array(4); // ψ
  const px = new Float64Array(4);
  const py = new Float64Array(4);
  const pz = new Float64Array(4);
  const pSign = new Float64Array(4);

  /** The outward unit normal at a point: the analytic ∇ψ, negated for the
   *  negative sheet. Exact where a grid-interpolated gradient is not — see the
   *  note on the field array above. */
  function outwardAt(x: number, y: number, z: number, sign: number): Vec3 {
    evaluatePrepared(x, y, z, prepared, probe);
    const length = Math.hypot(probe.gx, probe.gy, probe.gz) || 1;
    const outward = -sign;
    return [(outward * probe.gx) / length, (outward * probe.gy) / length, (outward * probe.gz) / length];
  }

  /** Append one triangle of crossings a, b, c (indices into the scratch). */
  function emit(a: number, b: number, c: number): void {
    const abx = px[b] - px[a], aby = py[b] - py[a], abz = pz[b] - pz[a];
    const acx = px[c] - px[a], acy = py[c] - py[a], acz = pz[c] - pz[a];
    const gx = aby * acz - abz * acy;
    const gy = abz * acx - abx * acz;
    const gz = abx * acy - aby * acx;
    // all three crossings lie on one sheet, so one sign covers the triangle
    const mid = outwardAt((px[a] + px[b] + px[c]) / 3, (py[a] + py[b] + py[c]) / 3, (pz[a] + pz[b] + pz[c]) / 3, pSign[a]);
    const swap = gx * mid[0] + gy * mid[1] + gz * mid[2] < 0;
    const order = swap ? [a, c, b] : [a, b, c];
    for (const v of order) {
      const normal = outwardAt(px[v], py[v], pz[v], pSign[v]);
      positions.push(px[v], py[v], pz[v]);
      normals.push(normal[0], normal[1], normal[2]);
      phases.push(pSign[v]);
    }
  }

  const EDGE: number[][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

  // One pass per phase sheet, on the signed field. Marching |ψ| instead looks
  // the same until a grid edge straddles the node with both samples above the
  // contour: |ψ| is then "inside" at both ends, the dip through zero is
  // invisible, and the two lobes fuse. ψ = +c and ψ = −c each cross that edge
  // once, and the gap between them stays empty.
  for (const positive of [true, false]) {
    const level = positive ? isovalue : -isovalue;
    for (let gz = 0; gz < nz - 1; gz++) {
      for (let gy = 0; gy < ny - 1; gy++) {
        for (let gx = 0; gx < nx - 1; gx++) {
          for (const tet of TETRAHEDRA) {
            let mask = 0;
            for (let c = 0; c < 4; c++) {
              const corner = tet[c];
              const index = (gx + CORNER[corner][0]) + (gy + CORNER[corner][1]) * nx + (gz + CORNER[corner][2]) * nx * ny;
              const signed = field[index];
              cx[c] = minX + (gx + CORNER[corner][0]) * step;
              cy[c] = minY + (gy + CORNER[corner][1]) * step;
              cz[c] = minZ + (gz + CORNER[corner][2]) * step;
              cSigned[c] = signed;
              const inside = positive ? signed > isovalue : signed < -isovalue;
              if (inside) mask |= 1 << c;
            }
            if (mask === 0 || mask === 15) continue;

            let crossings = 0;
            for (const [i, j] of EDGE) {
              const insideI = (mask >> i) & 1;
              const insideJ = (mask >> j) & 1;
              if (insideI === insideJ) continue;
              const denom = cSigned[j] - cSigned[i];
              const t = denom === 0 ? 0.5 : (level - cSigned[i]) / denom;
              px[crossings] = cx[i] + t * (cx[j] - cx[i]);
              py[crossings] = cy[i] + t * (cy[j] - cy[i]);
              pz[crossings] = cz[i] + t * (cz[j] - cz[i]);
              pSign[crossings] = positive ? 1 : -1;
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
