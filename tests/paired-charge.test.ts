/**
 * JSME's charge tool pairs a new charge with an opposite one beside it
 * (sketcher-toolbar.ts, pairedCharge). The JME strings are JSME's own, before
 * and after a charge click on nitrobenzene's ipso carbon drawn single-bonded
 * to N⁺ (jsme-editor 2024.04.29, 2026-10-26): C⁻ was meant, C=N came out.
 */
import { describe, expect, it } from 'vitest';
import { pairedCharge } from '../src/ui/sketcher-toolbar';

const tokens = (jme: string) => jme.trim().split(/\s+/);

const RING = 'C 2.41 2.81 C 2.41 4.22 C 1.21 4.93 C 0.00 4.22 C 0.00 2.81';
const RING_BONDS = '1 2 1 2 3 2 3 4 1 4 5 1 5 6 2 6 1 1';
const BEFORE = `9 9 C 1.21 2.11 ${RING} N+ 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 ${RING_BONDS} 1 7 1 7 8 2 7 9 1`;
const PAIRED = `9 9 C 1.21 2.11 ${RING} N 1.21 0.70 O 2.41 0.00 O- 0.00 0.00 ${RING_BONDS} 1 7 2 7 8 2 7 9 1`;

describe('pairedCharge', () => {
  it('finds the unlabelled carbon JSME paired with N⁺, and gives it the anion', () => {
    expect(pairedCharge(tokens(BEFORE), tokens(PAIRED), null)).toEqual({ index: 0, charge: -1 });
  });

  it('takes the hovered atom when there is one', () => {
    expect(pairedCharge(tokens(BEFORE), tokens(PAIRED), 0)).toEqual({ index: 0, charge: -1 });
    expect(pairedCharge(tokens(BEFORE), tokens(PAIRED), 4)).toBeNull();
  });

  it('a C⁻ clicked toward C⁺ beside O⁻ gets the cation', () => {
    expect(pairedCharge(tokens('3 2 C 0 0 C- 1.2 0.7 O- 2.4 0 1 2 1 2 3 1'), tokens('3 2 C 0 0 C 1.2 0.7 O 2.4 0 1 2 1 2 3 2'), 1))
      .toEqual({ index: 1, charge: 1 });
  });

  it('an ordinary charge click is not a pairing', () => {
    expect(pairedCharge(tokens('3 2 C 0 0 C 1.2 0.7 C 2.4 0 1 2 1 2 3 1'), tokens('3 2 C 0 0 C- 1.2 0.7 C 2.4 0 1 2 1 2 3 1'), null)).toBeNull();
  });

  it('a raised bond with no charge lost is not a pairing', () => {
    expect(pairedCharge(tokens('2 1 C 0 0 C 1.2 0 1 2 1'), tokens('2 1 C 0 0 C 1.2 0 1 2 2'), null)).toBeNull();
  });
});
