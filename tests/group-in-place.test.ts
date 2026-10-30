/**
 * A group from "Groups…" takes the place of an end atom, as an element does,
 * and is not drawn on a ring or chain atom (sketcher-toolbar.ts,
 * groupInPlaceOfAtom). The first JME strings are JSME's own (jsme-editor 2024.04.29, 2026-10-26): ethane, and
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

  it('a group on an atom inside a chain is not drawn: no end atom to replace', () => {
    // propane's middle carbon, CN bonded to it
    const propane = tokens('3 2 C 0 0 C 1.2 0.7 C 2.4 0 1 2 1 2 3 1');
    const withCyano = tokens('5 4 C 0 0 C 1.2 0.7 C 2.4 0 C 1.2 2.1 N 1.2 3.3 1 2 1 2 3 1 2 4 1 4 5 3');
    expect(groupInPlaceOfAtom(propane, withCyano)).toBeNull();
  });

  it('a ring atom has no place to give', () => {
    // cyclopropane, OH bonded to a ring carbon
    const ring = tokens('3 3 C 0 0 C 1.2 0 C 0.6 1 1 2 1 2 3 1 3 1 1');
    expect(groupInPlaceOfAtom(ring, tokens('4 4 C 0 0 C 1.2 0 C 0.6 1 O 0.6 2.4 1 2 1 2 3 1 3 1 1 3 4 1'))).toBeNull();
  });

  it("the end of a double bond gives its place, bonded by the group's own bond", () => {
    // formaldehyde's O, OH bonded to it: methanol
    const formaldehyde = tokens('2 1 C 0 0 O 1.2 0.7 1 2 2');
    expect(groupInPlaceOfAtom(formaldehyde, tokens('3 2 C 0 0 O 1.2 0.7 O 2.4 0 1 2 2 2 3 1'))?.join(' '))
      .toBe('2 1 C 0.00 0.00 O 1.20 0.70 1 2 1');
  });

  it('=O on a methyl of ethane is formaldehyde: the oxo double-bonded where the methyl was', () => {
    const ethane = tokens('2 1 C 0 0 C 1.2 0.7 1 2 1');
    expect(groupInPlaceOfAtom(ethane, tokens('3 2 C 0 0 C 1.2 0.7 O 2.4 0 1 2 1 2 3 2'))?.join(' '))
      .toBe('2 1 C 0.00 0.00 O 1.20 0.70 1 2 2');
  });

  it('a lone atom gives its place to the group alone', () => {
    expect(groupInPlaceOfAtom(tokens('1 0 C 0 0'), tokens('2 1 C 0 0 O 1.2 0.7 1 2 1'))?.join(' '))
      .toBe('1 0 O 0.00 0.00');
  });
});
