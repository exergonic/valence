/**
 * The valence-virtual space: the empty orbitals a Lewis structure has room
 * for (σ*, π*, an empty p), and nothing else.
 *
 * A minimal basis has no other kind of empty orbital, so its canonical
 * virtuals are the valence virtuals as they stand. A basis with a
 * POLARIZATION d (GFN2-xTB and extended Hückel's ICON8 on Si, P, S, Cl;
 * GFN2 on the heavier main group) has more: PCl₅'s canonical virtuals are
 * 34, and localized they came out as 9 σ*-like orbitals and 25 "(virt)" rows
 * of d — read in a lesson as d orbitals taking part in hypervalent bonding,
 * which is the old misconception.
 *
 * The fix is Knizia's intrinsic atomic orbitals (J. Chem. Theory Comput. 9,
 * 4834 (2013)), the step avo_ibo takes. The reference minimal basis is the
 * calculation's own s and p functions (a d-block atom keeps its d, which is
 * its valence shell). The occupied orbitals are projected onto it and
 * re-orthonormalized ("depolarized"); with O and Õ the projectors on the true
 * and the depolarized occupied space, each reference function e gives the IAO
 *
 *     a = O Õ e + (1 − O)(1 − Õ) e
 *
 * The IAOs span the occupied space exactly, and the rest of their span is
 * the valence-virtual space: n_minimal − n_occupied orbitals. PCl₅ keeps 4,
 * SF₆ 4 (the a₁g and t₁u σ*). Where the basis is already minimal (H–Ne,
 * everything extended Hückel treats without d) the reference is the whole
 * basis, the IAOs are the AOs, and the canonical virtuals come back as they
 * were.
 */
import { jacobiSymmetric } from '../../utils/eigen';
import { isDBlock } from '../elements';
import type { OrbitalSpace } from './localize-pm';

/**
 * The valence-virtual orbitals of a space, S-orthonormal and orthogonal to its
 * occupied orbitals, as AO coefficient rows. They are a basis for the space,
 * not localized: Pipek–Mezey does that next. The canonical virtuals when the
 * basis is already minimal, or when the projection cannot be made.
 */
export function valenceVirtuals(space: OrbitalSpace, elements: string[]): number[][] {
  const { basis, overlap: S, coefficients, occupied } = space;
  const n = basis.length;
  const canonical = coefficients.slice(occupied).map((row) => row.slice());
  // the reference minimal basis: s and p, and the d of the d block
  const minimal = basis.flatMap((f, mu) => (f.angular !== 'd' || isDBlock(elements[f.atomIndex]) ? [mu] : []));
  if (minimal.length === n || minimal.length <= occupied) return canonical;
  const occupiedRows = coefficients.slice(0, occupied);

  const times = (v: number[]) => S.map((row) => dot(row, v));
  /** Σ_k c_k (c_kᵀ S v): the projector on an S-orthonormal set, applied to v. */
  const project = (set: number[][], v: number[]) => {
    const sv = times(v);
    const out = new Array<number>(n).fill(0);
    for (const c of set) {
      const w = dot(c, sv);
      for (let mu = 0; mu < n; mu++) out[mu] += w * c[mu];
    }
    return out;
  };

  // depolarize: each occupied orbital's projection onto the minimal functions,
  // x = S₂₂⁻¹ S₂₁ c, then the set orthonormalized again
  const S22inverse = symmetricPower(minimal.map((i) => minimal.map((j) => S[i][j])), -1);
  if (!S22inverse) return canonical;
  const depolarized = orthonormalize(occupiedRows.map((c) => {
    const S21c = minimal.map((i) => dot(S[i], c));
    const x = S22inverse.map((row) => dot(row, S21c));
    const v = new Array<number>(n).fill(0);
    minimal.forEach((mu, k) => { v[mu] = x[k]; });
    return v;
  }), S);
  if (!depolarized) return canonical;

  // the IAOs, then what of their span the occupied space does not hold
  const outsideOccupied = minimal.map((mu) => {
    const e = new Array<number>(n).fill(0);
    e[mu] = 1;
    const depolarizedPart = project(depolarized, e);
    const rest = e.map((x, nu) => x - depolarizedPart[nu]);
    const restInside = project(occupiedRows, rest);
    const iao = project(occupiedRows, depolarizedPart).map((x, nu) => x + rest[nu] - restInside[nu]);
    const inside = project(occupiedRows, iao);
    return iao.map((x, nu) => x - inside[nu]);
  });

  // that span has n_minimal − n_occupied dimensions; the Gram matrix's other
  // eigenvalues are the occupied space, projected out, and must be ~0
  const gram = outsideOccupied.map((u) => {
    const su = times(u);
    return outsideOccupied.map((v) => dot(v, su));
  });
  const { values, vectors } = jacobiSymmetric(gram);
  const count = minimal.length - occupied;
  const dropped = values.length - count;
  if (values[dropped] < 1e-6 || values[dropped - 1] > 1e-6 * values[values.length - 1]) return canonical;
  const virtuals: number[][] = [];
  for (let k = dropped; k < values.length; k++) {
    const scale = 1 / Math.sqrt(values[k]);
    const v = new Array<number>(n).fill(0);
    outsideOccupied.forEach((u, m) => {
      const w = vectors[m][k] * scale;
      for (let mu = 0; mu < n; mu++) v[mu] += w * u[mu];
    });
    virtuals.push(v);
  }
  return virtuals;
}

function dot(u: number[], v: number[]): number {
  let sum = 0;
  for (let i = 0; i < u.length; i++) sum += u[i] * v[i];
  return sum;
}

/** M^power of a symmetric positive-definite matrix, or null when it is singular. */
function symmetricPower(M: number[][], power: number): number[][] | null {
  const { values, vectors } = jacobiSymmetric(M);
  if (values[0] < 1e-10) return null;
  return M.map((_, i) => M.map((__, j) =>
    values.reduce((sum, value, k) => sum + vectors[i][k] * value ** power * vectors[j][k], 0)));
}

/** Löwdin orthonormalization of a set of rows in the S metric, or null when
 *  two are nearly the same. */
function orthonormalize(rows: number[][], S: number[][]): number[][] | null {
  const sRows = rows.map((r) => S.map((row) => dot(row, r)));
  const gram = rows.map((u) => sRows.map((sv) => dot(u, sv)));
  const inverseHalf = symmetricPower(gram, -0.5);
  if (!inverseHalf) return null;
  return rows.map((_, j) => rows[0].map((__, mu) => rows.reduce((sum, r, i) => sum + r[mu] * inverseHalf[i][j], 0)));
}
