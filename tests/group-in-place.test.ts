/**
 * A group from "Groups…" takes the place of an atom that ends a single bond,
 * as an element does (sketcher-toolbar.ts, groupInPlaceOfAtom). The first JME
 * strings are JSME's own (jsme-editor 2024.04.29, 2026-10-26): ethane, and
 * ethane after its nitro action on one methyl — NO₂ bonded to it, nitroethane.
 * The others are the shape of the strings, not captures.
 */
import { describe, expect, it } from 'vitest';
import { groupInPlaceOfAtom } from '../src/ui/sketcher-toolbar';

const tokens = (jme: string) => jme.trim().split(/\s+/);

describe('groupInPlaceOfAtom', () => {
  it('NO₂ on a methyl of ethane is nitromethane, the N where the methyl was', () => {
    const ethane = tokens('2 1 C 0.00 0.00 C 1.21 0.71 1 2 1');
    const nitroethane = tokens('5 4 C 0.00 1.39 C 1.21 2.09 N+ 2.42 1.40 O 3.63 2.11 O- 2.43 0.00 1 2 1 2 3 1 3 4 2 3 5 1');
    expect(groupInPlaceOfAtom(ethane, nitroethane)?.join(' '))
      .toBe('4 3 C 0.00 1.39 N+ 1.21 2.09 O 2.42 2.80 O- 1.22 0.69 1 2 1 2 3 2 2 4 1');
  });

  it('an atom inside a chain keeps the group as a substituent', () => {
    // propane's middle carbon, CN bonded to it
    const propane = tokens('3 2 C 0 0 C 1.2 0.7 C 2.4 0 1 2 1 2 3 1');
    const withCyano = tokens('5 4 C 0 0 C 1.2 0.7 C 2.4 0 C 1.2 2.1 N 1.2 3.3 1 2 1 2 3 1 2 4 1 4 5 3');
    expect(groupInPlaceOfAtom(propane, withCyano)).toBeNull();
  });

  it('a lone atom, and the end of a double bond, keep the group bonded', () => {
    expect(groupInPlaceOfAtom(tokens('1 0 C 0 0'), tokens('2 1 C 0 0 O 1.2 0.7 1 2 1'))).toBeNull();
    // formaldehyde's O, OH bonded to it
    const formaldehyde = tokens('2 1 C 0 0 O 1.2 0.7 1 2 2');
    expect(groupInPlaceOfAtom(formaldehyde, tokens('3 2 C 0 0 O 1.2 0.7 O 2.4 0 1 2 2 2 3 1'))).toBeNull();
  });
});
