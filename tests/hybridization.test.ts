import { describe, it, expect } from 'vitest';
import { assignHybridization } from '../src/hybridization';

describe('assignHybridization', () => {
  it('should return sp3 for coordination number 4', () => {
    const result = assignHybridization(4);
    expect(result.hybridization).toBe('sp3');
    expect(result.geometry).toBe('tetrahedral');
  });
});
