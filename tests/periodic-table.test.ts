import { describe, it, expect } from 'vitest';
import { SYMBOLS, placeInTable } from '../src/ui/periodic-table';
import { elementKind } from '../src/chem/elements';
import { atomicSmilesForXBox } from '../src/ui/sketcher-toolbar';

describe('the periodic table behind "More…"', () => {
  it('holds hydrogen through radon, Z = 1–86, each symbol once', () => {
    expect(SYMBOLS).toHaveLength(86);
    expect(new Set(SYMBOLS).size).toBe(86);
    // spot checks along the way: the period ends and a few landmarks
    expect(SYMBOLS[1 - 1]).toBe('H');
    expect(SYMBOLS[10 - 1]).toBe('Ne');
    expect(SYMBOLS[18 - 1]).toBe('Ar');
    expect(SYMBOLS[28 - 1]).toBe('Ni');
    expect(SYMBOLS[36 - 1]).toBe('Kr');
    expect(SYMBOLS[54 - 1]).toBe('Xe');
    expect(SYMBOLS[57 - 1]).toBe('La');
    expect(SYMBOLS[71 - 1]).toBe('Lu');
    expect(SYMBOLS[78 - 1]).toBe('Pt');
    expect(SYMBOLS[86 - 1]).toBe('Rn');
  });

  it('puts every element in its own cell, the groups where a chemist expects them', () => {
    const cells = new Set(SYMBOLS.map((_, i) => { const p = placeInTable(i + 1); return `${p.row},${p.column}`; }));
    expect(cells.size).toBe(86);
    const at = (symbol: string) => placeInTable(SYMBOLS.indexOf(symbol) + 1);
    expect(at('He')).toEqual({ row: 1, column: 18 });
    expect(at('B')).toEqual({ row: 2, column: 13 });
    expect(at('Al')).toEqual({ row: 3, column: 13 });
    expect(at('Ni')).toEqual({ row: 4, column: 10 });
    expect(at('Ba')).toEqual({ row: 6, column: 2 });
    expect(at('La')).toEqual({ row: 8, column: 3 });
    expect(at('Lu')).toEqual({ row: 8, column: 17 });
    expect(at('Hf')).toEqual({ row: 6, column: 4 });
    expect(at('Rn')).toEqual({ row: 6, column: 18 });
  });

  it('sorts nonmetals, metals and noble gases the way the hydrogen filler does', () => {
    expect(elementKind('Si')).toBe('nonmetal');
    expect(elementKind('Te')).toBe('nonmetal');
    expect(elementKind('Xe')).toBe('noble-gas');
    expect(elementKind('Ni')).toBe('metal');
    expect(elementKind('Sn')).toBe('metal');
  });

  it('brackets a metal or noble gas for JSME\'s X box, leaves a nonmetal bare', () => {
    expect(atomicSmilesForXBox('Ni')).toBe('[Ni]');
    expect(atomicSmilesForXBox('Xe')).toBe('[Xe]');
    expect(atomicSmilesForXBox('Si')).toBe('Si');
    expect(atomicSmilesForXBox('H')).toBe('H');
  });
});
