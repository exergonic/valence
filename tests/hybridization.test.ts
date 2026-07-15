import { describe, it, expect } from 'vitest';
import { assignHybridization } from '../src/hybridization';

describe('assignHybridization', () => {
  it('should return sp3 for tetrahedral geometry', () => {
    const result = assignHybridization('C', [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, -1],
      [0, -1, -1],
    ]);
    expect(result.hybridization).toBe('sp3');
    expect(result.geometry).toBe('tetrahedral');
  });

  it('should return sp2 for trigonal planar geometry', () => {
    const result = assignHybridization('C', [
      [1, 0, 0],
      [-0.5, 0.866, 0],
      [-0.5, -0.866, 0],
    ]);
    expect(result.hybridization).toBe('sp2');
    expect(result.geometry).toBe('trigonal_planar');
  });

  it('should return sp for linear geometry', () => {
    const result = assignHybridization('C', [
      [1, 0, 0],
      [-1, 0, 0],
    ]);
    expect(result.hybridization).toBe('sp');
    expect(result.geometry).toBe('linear');
  });

  it('should return sp3 for ammonia-like geometry (~107°)', () => {
    const result = assignHybridization('N', [
      [0.943, 0, -0.333],
      [-0.471, 0.816, -0.333],
      [-0.471, -0.816, -0.333],
    ]);
    expect(result.hybridization).toBe('sp3');
  });

  it('should return sp2 for pyridine-like nitrogen', () => {
    const result = assignHybridization('N', [
      [1, 0, 0],
      [-0.5, 0.866, 0],
      [-0.5, -0.866, 0],
    ]);
    expect(result.hybridization).toBe('sp2');
  });
});
