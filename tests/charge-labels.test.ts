// Partial-charge label formatting (render/orbital-labels.ts formatCharge):
// the number that appears above each atom in the Charges label mode.
import { describe, it, expect } from 'vitest';
import { formatCharge } from '../src/render/orbital-labels';

describe('formatCharge', () => {
  it('formats positive and negative charges with an explicit sign', () => {
    expect(formatCharge(0.4321)).toBe('+0.43');
    expect(formatCharge(0.428)).toBe('+0.43');
    expect(formatCharge(0.005)).toBe('+0.01');
  });

  it('uses the typographic minus for negative values', () => {
    expect(formatCharge(-0.356)).toBe('−0.36');
    expect(formatCharge(-1)).toBe('−1.00');
  });

  it('reads near-zero values as 0.00', () => {
    expect(formatCharge(0)).toBe('0.00');
    expect(formatCharge(0.004)).toBe('0.00');
    expect(formatCharge(-0.004)).toBe('0.00');
  });
});