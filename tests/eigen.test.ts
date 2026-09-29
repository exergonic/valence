// The eigensolver tier: Hc = εSc. These are the analytic pins — a diagonal
// matrix, the closed-form 2×2 spectrum, the trace invariant, orthonormality —
// plus the residuals that catch a wrong reduction without needing an oracle.
// The extended-Hückel fixture tests sit on top of this.
import { describe, it, expect } from 'vitest';
import { jacobiSymmetric, solveGeneralized, cholesky } from '../src/utils/eigen';

describe('jacobiSymmetric — the symmetric eigenproblem', () => {
  it('a diagonal matrix returns its diagonal, ascending', () => {
    const { values } = jacobiSymmetric([[2, 0, 0], [0, -1, 0], [0, 0, 5]]);
    expect(values[0]).toBeCloseTo(-1, 12);
    expect(values[1]).toBeCloseTo(2, 12);
    expect(values[2]).toBeCloseTo(5, 12);
  });

  it('2×2 matches the closed form (a+c)/2 ± sqrt(((a−c)/2)² + b²)', () => {
    const a = 3, b = 1, c = 2;
    const { values } = jacobiSymmetric([[a, b], [b, c]]);
    const root = Math.hypot((a - c) / 2, b);
    expect(values[0]).toBeCloseTo((a + c) / 2 - root, 12);
    expect(values[1]).toBeCloseTo((a + c) / 2 + root, 12);
  });

  it('preserves the trace and returns orthonormal eigenvectors', () => {
    const n = 6;
    const M = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? i * 1.5 - 2 : 0.3 / (1 + Math.abs(i - j)))));
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) M[i][j] = M[j][i];
    const { values, vectors } = jacobiSymmetric(M);
    const trace = values.reduce((s, x) => s + x, 0);
    expect(trace).toBeCloseTo(M.reduce((s, row, i) => s + row[i], 0), 10);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let dot = 0;
        for (let k = 0; k < n; k++) dot += vectors[k][i] * vectors[k][j];
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 10);
      }
    }
  });
});

describe('solveGeneralized — Hc = εSc', () => {
  // A representative pair: a symmetric H with a non-trivial, positive-definite S
  const S = [[1, 0.4, 0.1], [0.4, 1, 0.3], [0.1, 0.3, 1]];
  const H = [[-1, -0.5, 0], [-0.5, -2, -0.7], [0, -0.7, -3]];

  it('solves the pencil: every eigenpair satisfies Hc = εSc', () => {
    const { values, vectors } = solveGeneralized(H, S)!;
    expect(values.length).toBe(3);
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 3; i++) {
        let hc = 0, sc = 0;
        for (let j = 0; j < 3; j++) {
          hc += H[i][j] * vectors[j][k];
          sc += S[i][j] * vectors[j][k];
        }
        expect(hc - values[k] * sc).toBeCloseTo(0, 7);
      }
    }
  });

  it('eigenvectors are orthonormal in the S metric', () => {
    const { vectors } = solveGeneralized(H, S)!;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let dot = 0;
        for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) dot += vectors[p][i] * S[p][q] * vectors[q][j];
        expect(dot).toBeCloseTo(i === j ? 1 : 0, 10);
      }
    }
  });

  it('degenerates to the ordinary problem when S is the identity', () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
    const gen = solveGeneralized(A, I)!;
    const plain = jacobiSymmetric(A);
    for (let k = 0; k < 3; k++) expect(gen.values[k]).toBeCloseTo(plain.values[k], 10);
  });

  it('refuses an S with no Cholesky factor instead of returning NaNs', () => {
    expect(cholesky([[1, 2], [2, 1]])).toBeNull(); // not positive definite
    expect(solveGeneralized([[0, 0], [0, 0]], [[1, 2], [2, 1]])).toBeNull();
  });
});
