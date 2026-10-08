/**
 * The p orbitals across a cumulated (linear) π chain.
 *
 * In a cumulene each double bond's π is at right angles to the next, so a
 * terminal atom's p orbital is set by the far end of the chain. The code took
 * a terminal atom's p from the cross product of its partner's two bonds, which
 * is zero when the partner is linear: ketene's oxygen (reported 2026-10-08:
 * labelled sp², no p orbital) and both oxygens of CO₂ were drawn without one.
 *
 * Structures: JSME's own sketches, embedded and optimised by the app's local
 * GFN2-xTB pipeline.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Molecule } from '../src/mol-parser';
import { parseMolBlock } from '../src/mol-parser';
import { assignOrbitals, type AtomOrbitals } from '../src/chem/vsepr/assign-orbitals';
import { localGeometry } from './helpers/local-geometry';
import { CARBON_DIOXIDE, ISOCYANIC_ACID, KETENE, KETENE_O_FIRST } from './references/sketches';
import { PUBCHEM_KETENE_SDF } from './fixtures';

type Vec = [number, number, number];
const sub = (a: Molecule['atoms'][number], b: Molecule['atoms'][number]): Vec => [a.x - b.x, a.y - b.y, a.z - b.z];
const unit = (v: Vec): Vec => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const built = new Map<string, { molecule: Molecule; orbitals: AtomOrbitals[] }>();

beforeAll(async () => {
  for (const [name, mol] of [['ketene', KETENE], ['ketene O-first', KETENE_O_FIRST], ['CO2', CARBON_DIOXIDE], ['HNCO', ISOCYANIC_ACID]] as const) {
    const local = await localGeometry(parseMolBlock(mol));
    if (!local) throw new Error(`no geometry for ${name}`);
    built.set(name, { molecule: local.molecule, orbitals: assignOrbitals(local.molecule) });
  }
}, 120_000);

/** Ketene's π systems are clean when each terminal's p is parallel to one of
 *  the central carbon's two p's, and the terminals' p's are at right angles. */
function expectKeteneAligned(molecule: Molecule, orbitals: AtomOrbitals[]) {
  const atoms = molecule.atoms;
  const o = atoms.findIndex((a) => a.element === 'O');
  const carbons = atoms.flatMap((a, i) => (a.element === 'C' ? [i] : []));
  const neighbours = (i: number) => molecule.bonds.flatMap((b) => (b.atom1Index === i ? [b.atom2Index] : b.atom2Index === i ? [b.atom1Index] : []));
  const central = carbons.find((c) => neighbours(c).includes(o))!;
  const ch2 = carbons.find((c) => c !== central)!;
  const axis = unit(sub(atoms[o], atoms[central]));
  const p1 = unit(orbitals[central].piDirection!);
  const p2 = unit(cross(axis, p1)); // the renderer's second p of an sp atom
  const pO = unit(orbitals[o].piDirection!);
  const pCH2 = unit(orbitals[ch2].piDirection!);
  const best = (p: Vec) => Math.max(Math.abs(dot(p, p1)), Math.abs(dot(p, p2)));
  expect(best(pO)).toBeGreaterThan(0.99);
  expect(best(pCH2)).toBeGreaterThan(0.99);
  expect(Math.abs(dot(pO, pCH2))).toBeLessThan(0.05);
}

describe('p orbitals across a cumulated π chain', () => {
  it("aligns ketene's π systems on PubChem's geometry (O listed first)", () => {
    const molecule = parseMolBlock(PUBCHEM_KETENE_SDF);
    expectKeteneAligned(molecule, assignOrbitals(molecule));
  });

  it("aligns ketene's π systems whichever atom the sketch lists first", () => {
    for (const name of ['ketene', 'ketene O-first']) {
      const { molecule, orbitals } = built.get(name)!;
      expectKeteneAligned(molecule, orbitals);
    }
  });

  it("gives ketene's oxygen its p orbital, in the CH₂ plane and across the C=C=O axis", () => {
    const { molecule, orbitals } = built.get('ketene')!;
    const atoms = molecule.atoms;
    const o = atoms.findIndex((a) => a.element === 'O');
    const [c1, c2] = [0, 1]; // the sketch's CH₂ carbon, then the central carbon
    const hs = atoms.flatMap((a, i) => (a.element === 'H' ? [i] : []));
    expect(orbitals[o].hybridization).toBe('sp²');
    expect(orbitals[o].piDirection).not.toBeNull();
    const p = unit(orbitals[o].piDirection!);
    const axis = unit(sub(atoms[o], atoms[c2]));
    const ch2Normal = unit(cross(sub(atoms[hs[0]], atoms[c1]), sub(atoms[hs[1]], atoms[c1])));
    expect(Math.abs(dot(p, axis))).toBeLessThan(0.1);
    expect(Math.abs(dot(p, ch2Normal))).toBeLessThan(0.1); // in the CH₂ plane: at right angles to the C=C π
    // and the CH₂ carbon's own p is still the plane normal
    expect(Math.abs(dot(unit(orbitals[c1].piDirection!), ch2Normal))).toBeGreaterThan(0.9);
  });

  it("gives both oxygens of CO₂ a p orbital, at right angles to each other", () => {
    const { molecule, orbitals } = built.get('CO2')!;
    const os = molecule.atoms.flatMap((a, i) => (a.element === 'O' ? [i] : []));
    const [p1, p2] = os.map((i) => orbitals[i].piDirection);
    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(Math.abs(dot(unit(p1!), unit(p2!)))).toBeLessThan(0.1);
  });

  it("sets the O of HN=C=O at right angles to the N=C π", () => {
    const { molecule, orbitals } = built.get('HNCO')!;
    const n = molecule.atoms.findIndex((a) => a.element === 'N');
    const o = molecule.atoms.findIndex((a) => a.element === 'O');
    expect(orbitals[o].piDirection).not.toBeNull();
    expect(orbitals[n].piDirection).not.toBeNull();
    expect(Math.abs(dot(unit(orbitals[o].piDirection!), unit(orbitals[n].piDirection!)))).toBeLessThan(0.1);
  });
});
