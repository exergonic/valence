import { describe, it, expect } from 'vitest';
import { kekulizeSmiles } from '../src/chem/kekulize-smiles';

describe('kekulizeSmiles', () => {
  it('passes non-aromatic SMILES through byte-for-byte', () => {
    const cases = [
      'C',
      'CC',
      'CCO',
      'CC(C)C',
      'O=C=O',
      'C#N',
      'C=C',
      'C=CC#C',
      'C/C=C\\C', // stereo forms stay untouched
      'P(Cl)(Cl)(Cl)(Cl)Cl',
      'S(F)(F)(F)(F)(F)F',
      '[NH4]',
    ];
    for (const s of cases) {
      expect(kekulizeSmiles(s), s).toBe(s);
    }
  });

  it('rewrites benzene into an explicit Kekulé form', () => {
    expect(kekulizeSmiles('c1ccccc1')).toBe('C1=CC=CC=C1');
  });

  it('rewrites cyclobutadiene — the reported bug — into the correct diene', () => {
    // JSME emits the aromatic 4-ring "c1ccc1"; PubChem canonicalizes that to
    // cyclobutane. Kekulized, it must become the explicit diene.
    expect(kekulizeSmiles('c1ccc1')).toBe('C1=CC=C1');
  });

  it('rewrites pyridine so the ring nitrogen takes a double bond', () => {
    expect(kekulizeSmiles('c1ccncc1')).toBe('C1=CC=NC=C1');
  });

  it('rewrites pyrrole keeping the pyrrolic nitrogen (NH) free of double bonds', () => {
    // The only valid pyrrole Kekulé has a double bond on the ring closure,
    // expressed with the "=1" closure syntax.
    expect(kekulizeSmiles('c1cc[nH]c1')).toBe('C=1C=CNC1');
  });

  it('rewrites imidazole with the pyridine-type N double and the NH single', () => {
    expect(kekulizeSmiles('c1cnc[nH]1')).toBe('C1=CN=CN1');
  });

  it('rewrites furan leaving the oxygen without ring double bonds', () => {
    // Only valid furan Kekulé from this atom order leaves O single-bonded and
    // puts the closure bond double (the "=1" syntax). Verified → CID 8029.
    expect(kekulizeSmiles('c1ccoc1')).toBe('C=1C=COC1');
  });

  it('rewrites thiophene leaving the sulfur without ring double bonds', () => {
    expect(kekulizeSmiles('c1ccsc1')).toBe('C=1C=CSC1');
  });

  it('rewrites pyrazine with alternating double bonds on both nitrogens', () => {
    expect(kekulizeSmiles('c1cnccn1')).toBe('C1=CN=CC=N1');
  });

  it('preserves an exocyclic single-bond substituent (toluene)', () => {
    expect(kekulizeSmiles('Cc1ccccc1')).toBe('CC1=CC=CC=C1');
  });

  it('preserves an exocyclic heteroatom substituent (aniline, chlorobenzene)', () => {
    expect(kekulizeSmiles('Nc1ccccc1')).toBe('NC1=CC=CC=C1');
    expect(kekulizeSmiles('c1ccccc1Cl')).toBe('C1=CC=CC=C1Cl');
  });

  it('preserves substituent branches while Kekulizing the ring (phenol)', () => {
    expect(kekulizeSmiles('c1ccc(O)cc1')).toBe('C1=CC=C(O)C=C1');
  });

  it('Kekulizes each ring of a biphenyl independently', () => {
    expect(kekulizeSmiles('c1ccccc1-c2ccccc2')).toBe('C1=CC=CC=C1-C2=CC=CC=C2');
  });

  it('leaves fused aromatic systems untouched (current, working behavior)', () => {
    // Naphthalene has fusion carbons with 3 aromatic neighbors → not a
    // monocyclic aromatic; genuine aromatics already resolve fine at PubChem.
    expect(kekulizeSmiles('c1ccc2ccccc2c1')).toBe('c1ccc2ccccc2c1');
  });

  it('leaves charged aromatic content untouched rather than risk corruption', () => {
    expect(kekulizeSmiles('c1cc[nH+]cc1')).toBe('c1cc[nH+]cc1');
  });

  it('the Kekulized output contains no leftover aromatic lower-case atoms', () => {
    const out = kekulizeSmiles('c1cc[nH]c1-c2ccccc2');
    expect(/[bcnops]/.test(out)).toBe(false);
    expect(out).toBe('C=1C=CNC1-C2=CC=CC=C2');
  });

  it('leaves empty or degenerate inputs alone', () => {
    expect(kekulizeSmiles('')).toBe('');
    expect(kekulizeSmiles('C')).toBe('C');
  });
});
