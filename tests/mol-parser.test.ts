import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';

describe('parseMolBlock', () => {
  it('should parse an empty MOL block', () => {
    const mol = parseMolBlock('');
    expect(mol.atoms).toEqual([]);
    expect(mol.bonds).toEqual([]);
  });
});
