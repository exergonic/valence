import { describe, it, expect } from 'vitest';
import { labelOpacity, fadeWindow } from '../src/utils/label-fade';

describe('labelOpacity', () => {
  const NEAR = 10;
  const FAR = 20;

  it('is fully opaque inside the near threshold', () => {
    expect(labelOpacity(0, NEAR, FAR)).toBe(1);
    expect(labelOpacity(NEAR, NEAR, FAR)).toBe(1);
    expect(labelOpacity(NEAR / 2, NEAR, FAR)).toBe(1);
  });

  it('is gone at or beyond the far threshold', () => {
    expect(labelOpacity(FAR, NEAR, FAR)).toBe(0);
    expect(labelOpacity(FAR * 2, NEAR, FAR)).toBe(0);
  });

  it('fades monotonically between near and far', () => {
    let prev = 1;
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const d = NEAR + (i * (FAR - NEAR)) / steps;
      const o = labelOpacity(d, NEAR, FAR);
      expect(o).toBeLessThanOrEqual(prev + 1e-9);
      prev = o;
    }
  });

  it('is half at the midpoint of the fade window', () => {
    // smoothstep(0.5) = 0.5 → opacity 0.5
    expect(labelOpacity((NEAR + FAR) / 2, NEAR, FAR)).toBeCloseTo(0.5, 6);
  });

  it('handles an inverted/empty window defensively', () => {
    // far <= near degenerates to a hard on/off at `near`.
    expect(labelOpacity(NEAR - 1, NEAR, NEAR)).toBe(1);
    expect(labelOpacity(NEAR + 1, NEAR, NEAR)).toBe(0);
  });
});

describe('fadeWindow', () => {
  it('spans the atom depth range with near inside far', () => {
    const { near, far } = fadeWindow(3, 7);
    expect(near).toBeLessThan(far);
    expect(near).toBeLessThan(3); // slack pulls the full-opacity zone in front
    expect(far).toBeGreaterThan(7); // and the fade-out past the rear
  });

  it('scales linearly with the depth range', () => {
    const a = fadeWindow(2, 4);
    const b = fadeWindow(4, 8);
    expect(b.near).toBeCloseTo(a.near * 2, 9);
    expect(b.far).toBeCloseTo(a.far * 2, 9);
  });

  it('still yields a valid window for a single depth (degenerate span)', () => {
    const { near, far } = fadeWindow(5, 5);
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });

  it('handles a zero nearest distance defensively', () => {
    const { near, far } = fadeWindow(0, 8);
    expect(near).toBe(0);
    expect(far).toBeGreaterThan(near);
  });

  it('normalizes an out-of-order input instead of producing an inverted window', () => {
    const { near, far } = fadeWindow(9, 2);
    expect(near).toBeLessThan(far);
  });
});
