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

/** Grid spacing (Å) and the margin (Å) around the contributing atoms. */
export const MO_SURFACE_SPACING = 0.25;
export const MO_SURFACE_MARGIN = 2.5;

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

  minX -= margin; minY -= margin; minZ -= margin;
  maxX += margin; maxY += margin; maxZ += margin;

  // coarsen rather than stall: a large delocalized MO gets a bigger step
  let step = spacing;
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
  const prepared = prepareOrbitals(atoms, basis, coefficients);
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

  const cornerPosition = (gx: number, gy: number, gz: number, corner: number): Vec3 => [
    minX + (gx + CORNER[corner][0]) * step,
    minY + (gy + CORNER[corner][1]) * step,
    minZ + (gz + CORNER[corner][2]) * step,
  ];

  // a crossing on an edge of the |ψ| field: the sign tells which sheet
  const crossing = (
    u: Vec3, fu: number, su: number, v: Vec3, fv: number, sv: number,
  ): { p: Vec3; sign: number } => {
    // |ψ| = isovalue between the two corners. (The zero-crossing form
    // fu/(fu−fv) is for a field crossing zero — the ESP's — and extrapolates
    // every vertex outside the grid here.)
    const denom = fv - fu;
    const t = denom === 0 ? 0.5 : (isovalue - fu) / denom;
    // the phase is the sign of the *signed* ψ interpolated to the crossing,
    // not the sign of the |ψ| the marching runs on
    return {
      p: [u[0] + t * (v[0] - u[0]), u[1] + t * (v[1] - u[1]), u[2] + t * (v[2] - u[2])],
      sign: su + t * (sv - su) >= 0 ? 1 : -1,
    };
  };

  const emit = (a: { p: Vec3; sign: number }, b: { p: Vec3; sign: number }, c: { p: Vec3; sign: number }) => {
    // the geometric normal of the winding; if it disagrees with the outward
    // direction (the sign of ∇|ψ|, which is sign(ψ)·∇ψ) the two vertices are
    // swapped — cheaper and more robust than a per-case winding table
    const ab: Vec3 = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]];
    const ac: Vec3 = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const nx3 = ab[1] * ac[2] - ab[2] * ac[1];
    const ny3 = ab[2] * ac[0] - ab[0] * ac[2];
    const nz3 = ab[0] * ac[1] - ab[1] * ac[0];
    const mid: Vec3 = [(a.p[0] + b.p[0] + c.p[0]) / 3, (a.p[1] + b.p[1] + c.p[1]) / 3, (a.p[2] + b.p[2] + c.p[2]) / 3];
    const outward = gradientAt(mid);
    const swap = nx3 * outward[0] + ny3 * outward[1] + nz3 * outward[2] < 0;
    const order = swap ? [a, c, b] : [a, b, c];
    for (const vertex of order) {
      positions.push(vertex.p[0], vertex.p[1], vertex.p[2]);
      const g = gradientAt(vertex.p);
      const length = Math.hypot(g[0], g[1], g[2]) || 1;
      const s = vertex.sign;
      normals.push((s * g[0]) / length, (s * g[1]) / length, (s * g[2]) / length);
      phases.push(s);
    }
  };

  /** ∇ψ at a point by trilinear interpolation of the stored grid gradients —
   *  smooth, and consistent with the field the crossings came from. */
  function gradientAt(p: Vec3): Vec3 {
    const fx = (p[0] - minX) / step;
    const fy = (p[1] - minY) / step;
    const fz = (p[2] - minZ) / step;
    const x0 = Math.min(nx - 1, Math.max(0, Math.floor(fx)));
    const y0 = Math.min(ny - 1, Math.max(0, Math.floor(fy)));
    const z0 = Math.min(nz - 1, Math.max(0, Math.floor(fz)));
    const x1 = Math.min(nx - 1, x0 + 1);
    const y1 = Math.min(ny - 1, y0 + 1);
    const z1 = Math.min(nz - 1, z0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const tz = fz - z0;
    const out: Vec3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const at = (i: number, j: number, l: number) => gradient[(i + j * nx + l * nx * ny) * 3 + k];
      const c00 = at(x0, y0, z0) * (1 - tx) + at(x1, y0, z0) * tx;
      const c10 = at(x0, y1, z0) * (1 - tx) + at(x1, y1, z0) * tx;
      const c01 = at(x0, y0, z1) * (1 - tx) + at(x1, y0, z1) * tx;
      const c11 = at(x0, y1, z1) * (1 - tx) + at(x1, y1, z1) * tx;
      out[k] = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
    }
    return out;
  }




  for (let gz = 0; gz < nz - 1; gz++) {
    for (let gy = 0; gy < ny - 1; gy++) {
      for (let gx = 0; gx < nx - 1; gx++) {
        for (const tet of TETRAHEDRA) {
          const corners = tet.map((corner) => {
            const index = (gx + CORNER[corner][0]) + (gy + CORNER[corner][1]) * nx + (gz + CORNER[corner][2]) * nx * ny;
            const signed = field[index];
            return { p: cornerPosition(gx, gy, gz, corner), f: Math.abs(signed), s: signed };
          });
          const inside = corners.map((c) => c.f > isovalue);
          const insideCount = inside.filter(Boolean).length;
          if (insideCount === 0 || insideCount === 4) continue;

          const edges: Array<[number, number]> = [];
          for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) if (inside[i] !== inside[j]) edges.push([i, j]);
          }
          const points = edges.map(([i, j]) =>
            crossing(corners[i].p, corners[i].f, corners[i].s, corners[j].p, corners[j].f, corners[j].s));
          if (points.length === 3) {
            emit(points[0], points[1], points[2]);
          } else if (points.length === 4) {
            // the quad in edge order (a-c, a-d, b-d, b-c for inside a,b)
            emit(points[0], points[1], points[3]);
            emit(points[0], points[3], points[2]);
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
