/**
 * What Valence knows about the molecule on screen, as SDF data fields — the
 * `> <NAME>` blocks after `M  END` that any SDF reader keeps. The SDF export
 * and the right-click copy both carry them; XYZ stays the structure alone.
 *
 * Per-atom values follow RDKit's atom-property-list convention: a field named
 * `atom.dprop.<NAME>` (a number per atom) or `atom.prop.<NAME>` (a word per
 * atom), the values space-separated in atom-block order, `n/a` where an atom
 * has none. RDKit puts them straight onto its atoms; other readers keep the
 * text. A per-bond list has no convention, so the Wiberg orders are a plain
 * list in bond-block order, and the field's name says so.
 *
 * Units ride in the names. Formal charges are not repeated here: they live on
 * the `M  CHG` lines, one source of truth (see moleculeToSDF).
 */
import type { Molecule } from '../mol-parser';
import type { SceneContext } from '../render';
import { gfn2LadderOnScreen, gfn2PropertiesOnScreen } from '../render';
import type { Gfn2ChargeSets, Gfn2Properties } from '../geometry/gfn2-refine';
import { gfn2ChargeSets } from '../geometry/gfn2-refine';
import type { Gfn2Ladder } from '../chem/gfn2-xtb/orbital-ladder';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { NormalMode } from '../chem/gfn2-xtb/normal-modes';

export interface SdfField {
  name: string;
  value: string;
}

/** Everything the fields are built from — gathered by `collectSdfData`. */
export interface SdfDataInput {
  molecule: Molecule;
  /** What the header says about the structure: where it came from, its name,
   *  its PubChem CID, and its warnings (a run that did not converge). */
  header: { name: string | null; source: string | null; cid: string | null; warnings: string | null };
  properties: Gfn2Properties | null;
  ladders: { alpha: Gfn2Ladder; beta: Gfn2Ladder | null } | null;
  chargeSets: Gfn2ChargeSets | null;
  /** The MMFF94 bond-charge-increment charges, when the model can type it. */
  mmff94Charges: number[] | null;
  atomOrbitals: AtomOrbitals[] | null;
  vibrations: NormalMode[] | null;
}

const HARTREE_PER_EV = 1 / 27.211386245988;
const fixed = (digits: number) => (v: number | null | undefined) =>
  (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits));
const charge = fixed(4);

/** The fields for one molecule, in reading order: what it is, how it was
 *  made, then the molecule's numbers, then the per-atom and per-bond lists. */
export function sdfDataFields(input: SdfDataInput): SdfField[] {
  const { molecule, header, properties, ladders, chargeSets } = input;
  const fields: SdfField[] = [];
  const add = (name: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') fields.push({ name, value });
  };
  const perAtom = (values: Array<number | null> | null, format: (v: number | null) => string) =>
    (values && values.length === molecule.atoms.length ? values.map(format).join(' ') : null);

  add('VALENCE_NAME', header.name);
  add('VALENCE_STRUCTURE_SOURCE', header.source);
  add('PUBCHEM_COMPOUND_CID', header.cid);
  add('VALENCE_WARNINGS', header.warnings);
  add('TOTAL_CHARGE', String(molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0)));

  if (properties) {
    add('GFN2_METHOD', 'GFN2-xTB single point at this geometry (semiempirical; OCC, in the browser)');
    add('GFN2_SPIN_MULTIPLICITY', String(properties.multiplicity));
    add('GFN2_TOTAL_ENERGY_HARTREE', fixed(8)(properties.energy));
    if (properties.dipole) {
      const [x, y, z] = properties.dipole;
      add('GFN2_DIPOLE_DEBYE', `${[x, y, z].map(fixed(4)).join(' ')}  |μ| ${fixed(4)(Math.hypot(x, y, z))}`);
    }
  }
  if (ladders) {
    // the frontier per channel: a closed shell has one ladder, an open shell two
    for (const ladder of ladders.beta ? [ladders.alpha, ladders.beta] : [ladders.alpha]) {
      const prefix = ladder.spin === 'alpha' ? 'GFN2_ALPHA_' : ladder.spin === 'beta' ? 'GFN2_BETA_' : 'GFN2_';
      const capacity = ladder.spin ? 1 : 2;
      const homo = ladder.occupations.reduce((last, o, i) => (o > 0 ? i : last), -1);
      const lumo = ladder.occupations.findIndex((o) => o < capacity);
      if (homo >= 0) add(`${prefix}HOMO_EV`, fixed(4)(ladder.energies[homo]));
      if (lumo >= 0) add(`${prefix}LUMO_EV`, fixed(4)(ladder.energies[lumo]));
      if (homo >= 0 && lumo > homo) {
        const gap = ladder.energies[lumo] - ladder.energies[homo];
        add(`${prefix}HOMO_LUMO_GAP_EV`, fixed(4)(gap));
        add(`${prefix}HOMO_LUMO_GAP_HARTREE`, fixed(6)(gap * HARTREE_PER_EV));
      }
    }
  }
  if (input.vibrations && input.vibrations.length > 0) {
    add('GFN2_HARMONIC_FREQUENCIES_PER_CM', input.vibrations.map((mode) => fixed(1)(mode.frequency)).join(' '));
  }

  if (chargeSets) add('atom.dprop.GFN2_ESP_FITTED_CHARGE', perAtom(chargeSets.espFitted, charge));
  if (properties) add('atom.dprop.GFN2_MULLIKEN_CHARGE', perAtom(properties.charges, charge));
  if (chargeSets) {
    add('atom.dprop.GFN2_CM5_CHARGE', perAtom(chargeSets.cm5, charge));
    add('atom.dprop.GFN2_HIRSHFELD_CHARGE', perAtom(chargeSets.hirshfeld, charge));
  }
  add('atom.dprop.MMFF94_BCI_CHARGE', perAtom(input.mmff94Charges, charge));
  if (properties?.spin) add('atom.dprop.GFN2_SPIN_POPULATION', perAtom(properties.spin, charge));
  if (input.atomOrbitals) {
    // the VSEPR picture's own words, in ASCII: sp3, not sp³; a metal it does
    // not describe has none
    const ascii = (label: string) => label.replace('²', '2').replace('³', '3');
    add('atom.prop.VSEPR_HYBRIDIZATION', input.atomOrbitals.map((o) => (o.described ? ascii(o.hybridization) : 'n/a')).join(' '));
    add('atom.iprop.VSEPR_LONE_PAIRS', input.atomOrbitals.map((o) => (o.described ? String(o.lonePairs) : 'n/a')).join(' '));
  }
  if (properties && properties.bondOrders.length === molecule.bonds.length) {
    add('GFN2_WIBERG_BOND_ORDERS_IN_BOND_BLOCK_ORDER', properties.bondOrders.map(fixed(3)).join(' '));
  }
  return fields;
}

/**
 * Gather the fields' inputs for the molecule on screen. Waits for what is
 * still on its way — GFN2's single point, its charge sets — so an export a
 * moment after a build carries the same data as one a minute later.
 */
export async function collectSdfData(ctx: SceneContext): Promise<SdfDataInput | null> {
  const molecule = ctx.currentMolecule;
  if (!molecule) return null;
  if (!gfn2PropertiesOnScreen(ctx)) await ctx.gfn2PropertiesRequest?.done;
  if (ctx.currentMolecule !== molecule) return null;
  const properties = gfn2PropertiesOnScreen(ctx);
  gfn2LadderOnScreen(ctx); // builds both channels' ladders
  let chargeSets: Gfn2ChargeSets | null = null;
  if (properties) {
    chargeSets = ctx.gfn2ChargeSets?.key === properties.key
      ? ctx.gfn2ChargeSets.sets
      : await gfn2ChargeSets(properties.key).catch(() => null);
  }
  const text = (id: string) => document.getElementById(id)?.textContent?.trim() || null;
  const link = document.getElementById('mol-link') as HTMLAnchorElement | null;
  const cid = link && link.style.display !== 'none' ? link.href.match(/compound\/(\d+)/)?.[1] ?? null : null;
  const warnings = document.getElementById('mol-warnings');
  return {
    molecule,
    header: {
      // the header's own text — it already says what every path (a build, an
      // example, a refinement, a loaded view) made of this structure
      name: text('mol-name')?.replace(/^·\s*/, '') ?? null,
      source: text('mol-source'),
      cid,
      warnings: warnings && !warnings.classList.contains('hidden') ? text('mol-warnings') : null,
    },
    properties,
    ladders: properties ? ctx.gfn2Ladders?.ladders ?? null : null,
    chargeSets,
    mmff94Charges: ctx.charges?.charges ?? null,
    atomOrbitals: ctx.atomOrbitals,
    vibrations: ctx.vibrations?.molecule === molecule ? ctx.vibrations.modes : null,
  };
}
