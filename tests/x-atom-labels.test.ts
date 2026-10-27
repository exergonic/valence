/**
 * The charges and radicals JSME holds only on its X atom: the label grammar,
 * and reading them from JSME's V3000 block. The block is JSME's own output for SiF₆²⁻
 * drawn with an X atom (jsme-editor 2024.04.29, 2026-10-20) — its V2000
 * block writes that Si as "Q".
 */
import { describe, expect, it } from 'vitest';
import { jmeAtomLabel, parseXAtomLabel, xAtomLabels } from '../src/ui/x-atom-labels';

const SIF6_V3000 = `
JME 2024-04-29 Tue Oct 20 22:12:03 GMT-400 2026

  0  0  0  0  0  0  0  0  0  0999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 7 6 0 0 0
M  V30 BEGIN ATOM
M  V30 1 F 2.4921 0.7208 0.0000 0
M  V30 2 Si-2 1.2460 1.4417 0.0000 0
M  V30 3 F 1.2460 2.8834 0.0000 0
M  V30 4 F 1.2460 0.0000 0.0000 0
M  V30 5 F 0.0000 0.7208 0.0000 0
M  V30 6 F 2.0596 2.4715 0.0000 0
M  V30 7 F 0.4119 0.4119 0.0000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 2 1
M  V30 2 1 3 2
M  V30 3 1 4 2
M  V30 4 1 5 2
M  V30 5 1 6 2
M  V30 6 1 7 2
M  V30 END BOND
M  V30 END CTAB
M  END
`;

describe('charges and radicals carried on JSME\'s X atom', () => {
  it('reads an X atom\'s label as an element, a charge and a radical', () => {
    expect(parseXAtomLabel('I-')).toEqual({ element: 'I', charge: -1, radical: false });
    expect(parseXAtomLabel('Si-2')).toEqual({ element: 'Si', charge: -2, radical: false });
    expect(parseXAtomLabel('Xe+')).toEqual({ element: 'Xe', charge: 1, radical: false });
    expect(parseXAtomLabel('C•')).toEqual({ element: 'C', charge: 0, radical: true });
    expect(parseXAtomLabel('C•-')).toEqual({ element: 'C', charge: -1, radical: true });
    expect(parseXAtomLabel('N•+')).toEqual({ element: 'N', charge: 1, radical: true });
    expect(parseXAtomLabel('Cl')).toBeNull();
    expect(parseXAtomLabel('Q')).toBeNull();
  });

  it('writes the label JSME reads back as that X atom', () => {
    expect(jmeAtomLabel('I', -1)).toBe('[I-]');
    expect(jmeAtomLabel('Si', -2)).toBe('[Si-2]');
    expect(jmeAtomLabel('I', 1)).toBe('[I+]');
    expect(jmeAtomLabel('I', 0)).toBe('I'); // JSME's own atom again
    expect(jmeAtomLabel('C', 0, true)).toBe('[C•]');
    expect(jmeAtomLabel('C', -1, true)).toBe('[C•-]');
  });

  it('finds SiF₆²⁻\'s charged Si in the V3000 block, and nothing else', () => {
    expect([...xAtomLabels(SIF6_V3000)]).toEqual([[1, 'Si-2']]);
  });
});
