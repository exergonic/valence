/**
 * The bonding guard: an optimised structure is shown only if it still has the
 * bonds the sketch draws (src/geometry/bond-integrity.ts). It must catch the
 * real failure that prompted it — a "converged" hexan-2-amine with broken C–H
 * bonds and two H2 molecules — and pass the app's real optimised geometries,
 * the awkward ones included: diborane's bridges (B···B 1.77 A, undrawn), PCl5's
 * long axial bonds, SF6, a nickel complex. Each must really have been
 * optimised: an example that fell back to its unoptimised start would pass
 * for the wrong reason.
 *
 * And it must grade a drawn bond that stretched: the 2-phenylbut-2-ene
 * bromonium's long C–Br is a partial bond, shown dashed; the
 * 1,1-diphenylethylene bromonium's has come apart, its result set aside but
 * kept. Both are GFN2 minima from the Fortran xtb oracle, and the Wiberg
 * orders the guard reads are GFN2's own at them.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { assessBonding, heldRestraint, isMoleculeDrawn, markBondingChanges } from '../src/geometry/bond-integrity';
import { computeLocalGeometry } from '../src/geometry/local-geometry';
import type { Gfn2Result } from '../src/geometry/gfn2-refine';
import { localGeometry } from './helpers/local-geometry';
import type { LocalGeometry } from '../src/geometry/local-geometry';
import { EXAMPLES } from '../src/ui/examples';
import { HEXAN_2_AMINE_BROKEN } from './references/broken-results';
import { DIPHENYLETHYLENE_BROMONIUM, PHENYLBUTENE_BROMONIUM } from './references/bromonium-ions';
import { DIPHENYLETHYLENE_BROMONIUM as DIPHENYLETHYLENE_BROMONIUM_SKETCH } from './references/sketches';
import { NAOH } from './references/oracle-minima';

const ACCEPTED = ['Diborane', 'Phosphorus pentachloride', 'Sulfur hexafluoride', 'Tetrachloronickelate', 'Benzene'];
const runs = new Map<string, LocalGeometry | null>();

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));

/** The index of the bond between atoms `a` and `b`, numbered from 1. */
const bondIndex = (molecule: Molecule, a: number, b: number) =>
  molecule.bonds.findIndex((bond) =>
    (bond.atom1Index === a - 1 && bond.atom2Index === b - 1) || (bond.atom1Index === b - 1 && bond.atom2Index === a - 1));

/** GFN2's Wiberg orders at a structure, one per bond: a single point. */
async function wibergOrders(molecule: Molecule): Promise<number[]> {
  const { propertiesAt } = await import('../src/geometry/gfn2-refine.worker');
  const properties = await propertiesAt(molecule, vendorFile);
  if (!properties) throw new Error('no GFN2 single point');
  return properties.bondOrders;
}

/** A refiner's answer, as GFN2 would give it, for the pipeline tests. */
const run = (molecule: Molecule, bondOrders: number[] | null): Gfn2Result => ({
  molecule,
  converged: true,
  energyHartree: 0,
  iterations: 1,
  milliseconds: 1,
  charges: null,
  bondOrders,
  lowestFrequency: null,
  saddleEscapes: 0,
  multiplicity: 1,
  vibrations: null,
  held: null,
});

describe('assessBonding', () => {
  beforeAll(async () => {
    for (const name of ACCEPTED) {
      const example = EXAMPLES.find((e) => e.name.startsWith(name))!;
      const sketch = parseMolBlock(example.mol);
      runs.set(name, await localGeometry(example.multiplicity ? { ...sketch, multiplicity: example.multiplicity } : sketch));
    }
  }, 300_000);

  it('catches the "converged" hexan-2-amine that had come apart', () => {
    const verdict = assessBonding(parseMolBlock(HEXAN_2_AMINE_BROKEN), null);
    expect(verdict.formed).toMatch(/new bond/);
    expect(verdict.broken).toMatch(/came apart/);
  });

  it.each(ACCEPTED)('passes the optimised %s', (name) => {
    const local = runs.get(name)!;
    expect(local.engine).toBe('gfn2'); // optimised, and accepted by the guard in the pipeline
    expect(local.gfn2!.bondOrders).toHaveLength(local.molecule.bonds.length);
    expect(assessBonding(local.molecule, local.gfn2!.bondOrders)).toEqual({ stretched: [], partial: [], broken: null, formed: null, formedPairs: [] });
  });
});

describe('a drawn bond that stretched', () => {
  let phenylbutene: number[];
  let diphenylethylene: number[];
  beforeAll(async () => {
    phenylbutene = await wibergOrders(PHENYLBUTENE_BROMONIUM);
    diphenylethylene = await wibergOrders(DIPHENYLETHYLENE_BROMONIUM);
  }, 120_000);

  it('the phenylbutene bromonium\'s long C3–Br is a partial bond', () => {
    const verdict = assessBonding(PHENYLBUTENE_BROMONIUM, phenylbutene);
    expect(verdict.stretched).toEqual([bondIndex(PHENYLBUTENE_BROMONIUM, 3, 5)]);
    expect(verdict.partial).toHaveLength(1);
    expect(verdict.partial[0]).toMatch(/^C3–Br5 is 2\.60 Å, .* Wiberg order of 0\.20: a partial bond/);
    expect(verdict.broken).toBeNull();
    expect(verdict.formed).toBeNull();
  });

  it('the diphenylethylene bromonium\'s C2–Br has come apart', () => {
    const verdict = assessBonding(DIPHENYLETHYLENE_BROMONIUM, diphenylethylene);
    expect(verdict.stretched).toEqual([bondIndex(DIPHENYLETHYLENE_BROMONIUM, 2, 4)]);
    expect(verdict.partial).toEqual([]);
    expect(verdict.broken).toMatch(/^the C2–Br4 bond came apart \(2\.75 Å, Wiberg 0\.0[89]\)$/);
  });

  it('without bond orders, a stretched bond is taken as come apart', () => {
    const verdict = assessBonding(PHENYLBUTENE_BROMONIUM, null);
    expect(verdict.partial).toEqual([]);
    expect(verdict.broken).toMatch(/^the C3–Br5 bond came apart \(2\.60 Å\)$/);
  });

  it('GFN2\'s own run hands back the Wiberg orders the guard reads', async () => {
    const { optimizeWithGfn2 } = await import('../src/geometry/gfn2-refine.worker');
    const refined = await optimizeWithGfn2(PHENYLBUTENE_BROMONIUM, vendorFile);
    expect(refined?.converged).toBe(true);
    expect(refined!.bondOrders![bondIndex(PHENYLBUTENE_BROMONIUM, 3, 5)]).toBeCloseTo(0.20, 1);
    expect(assessBonding(refined!.molecule, refined!.bondOrders).partial).toHaveLength(1);
  }, 120_000);

  it('a mark from an earlier structure is cleared', () => {
    const marked = markBondingChanges(PHENYLBUTENE_BROMONIUM, { stretched: [0, 3], formedPairs: [[0, 4]] });
    expect(marked.bonds.filter((b) => b.stretched)).toHaveLength(2);
    expect(marked.formedContacts).toEqual([[0, 4]]);
    const remarked = markBondingChanges(marked, { stretched: [3], formedPairs: [] });
    expect(remarked.bonds.map((b, i) => (b.stretched ? i : -1)).filter((i) => i >= 0)).toEqual([3]);
    expect('stretched' in remarked.bonds[0]).toBe(false);
    expect('formedContacts' in remarked).toBe(false);
  });
});

describe('the local pipeline with a result whose bonding changed', () => {
  it('sets a result with a formed bond aside, the start shown, the result kept', async () => {
    // A refiner that hands back the broken structure, as GFN2 once did, with
    // no held structure: the pipeline must not call it optimised, and shows
    // the start — but the result is a click away, its new contacts dashed.
    const broken = parseMolBlock(HEXAN_2_AMINE_BROKEN);
    const local = await computeLocalGeometry(broken, undefined, async () => run(broken, null));
    expect(local?.engine).toBe('unrefined');
    expect(local?.unrefinedReason).toMatch(/no longer had the bonds drawn/);
    expect(local?.bondingChange).toMatch(/a new bond/);
    expect(local?.setAside?.engine).toBe('gfn2');
    expect(local!.setAside!.molecule.formedContacts!.length).toBeGreaterThan(0);
  });

  it('shows a partial bond, marked stretched, and says so', async () => {
    const orders = await wibergOrders(PHENYLBUTENE_BROMONIUM);
    const local = await computeLocalGeometry(PHENYLBUTENE_BROMONIUM, undefined, async () => run(PHENYLBUTENE_BROMONIUM, orders));
    expect(local?.engine).toBe('gfn2');
    expect(local!.molecule.bonds.map((b, i) => (b.stretched ? i : -1)).filter((i) => i >= 0))
      .toEqual([bondIndex(PHENYLBUTENE_BROMONIUM, 3, 5)]);
    expect(local!.partialBonds).toHaveLength(1);
  }, 60_000);

  it('sets a come-apart result aside, but keeps it for the asking', async () => {
    const orders = await wibergOrders(DIPHENYLETHYLENE_BROMONIUM);
    const local = await computeLocalGeometry(DIPHENYLETHYLENE_BROMONIUM, undefined, async () => run(DIPHENYLETHYLENE_BROMONIUM, orders));
    expect(local?.engine).toBe('unrefined'); // no held structure from this refiner
    expect(local!.bondingChange).toMatch(/C2–Br4 bond came apart/);
    expect(local!.setAside?.engine).toBe('gfn2');
    expect(local!.setAside!.molecule.bonds[bondIndex(DIPHENYLETHYLENE_BROMONIUM, 2, 4)].stretched).toBe(true);
  }, 60_000);
});

describe('the held structure', () => {
  // The wall at the guard's limits: nothing inside them, a stiff harmonic
  // push past them, and its gradient the derivative of its energy.
  it('costs nothing while the drawn bonding holds', () => {
    expect(heldRestraint(NAOH).energy).toBe(0);
  });

  it('pushes a stretched drawn bond back, its gradient the derivative of its energy', () => {
    const { energy, gradient } = heldRestraint(DIPHENYLETHYLENE_BROMONIUM); // C2···Br4 at 2.75 Å
    expect(energy).toBeGreaterThan(0);
    const BOHR = 0.529177210903;
    const h = 1e-5; // Å
    for (const [atom, c] of [[1, 0], [3, 1], [3, 2], [0, 0]] as const) {
      const moved = (sign: number) => ({ ...DIPHENYLETHYLENE_BROMONIUM,
        atoms: DIPHENYLETHYLENE_BROMONIUM.atoms.map((a, i) => (i !== atom ? a
          : { ...a, x: a.x + (c === 0 ? sign * h : 0), y: a.y + (c === 1 ? sign * h : 0), z: a.z + (c === 2 ? sign * h : 0) })) });
      const numerical = (heldRestraint(moved(1)).energy - heldRestraint(moved(-1)).energy) / (2 * h / BOHR);
      expect(gradient[atom][c]).toBeCloseTo(numerical, 6);
    }
  });

  it("holds the diphenylethylene bromonium bridged, GFN2's open ion kept behind the button", async () => {
    const local = await localGeometry(parseMolBlock(DIPHENYLETHYLENE_BROMONIUM_SKETCH));
    expect(local?.engine).toBe('held');
    expect(local!.held!.restrained).toBe(true);
    expect(isMoleculeDrawn(local!.molecule)).toBe(true);
    // the bridge held at the wall, drawn dashed; the free ion open behind it
    const cBr = bondIndex(local!.molecule, 3, 2);
    const atoms = local!.molecule.atoms;
    const r = Math.hypot(atoms[2].x - atoms[1].x, atoms[2].y - atoms[1].y, atoms[2].z - atoms[1].z);
    expect(r).toBeGreaterThan(2.4);
    expect(r).toBeLessThan(2.55);
    expect(local!.molecule.bonds[cBr].stretched).toBe(true);
    expect(local!.bondingChange).toMatch(/C3–Br2 bond came apart/);
    expect(local!.setAside?.engine).toBe('gfn2');
    expect(local!.held!.energyHartree).toBeGreaterThan(local!.setAside!.gfn2!.energyHartree);
  }, 120_000);
});
