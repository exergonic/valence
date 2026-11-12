/**
 * The dihedral drive (src/geometry/torsion.ts): which bonds turn, which side,
 * which atoms name the dihedral, that a turn is rigid — and the energies along
 * a rigid turn, against the Fortran xtb at the same geometries
 * (tests/references/xtb-torsion.json). Structures from PubChem (hexane) and the
 * app's examples.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { dihedralDegrees, torsionAbout, torsionName, turnTorsion, wrapDegrees, type Torsion } from '../src/geometry/torsion';

const xtb = JSON.parse(readFileSync(fileURLToPath(new URL('./references/xtb-torsion.json', import.meta.url)), 'utf-8'));
const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));
const KCAL_PER_HARTREE = 627.509474;

beforeAll(() => {
  // the worker module registers `self.onmessage` at import time
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});

const hexane = parseMolBlock(readFileSync(fileURLToPath(new URL('./references/pubchem/hexane.sdf', import.meta.url)), 'utf-8'));
const example = (name: string) => parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(name))!.mol);
const carbonCarbon = (molecule: Molecule) =>
  molecule.bonds.findIndex((b) => molecule.atoms[b.atom1Index].element === 'C' && molecule.atoms[b.atom2Index].element === 'C');

const torsionOf = (molecule: Molecule, bondIndex: number): Torsion => {
  const choice = torsionAbout(molecule, bondIndex);
  if (!('torsion' in choice)) throw new Error(choice.refusal);
  return choice.torsion;
};

const distance = (m: Molecule, i: number, j: number) =>
  Math.hypot(m.atoms[i].x - m.atoms[j].x, m.atoms[i].y - m.atoms[j].y, m.atoms[i].z - m.atoms[j].z);

describe('choosing a torsion', () => {
  it('turns the smaller side, named by the heaviest neighbours', () => {
    // hexane's C1–C3 (PubChem numbering): C3's side is an ethyl, 7 atoms
    const torsion = torsionOf(hexane, 1);
    expect(torsion.b).toBe(0);
    expect(torsion.c).toBe(2);
    expect(torsion.turning).toHaveLength(7);
    expect(torsionName(hexane, torsion)).toBe('C2–C1–C3–C5');
    // PubChem's hexane is all anti
    expect(Math.abs(dihedralDegrees(hexane, torsion))).toBeGreaterThan(178);
  });

  it('refuses a ring bond, a bond to a terminal atom, and a bond with its neighbours in line', () => {
    const benzene = example('Benzene');
    expect(torsionAbout(benzene, carbonCarbon(benzene))).toHaveProperty('refusal', expect.stringContaining('ring'));
    expect(torsionAbout(hexane, 2)).toHaveProperty('refusal', expect.stringContaining('terminal'));
    const ethyne = example('Ethyne');
    expect(torsionAbout(ethyne, carbonCarbon(ethyne))).toHaveProperty('refusal', expect.stringContaining('in line'));
  });

  it('turns a double bond like any other', () => {
    const ethene = example('Ethene');
    const torsion = torsionOf(ethene, carbonCarbon(ethene));
    expect(torsion.turning).toHaveLength(3);
    expect(Math.abs(dihedralDegrees(ethene, torsion))).toBeLessThan(1); // H–C=C–H cis, the lowest-numbered pair
  });
});

describe('a turn is rigid', () => {
  it('sets the dihedral and moves nothing else', () => {
    const torsion = torsionOf(hexane, 1);
    for (const target of [60, -60, 0, 120, 180, -179.5]) {
      const turned = turnTorsion(hexane, torsion, target);
      expect(wrapDegrees(dihedralDegrees(turned, torsion) - target)).toBeCloseTo(0, 9);
      // the fixed side stays exactly where it was
      const turning = new Set(torsion.turning);
      hexane.atoms.forEach((atom, i) => {
        if (!turning.has(i)) expect(turned.atoms[i]).toEqual(atom);
      });
      // every bond length is kept, the turned bond's included
      for (const bond of hexane.bonds) {
        expect(distance(turned, bond.atom1Index, bond.atom2Index)).toBeCloseTo(distance(hexane, bond.atom1Index, bond.atom2Index), 10);
      }
      // and the turning side is a rigid body: its internal distances are kept
      for (const i of torsion.turning) {
        for (const j of torsion.turning) expect(distance(turned, i, j)).toBeCloseTo(distance(hexane, i, j), 10);
      }
    }
  });

  it('turns back to where it was', () => {
    const torsion = torsionOf(hexane, 0);
    const start = dihedralDegrees(hexane, torsion);
    const back = turnTorsion(turnTorsion(hexane, torsion, 60), torsion, start);
    back.atoms.forEach((atom, i) => {
      expect(atom.x).toBeCloseTo(hexane.atoms[i].x, 10);
      expect(atom.y).toBeCloseTo(hexane.atoms[i].y, 10);
      expect(atom.z).toBeCloseTo(hexane.atoms[i].z, 10);
    });
  });

  it('names a 0° turn the structure itself', () => {
    const torsion = torsionOf(hexane, 1);
    const same = turnTorsion(hexane, torsion, dihedralDegrees(hexane, torsion));
    same.atoms.forEach((atom, i) => expect(atom.x).toBeCloseTo(hexane.atoms[i].x, 12));
  });

  it('wraps angles into (−180, 180]', () => {
    expect(wrapDegrees(190)).toBeCloseTo(-170);
    expect(wrapDegrees(-180)).toBeCloseTo(180);
    expect(wrapDegrees(540)).toBeCloseTo(180);
    expect(wrapDegrees(-30)).toBeCloseTo(-30);
  });
});

describe('the energy along a rigid turn', () => {
  const scan = async (molecule: Molecule, bondIndex: number, angles: number[]) => {
    const { energyAt } = await import('../src/geometry/gfn2-refine.worker');
    const torsion = torsionOf(molecule, bondIndex);
    return Promise.all(angles.map((angle) => energyAt(turnTorsion(molecule, torsion, angle), vendorFile)));
  };

  it('is the Fortran xtb’s at every angle of hexane’s C1–C3', async () => {
    const angles = [180, 120, 60, 0];
    const ours = await scan(hexane, 1, angles);
    angles.forEach((angle, i) => {
      expect(Math.abs(ours[i]! - xtb.hexane[angle])).toBeLessThan(2e-6);
      // the profile itself — energies relative to the anti start — to a thousandth of a kcal/mol
      const relative = (ours[i]! - ours[0]!) * KCAL_PER_HARTREE;
      expect(relative).toBeCloseTo((xtb.hexane[angle] - xtb.hexane[180]) * KCAL_PER_HARTREE, 3);
    });
  });

  it('twists ethene’s π bond to the oracle’s barrier, its frontier gap closed at 90°', async () => {
    const ethene = example('Ethene');
    const angles = [0, 45, 90];
    const ours = await scan(ethene, carbonCarbon(ethene), angles);
    angles.forEach((angle, i) => expect(Math.abs(ours[i]! - xtb.ethene[angle])).toBeLessThan(2e-6));
    // GFN2-xTB overstates the rigid twist (NOTES.md, 2026-11-11): at 90° the
    // HOMO and LUMO are degenerate, a biradical one determinant cannot hold —
    // the triplet there is lower, and experiment's barrier lower still
    const barrier = (ours[2]! - ours[0]!) * KCAL_PER_HARTREE;
    expect(barrier).toBeCloseTo((xtb.ethene[90] - xtb.ethene[0]) * KCAL_PER_HARTREE, 3);
    expect(xtb.ethene_90_triplet).toBeLessThan(xtb.ethene[90]);
    expect(xtb.ethene_90_gap_eV).toBeLessThan(1e-6);
  });
});
