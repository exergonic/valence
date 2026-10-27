/**
 * JSME pairs two neighbouring opposite charges into a bond, on every edit
 * (sketcher-toolbar.ts, chargePairings). The JME strings are JSME's own, before
 * and after (jsme-editor 2024.04.29, 2026-10-26): a charge click on
 * nitrobenzene's ipso carbon drawn single-bonded to N⁺ (C⁻ meant, C=N came
 * out), a methyl added at the far end of the same ring with C⁻–N⁺ already
 * drawn, a carbon added to an ammonium ylide's methyl, and a methyl erased
 * beside one. The C⁻ clicked toward C⁺ beside O⁻ is the shape of the strings,
 * not a capture.
 */
import { describe, expect, it } from 'vitest';
import { chargePairings } from '../src/ui/sketcher-toolbar';

const tokens = (jme: string) => jme.trim().split(/\s+/);

const RING = 'C 2.41 2.81 C 2.41 4.22 C 1.21 4.93 C 0.00 4.22 C 0.00 2.81';
const RING_BONDS = '1 2 1 2 3 2 3 4 1 4 5 1 5 6 2 6 1 1';
const NEUTRAL_IPSO = `9 9 C 1.21 2.11 ${RING} N+ 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 ${RING_BONDS} 1 7 1 7 8 2 7 9 1`;
const ANION_IPSO = `9 9 C- 1.21 2.11 ${RING} N+ 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 ${RING_BONDS} 1 7 1 7 8 2 7 9 1`;
const PAIRED = `9 9 C 1.21 2.11 ${RING} N 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 ${RING_BONDS} 1 7 2 7 8 2 7 9 1`;
const PAIRED_WITH_METHYL = `10 10 C 1.21 2.11 ${RING} N 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 C 1.21 6.33 ${RING_BONDS} 1 7 2 7 8 2 7 9 1 4 10 1`;

describe('chargePairings', () => {
  it('a charge click on the unlabelled carbon beside N⁺: the carbon gets the anion', () => {
    expect(chargePairings(tokens(NEUTRAL_IPSO), tokens(PAIRED), null)).toEqual([{ atoms: [0, 6], order: 1, charges: [-1, 1] }]);
  });

  it('an edit elsewhere that pairs C⁻ with N⁺: both get their charges back', () => {
    expect(chargePairings(tokens(ANION_IPSO), tokens(PAIRED_WITH_METHYL), null)).toEqual([{ atoms: [0, 6], order: 1, charges: [-1, 1] }]);
  });

  it('an ammonium ylide, paired by an edit at a methyl', () => {
    const before = '5 4 C- 0.00 0.00 N+ 1.21 0.70 C 2.41 0.00 C 1.21 2.11 C 2.41 1.41 1 2 1 2 3 1 2 4 1 2 5 1';
    const after = '6 5 C 0.00 1.40 N 1.21 2.10 C 2.41 1.40 C 1.21 3.51 C 2.41 2.81 C 2.41 0.00 1 2 2 2 3 1 2 4 1 2 5 1 3 6 1';
    expect(chargePairings(tokens(before), tokens(after), null)).toEqual([{ atoms: [0, 1], order: 1, charges: [-1, 1] }]);
  });

  it('a C⁻ clicked toward C⁺ beside O⁻: the clicked carbon gets the cation', () => {
    const before = tokens('3 2 C 0 0 C- 1.2 0.7 O- 2.4 0 1 2 1 2 3 1');
    const after = tokens('3 2 C 0 0 C 1.2 0.7 O 2.4 0 1 2 1 2 3 2');
    expect(chargePairings(before, after, 1)).toEqual([{ atoms: [1, 2], order: 1, charges: [1, -1] }]);
    expect(chargePairings(before, after, null)).toEqual([]); // which one was clicked is unknowable
  });

  it('an ordinary edit is not a pairing', () => {
    expect(chargePairings(tokens('3 2 C 0 0 C 1.2 0.7 C 2.4 0 1 2 1 2 3 1'), tokens('3 2 C 0 0 C- 1.2 0.7 C 2.4 0 1 2 1 2 3 1'), null)).toEqual([]);
    // a double bond drawn between two neutral atoms
    expect(chargePairings(tokens('2 1 C 0 0 C 1.2 0 1 2 1'), tokens('2 1 C 0 0 C 1.2 0 1 2 2'), null)).toEqual([]);
  });

  it('follows the atoms past a deleted one', () => {
    // the methyl (atom 1) erased from CH₃–C⁻H–N⁺Me₃, and JSME pairs the ylide
    const before = tokens('6 5 C 0.00 1.41 C- 1.21 2.11 N+ 2.41 1.41 C 3.62 2.11 C 2.41 0.00 C 2.41 2.81 1 2 1 2 3 1 3 4 1 3 5 1 3 6 1');
    const after = tokens('5 4 C 0.00 2.11 N 1.21 1.41 C 2.41 2.11 C 1.21 0.00 C 1.21 2.81 1 2 2 2 3 1 2 4 1 2 5 1');
    expect(chargePairings(before, after, null)).toEqual([{ atoms: [0, 1], order: 1, charges: [-1, 1] }]);
  });
});
