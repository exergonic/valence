/**
 * The generalized symmetric eigenproblem Hc = εSc, solved the way the
 * chemistry needs it: Cholesky-reduce with the overlap matrix, then Jacobi
 * on the resulting symmetric matrix.
 *
 * Both pieces are hand-rolled on purpose — the matrices here are tiny (a
 * molecule is tens of basis functions, not thousands), and the house rule is
 * no dependencies. The reduction is what makes the extended-Hückel problem
 * ordinary: S is positive definite, so S = LLᵀ, and H' = L⁻¹HL⁻ᵀ is
 * symmetric with the same eigenvalues; the eigenvectors come back through
 * L⁻ᵀ. (YAeHMOP's diag.f does the same thing in Fortran.)
 *
 * Nothing here knows about chemistry — it takes matrices and returns
 * eigenvalues and eigenvectors.
 */

export interface EigenResult {
  /** Eigenvalues, ascending. */
  values: number[];
  /** Eigenvectors as columns: vectors[i][k] is the i-th component of the
   *  k-th eigenvector. Orthonormal in the transformed metric. */
  vectors: number[][];
}

/** Lower-triangular Cholesky factor L with S = LLᵀ, or null if S is not
 *  positive definite (a basis that is linearly dependent — physically a
 *  duplicate orbital — has no factor and deserves a refusal, not a NaN). */
export function cholesky(S: number[][]): number[][] | null {
  const n = S.length;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = S[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(sum > 1e-12)) return null;
        L[i][i] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/** Solve L·X = B for lower-triangular L (forward substitution, column by column). */
function solveLower(L: number[][], B: number[][]): number[][] {
  const n = L.length;
  const cols = B[0].length;
  const X: number[][] = Array.from({ length: n }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) {
    for (let i = 0; i < n; i++) {
      let sum = B[i][c];
      for (let k = 0; k < i; k++) sum -= L[i][k] * X[k][c];
      X[i][c] = sum / L[i][i];
    }
  }
  return X;
}

/** Solve Lᵀ·X = B for lower-triangular L (back substitution). */
function solveLowerTransposed(L: number[][], B: number[][]): number[][] {
  const n = L.length;
  const cols = B[0].length;
  const X: number[][] = Array.from({ length: n }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) {
    for (let i = n - 1; i >= 0; i--) {
      let sum = B[i][c];
      for (let k = i + 1; k < n; k++) sum -= L[k][i] * X[k][c];
      X[i][c] = sum / L[i][i];
    }
  }
  return X;
}

function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) T[j][i] = A[i][j];
  return T;
}

/**
 * Cyclic Jacobi eigenvalue iteration for a real symmetric matrix. Each sweep
 * rotates away every off-diagonal element in turn, until the sum of their
 * squares falls below `tolerance`; for the small matrices here it converges
 * in a handful of sweeps. Returns eigenvalues ascending with eigenvectors as columns.
 */
export function jacobiSymmetric(A: number[][], tolerance = 1e-12): EigenResult {
  const n = A.length;
  const a = A.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
    if (off < tolerance) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  return {
    values: order.map((i) => a[i][i]),
    vectors: Array.from({ length: n }, (_, row) => order.map((i) => v[row][i])),
  };
}

/**
 * Solve Hc = εSc for a symmetric H and positive-definite S. Returns the
 * eigenvalues ascending and the (S-orthonormal) eigenvectors as columns, or
 * null when S has no Cholesky factor.
 */
export function solveGeneralized(H: number[][], S: number[][]): EigenResult | null {
  const n = H.length;
  if (n === 0) return { values: [], vectors: [] };
  const L = cholesky(S);
  if (!L) return null;

  // H' = L⁻¹ H L⁻ᵀ, symmetric and with the same eigenvalues as the pencil
  const y = solveLower(L, H);
  const hp = transpose(solveLower(L, transpose(y)));

  const { values, vectors } = jacobiSymmetric(hp);
  // back to the original basis: c = L⁻ᵀ c'
  const c = solveLowerTransposed(L, vectors);
  return { values, vectors: c };
}
