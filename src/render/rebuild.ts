import * as THREE from 'three';
import { activeIsoValue, isGfn2ChargeModel, type ChargeModel, type LocalizedList, type SceneContext } from './setup';
import { renderAtoms } from './atoms';
import { renderBonds } from './bonds';
import { renderHybridOrbitals } from './hybrid-orbitals';
import { renderLabels, renderChargeLabels, renderHybridizationLabels, renderBondOrderLabels, renderSpinLabels } from './labels';
import { renderOrbitalLabels } from './orbital-labels';
import { renderPiSystems, tintPiSystemLobes } from './pi-systems';
import { renderDipole } from './dipole';
import { renderEsp } from './esp';
import { renderMoOrbitals, MO_PHASE_PAIRS } from './mo-lobes';
import { computeEspSurface, espVmax } from '../chem/charge-model/esp';
import { computeMoField, levelForFraction, marchMoField } from '../chem/extended-huckel/mo-surface';
import { renderMoIsosurface } from './mo-isosurface';
import { applyAtomStyle } from './atom-styles';
import { hsvToHex } from './color-schemes';
import { assignOrbitals } from '../chem/vsepr/assign-orbitals';
import {
  dipoleFromCharges, dipoleFromFullGfn2, DIPOLE_APPROXIMATE, DIPOLE_RESIDUAL_CHARGE, type DipoleResult,
} from '../chem/charge-model/dipole';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import {
  gfn2PropertiesAt, gfn2OrbitalSurface, gfn2EspSurface, gfn2ChargeSets,
  type Gfn2EspSurface, type Gfn2ChargeSets, type Gfn2Properties,
} from '../geometry/gfn2-refine';
import { gfn2Ladders, gfn2OrbitalSpace, type Gfn2Ladder } from '../chem/gfn2-xtb/orbital-ladder';
import { syncVibration } from './vibration';
import { solveExtendedHuckel } from '../chem/extended-huckel/solve';
import { extendedHuckelSpace, localizeOrbitals } from '../chem/localized-orbitals/localize-pm';
import { orderLocalizedOrbitals } from '../chem/localized-orbitals/order-localized';
import { fockCouplings } from '../chem/localized-orbitals/fock-couplings';
import { lewisOrbitals } from '../chem/localized-orbitals/lewis-orbitals';
import type { Molecule } from '../mol-parser';
import { resolveCharges } from '../chem/charge-model/bci-charges';
import { labelPaletteFor } from './label-colors';

// Remove every mesh from a group (recursively into nested groups),
// disposing GPU resources. The molecule, orbital, and label groups are
// rebuilt wholesale whenever a molecule loads or a display setting
// changes.
function clearGroup(g: THREE.Group) {
  while (g.children.length > 0) {
    const child = g.children[0];
    g.remove(child);
    if (child instanceof THREE.Group) {
      clearGroup(child);
    }
    if (child instanceof THREE.Mesh) {
      // the orbital lobes share one geometry per kind (lobes.ts)
      if (!child.geometry.userData.shared) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

/** True when the engine was asked for this molecule's charges and could not
 *  give them (an element outside GFN2's table, no Worker, a failed SCC). */
function gfn2ChargesFailed(ctx: SceneContext): boolean {
  const request = ctx.gfn2PropertiesRequest;
  return request !== null && request.molecule === ctx.currentMolecule && request.status === 'failed';
}

/** The charges each GFN2 option beyond Mulliken reads from its charge sets. */
const CHARGE_SET: Partial<Record<ChargeModel, 'espFitted' | 'cm5'>> = {
  'gfn2-esp': 'espFitted',
  'gfn2-cm5': 'cm5',
};

/** True when this GFN2 option cannot have charges for the molecule on screen:
 *  the worker failed to build its set, or built it without this one. */
function chargeSetMissing(ctx: SceneContext, model: ChargeModel): boolean {
  const field = CHARGE_SET[model];
  if (!field) return false;
  const key = ctx.gfn2Properties?.molecule === ctx.currentMolecule ? ctx.gfn2Properties?.properties.key : undefined;
  if (key === undefined) return false;
  if (ctx.gfn2ChargeSetsRequest?.key === key && ctx.gfn2ChargeSetsRequest.failed) return true;
  return ctx.gfn2ChargeSets?.key === key && ctx.gfn2ChargeSets.sets[field] === null;
}

/**
 * The charge model on screen for this molecule: the one the control selects,
 * or another when the selected one has no charges for it — MMFF94 when the
 * engine failed, the default (ESP-fitted) when the molecule is outside
 * MMFF94's type space, Mulliken when an ESP-fitted or CM5 set could not be
 * built. The selection itself is left alone (it is the user's intent, and the
 * next molecule may honour it).
 */
function effectiveChargeModel(ctx: SceneContext): ChargeModel {
  let chosen = ctx.display.chargeModel;
  if (isGfn2ChargeModel(chosen) && gfn2ChargesFailed(ctx) && ctx.charges) return 'mmff94';
  if (chosen === 'mmff94' && !ctx.charges && ctx.currentMolecule && !gfn2ChargesFailed(ctx)) chosen = 'gfn2-esp';
  if (chargeSetMissing(ctx, chosen)) return 'gfn2';
  return chosen;
}

/** What each charge set is, for the line under the control. */
const CHARGE_MODEL_ABOUT: Record<ChargeModel, string> = {
  gfn2: 'Mulliken: each basis function’s electrons go to the atom it sits on, and a pair shared between two '
    + 'atoms is split evenly. The charges GFN2-xTB’s own energy uses.',
  'gfn2-esp': 'ESP-fitted (Merz–Kollman): the point charges that best reproduce GFN2-xTB’s potential on shells '
    + 'outside the molecule — the closest any point charges come to the surface and the dipole. An atom buried '
    + 'inside its neighbours (a CH₂ carbon) is barely seen from outside, so its charge is poorly determined '
    + 'and swings with the conformation.',
  'gfn2-cm5': 'CM5: Hirshfeld charges — the density at each point shared among the atoms as their free atoms '
    + 'would claim it — plus a correction for each bond, fitted to reproduce dipole moments. Real-space, and '
    + 'steady from one conformation to the next.',
  mmff94: 'MMFF94 BCI: a force field’s charges, from bond-charge increments by atom type — no electronic '
    + 'structure. The ESP surface and the dipole are these charges’ own.',
};

/**
 * Keep the charge-model control honest: it shows the model on screen, and
 * disables the one with no charges for this molecule. GFN2-xTB is on offer for
 * every molecule — the engine's own charges, or a single point at the
 * displayed geometry.
 */
export function syncChargeModelControl(ctx: SceneContext) {
  const select = document.getElementById('ctrl-charge-model') as HTMLSelectElement | null;
  if (!select) return;
  const gfn2Failed = gfn2ChargesFailed(ctx);
  const mmff94Missing = ctx.currentMolecule !== null && !ctx.charges;
  for (const option of Array.from(select.options)) {
    const model = option.value as ChargeModel;
    option.disabled = model === 'mmff94' ? mmff94Missing : gfn2Failed || chargeSetMissing(ctx, model);
  }
  const shown = effectiveChargeModel(ctx);
  select.title = gfn2Failed
    ? `GFN2-xTB could not give charges for this molecule (${ctx.gfn2PropertiesRequest?.reason ?? 'the engine failed'}).`
    : mmff94Missing
      ? 'This molecule is outside the MMFF94 type space, so it has no MMFF94 charges.'
      : chargeSetMissing(ctx, ctx.display.chargeModel)
        ? 'GFN2-xTB could not build that charge set for this molecule, so its Mulliken charges are shown.'
        : 'Which partial charges the charge labels print.';
  select.value = shown;
  const about = document.getElementById('charge-model-about');
  if (about) about.textContent = CHARGE_MODEL_ABOUT[shown];
}

/**
 * Ask the engine for its single point at the molecule on screen, once per
 * molecule, in the background: the display draws as soon as it arrives. Every
 * structure gets one, a GFN2-optimised one included — its charges came with
 * the run, but the bond orders, the spin and the orbitals did not, and one SCC
 * costs milliseconds at these sizes.
 */
function requestGfn2Properties(ctx: SceneContext): void {
  const molecule = ctx.currentMolecule;
  if (!molecule || ctx.gfn2Properties?.molecule === molecule) return;
  if (ctx.gfn2PropertiesRequest?.molecule === molecule) return;
  const request: NonNullable<SceneContext['gfn2PropertiesRequest']> = { molecule, status: 'pending' };
  ctx.gfn2PropertiesRequest = request;
  const settle = (properties: Gfn2Properties | null, reason?: string) => {
    if (ctx.currentMolecule !== molecule) return; // the molecule changed meanwhile
    if (properties && properties.charges.length === molecule.atoms.length) {
      ctx.gfn2Properties = { molecule, properties };
      ctx.gfn2PropertiesRequest = null;
    } else {
      ctx.gfn2PropertiesRequest = { molecule, status: 'failed', reason: reason ?? 'the engine returned nothing' };
    }
    ctx.rerender();
    // the orbital panel waited on this, either for the orbitals or for word
    // that extended Hückel's must stand in
    ctx.onGfn2Orbitals();
  };
  request.done = gfn2PropertiesAt(molecule).then(
    (properties) => settle(properties),
    (error) => settle(null, (error as Error)?.message),
  );
}

/** GFN2's single point for the molecule on screen, or null while it runs (or
 *  when it failed) — asking for it if nobody has yet. */
export function gfn2PropertiesOnScreen(ctx: SceneContext): Gfn2Properties | null {
  if (ctx.gfn2Properties && ctx.gfn2Properties.molecule === ctx.currentMolecule) return ctx.gfn2Properties.properties;
  if (!gfn2ChargesFailed(ctx)) requestGfn2Properties(ctx);
  return null;
}

/**
 * The partial charges on display, and which model they are — ONE array for
 * the charge labels, the ESP surface and the dipole, so the three describe one
 * charge distribution. GFN2-xTB's ESP-fitted charges by default: null while
 * the single point or the fit is still running (the labels fill in when they
 * land), MMFF94 in its place when the engine cannot treat the molecule.
 * MMFF94 when the user picks it.
 */
function displayedCharges(ctx: SceneContext): { charges: number[] | null; model: ChargeModel; residual: boolean } {
  const model = effectiveChargeModel(ctx);
  if (model === 'mmff94') {
    return { charges: ctx.charges?.charges ?? null, model: 'mmff94', residual: ctx.charges?.residualCharge ?? false };
  }
  // ESP-fitted or CM5: from the single point's charge sets, null while the
  // worker builds them
  const field = CHARGE_SET[model];
  if (field) {
    const properties = gfn2PropertiesOnScreen(ctx);
    const sets = properties ? gfn2ChargeSetsOnScreen(ctx, properties) : null;
    return { charges: sets?.[field] ?? null, model, residual: false };
  }
  // the optimiser's own charges when this structure is its result, else the
  // single point's
  if (ctx.gfn2Charges && ctx.gfn2Charges.molecule === ctx.currentMolecule) {
    return { charges: ctx.gfn2Charges.charges, model: 'gfn2', residual: false };
  }
  const properties = gfn2PropertiesOnScreen(ctx);
  return { charges: properties?.charges ?? null, model: 'gfn2', residual: false };
}

/** GFN2's orbital ladder in the spin channel the panel shows, or null while
 *  the single point runs (or when the engine build cannot describe its basis). */
export function gfn2LadderOnScreen(ctx: SceneContext): Gfn2Ladder | null {
  const properties = gfn2PropertiesOnScreen(ctx);
  if (!properties || !ctx.currentMolecule) return null;
  if (ctx.gfn2Ladders?.properties !== properties) {
    ctx.gfn2Ladders = { properties, ladders: gfn2Ladders(ctx.currentMolecule, properties) };
  }
  const ladders = ctx.gfn2Ladders.ladders;
  if (!ladders) return null;
  return ctx.display.moSpin === 'beta' && ladders.beta ? ladders.beta : ladders.alpha;
}

/**
 * The Localized view's orbitals: GFN2-xTB's once the single point is in — each
 * spin channel of an open shell localized on its own — and extended Hückel's
 * only when GFN2 has none to give (the engine failed, or a build without the
 * orbital bindings). 'pending' while the single point runs. Localized on first
 * ask and kept until the orbitals change: Pipek–Mezey costs up to a second
 * (PCl₅) on the main thread, and no other view reads it.
 */
export function localizedOnScreen(ctx: SceneContext): LocalizedList | 'pending' | null {
  const molecule = ctx.currentMolecule;
  if (!molecule) return null;
  const properties = gfn2PropertiesOnScreen(ctx);
  if (!properties && !gfn2ChargesFailed(ctx)) return 'pending';
  const ladder = properties ? gfn2LadderOnScreen(ctx) : null;
  const from = ladder ?? ctx.ehResult;
  if (!from) return null;
  // Every list built for this molecule is kept, not just the one on screen:
  // an open shell's two spin channels are two lists, and keeping one meant
  // that going back from β to α localized α all over again (0.9 s for the
  // triplet NiCl₄²⁻).
  const build = (method: LocalizedList['method']): LocalizedList => {
    const kept = ctx.localizedLists.find((list) => list.from === from && list.method === method);
    if (kept) return kept;
    const base = {
      source: ladder ? 'gfn2' as const : 'eh' as const, method, spin: ladder?.spin ?? null, basis: from.basis, from,
    };
    let list: LocalizedList;
    if (method === 'lewis') {
      list = { ...base, ...lewisList(molecule, ladder) };
    } else {
      const space = ladder ? gfn2OrbitalSpace(ladder) : extendedHuckelSpace(molecule, ctx.ehResult!);
      const sets = space && localizeOrbitals(space, molecule.atoms.map((atom) => atom.element));
      const orbitals = space && sets ? orderLocalizedOrbitals(molecule, space, sets) : null;
      list = {
        ...base,
        orbitals,
        couplings: space && orbitals ? fockCouplings(space.hamiltonian, orbitals) : null,
        donation: null,
        lewisShare: null,
        rydbergs: 0,
        refusal: null,
      };
    }
    ctx.localizedLists.push(list);
    return list;
  };
  const chosen = build(ctx.display.localizeMethod);
  // The Lewis structure is the default, and a drawing it cannot describe
  // (diborane's bridges, a metal, an open shell) still gets localized
  // orbitals: Pipek–Mezey's, carrying the reason the Lewis ones are not there.
  if (chosen.method === 'lewis' && chosen.refusal) {
    return (ctx.localized = { ...build('pipek-mezey'), refusal: chosen.refusal });
  }
  return (ctx.localized = chosen);
}

/** The drawn Lewis structure's orbitals and their E(2), or the reason there
 *  are none. They need GFN2's Fock matrix and a closed shell: a Lewis
 *  structure pairs every electron. */
function lewisList(molecule: Molecule, ladder: Gfn2Ladder | null) {
  const none = (refusal: string) => ({
    orbitals: null, couplings: null, donation: null, lewisShare: null, rydbergs: 0, refusal,
  });
  if (!ladder) return none('they are built from GFN2-xTB’s density and Fock matrix, and GFN2-xTB had none for this structure');
  if (ladder.spin) return none('this is an open shell, and a Lewis structure pairs every electron');
  const space = gfn2OrbitalSpace(ladder);
  if (!space) return none('GFN2-xTB leaves a level at the frontier partly filled, so which orbitals are occupied is not settled');
  const result = lewisOrbitals(molecule, space);
  if ('refusal' in result) return none(result.refusal);
  const { orbitals, couplings, donation, lewisShare, rydbergs } = result.lewis;
  return { orbitals, couplings, donation, lewisShare, rydbergs, refusal: null };
}

/** An orbital's field is sampled around the atoms holding more than this
 *  share of it (Mulliken): enough to box the surface at any level offered,
 *  without sampling empty space around atoms it barely touches. */
const SURFACE_ATOM_SHARE = 0.02;

const atomsHolding = (shares: number[]) => shares.flatMap((share, atom) => (share > SURFACE_ATOM_SHARE ? [atom] : []));

/** One GFN2 orbital to draw: any coefficient vector in its basis — a canonical
 *  MO or a localized one — under a name the worker caches its field by. */
interface Gfn2Pick {
  orbital: string;
  coefficients: number[];
  /** The atoms it has a share on: the box its field is built in. */
  atoms: number[];
  phase: [number, number];
}

/**
 * Draw GFN2 orbitals. Their surfaces are built in the worker — the field and
 * its gradient need the engine's own basis — so the first draw asks for each
 * and the picture fills in when it lands; after that it is cached by orbital
 * and level like extended Hückel's.
 */
function drawGfn2Orbitals(ctx: SceneContext, properties: Gfn2Properties, picks: Gfn2Pick[]): void {
  const value = activeIsoValue(ctx.display);
  const mode = ctx.display.isoMode;
  for (const pick of picks) {
    const key = `gfn2:${properties.key}:${pick.orbital}@${mode === 'percentile' ? 'p' : 'a'}${value}`;
    const surface = ctx.moSurfaces.get(key);
    if (surface) {
      renderMoIsosurface(ctx.moGroup, surface, ctx.display.orbitalPreset, ctx.display.moOpacity, pick.phase);
      continue;
    }
    if (ctx.gfn2SurfaceRequests.has(key)) continue;
    ctx.gfn2SurfaceRequests.add(key);
    const molecule = ctx.currentMolecule;
    gfn2OrbitalSurface({ key: properties.key, orbital: pick.orbital, coefficients: pick.coefficients, atoms: pick.atoms, mode, value })
      .then((result) => {
        ctx.gfn2SurfaceRequests.delete(key);
        if (result && ctx.currentMolecule === molecule) {
          ctx.moSurfaces.set(key, result);
          ctx.rerender();
        }
      })
      .catch(() => ctx.gfn2SurfaceRequests.delete(key));
  }
}

/** The selected GFN2 orbitals, from the ladder or the localized list. True when
 *  one is selected (drawn or on its way), so the hybrid lobes step aside. */
function drawSelectedGfn2Orbitals(ctx: SceneContext, localized: LocalizedList | null): boolean {
  const properties = gfn2PropertiesOnScreen(ctx);
  if (!properties) return false;
  const picks: Gfn2Pick[] = [];
  if (localized) {
    ctx.display.localizedSelection.forEach((index, slot) => {
      const orbital = localized.orbitals?.[index];
      if (!orbital) return;
      picks.push({
        orbital: `${localized.method}:${localized.spin ?? 'alpha'}:${index}`,
        coefficients: orbital.coefficients,
        atoms: atomsHolding(orbital.populations),
        phase: MO_PHASE_PAIRS[slot % MO_PHASE_PAIRS.length],
      });
    });
  } else {
    const index = ctx.display.moIndex;
    const ladder = gfn2LadderOnScreen(ctx);
    if (index !== null && ladder?.coefficients[index]) {
      picks.push({
        orbital: `${ladder.spin ?? 'alpha'}:${index}`,
        coefficients: ladder.coefficients[index],
        atoms: atomsHolding(ladder.atomShares[index]),
        phase: MO_PHASE_PAIRS[0],
      });
    }
  }
  drawGfn2Orbitals(ctx, properties, picks);
  return picks.length > 0;
}

/** Spin density is only on offer for an open-shell structure; the option says
 *  why when it is not. Bond orders wait on the single point, silently. */
function syncLabelModeControl(properties: Gfn2Properties | null) {
  const option = document.querySelector<HTMLOptionElement>('#ctrl-label-mode option[value="spin"]');
  if (!option || !properties) return;
  option.disabled = properties.spin === null;
  option.textContent = properties.spin === null ? 'Spin density (closed shell: none)' : 'Spin density';
}

/**
 * GFN2's ESP surface for the single point on screen, or null while the worker
 * builds it (or when it could not) — asking for it if nobody has yet.
 */
function gfn2EspOnScreen(ctx: SceneContext, properties: Gfn2Properties): SceneContext['gfn2Esp'] {
  if (ctx.gfn2Esp?.key === properties.key) return ctx.gfn2Esp;
  if (ctx.gfn2EspRequest?.key === properties.key) return null;
  ctx.gfn2EspRequest = { key: properties.key, failed: false };
  const molecule = ctx.currentMolecule;
  const settle = (surface: Gfn2EspSurface | null) => {
    if (ctx.currentMolecule !== molecule || ctx.gfn2EspRequest?.key !== properties.key) return;
    if (surface) {
      const potentials = surface.potentials;
      ctx.gfn2Esp = {
        key: properties.key,
        exact: { ...surface, vmax: espVmax(Array.from(potentials)) },
      };
    } else {
      ctx.gfn2EspRequest = { key: properties.key, failed: true };
    }
    ctx.rerender();
  };
  gfn2EspSurface(properties.key).then(settle, () => settle(null));
  return null;
}

/**
 * GFN2's ESP-fitted, Hirshfeld and CM5 charges for the single point on screen,
 * or null while the worker builds them (or when it could not) — asking for
 * them if nobody has yet.
 */
function gfn2ChargeSetsOnScreen(ctx: SceneContext, properties: Gfn2Properties): Gfn2ChargeSets | null {
  if (ctx.gfn2ChargeSets?.key === properties.key) return ctx.gfn2ChargeSets.sets;
  if (ctx.gfn2ChargeSetsRequest?.key === properties.key) return null;
  ctx.gfn2ChargeSetsRequest = { key: properties.key, failed: false };
  const molecule = ctx.currentMolecule;
  const settle = (sets: Gfn2ChargeSets | null) => {
    if (ctx.currentMolecule !== molecule || ctx.gfn2ChargeSetsRequest?.key !== properties.key) return;
    if (sets) ctx.gfn2ChargeSets = { key: properties.key, sets };
    else ctx.gfn2ChargeSetsRequest = { key: properties.key, failed: true };
    ctx.rerender();
  };
  gfn2ChargeSets(properties.key).then(settle, () => settle(null));
  return null;
}

/** The header's dipole readout — which model it came from is in the hover. */
function showDipoleReadout(ctx: SceneContext, dipole: DipoleResult | null, model: ChargeModel, pending: boolean, full: boolean) {
  const element = document.getElementById('mol-dipole');
  if (!element) return;
  element.classList.toggle('unsupported', !dipole && !pending);
  const convention = 'The arrow points from the positive end (δ+) toward the negative end (δ−) — the chemistry '
    + 'convention; the physics convention draws it the other way.';
  if (dipole) {
    element.textContent = `Dipole: ${dipole.debye.toFixed(2)} D`;
    element.title = isGfn2ChargeModel(model)
      ? (full
        ? (model === 'gfn2'
          ? 'The full GFN2-xTB dipole: the Mulliken point charges the labels print, plus each atom’s own dipole '
            + '(the lone pairs’ lopsidedness a point charge cannot hold) — the same picture the ESP surface draws, so '
            + 'it need not add up from the labels. '
          : 'The full GFN2-xTB dipole, from its electron density — the same whichever charges the labels print. ')
          + 'Semiempirical: water reads 2.28 D against experiment’s 1.85 D. '
        : 'The dipole of the GFN2-xTB Mulliken point charges alone: the engine could not give its full dipole '
          + 'for this structure. ') + convention
      : 'The dipole of the MMFF94 BCI partial charges (a charge model, not a quantum-mechanical dipole). '
        // The MMFF94 caveats belong to this model only, so they ride on its
        // readout rather than in the Info log, which outlives a model switch.
        + (ctx.currentMolecule && parameterGapWarnings(ctx.currentMolecule).length > 0 ? DIPOLE_APPROXIMATE + '. ' : '')
        + (dipole.residualCharge ? DIPOLE_RESIDUAL_CHARGE + ' ' : '')
        + convention;
  } else if (pending) {
    element.textContent = 'Dipole: …';
    element.title = 'Computing GFN2-xTB charges (the first molecule loads the engine).';
  } else {
    element.textContent = ctx.currentMolecule ? 'Dipole: n/a' : '';
    element.title = '';
  }
}

// Rebuild all molecule meshes from ctx.currentMolecule without touching the
// camera. Used for display settings (atom size, orbital style, colors).
export function rebuildDisplay(ctx: SceneContext) {
  redrawScene(ctx);
  // last: the groups are new, so a playing vibration takes up the new meshes
  syncVibration(ctx);
}

function redrawScene(ctx: SceneContext) {
  // Before the molecule guard: with no molecule on screen the GFN2 option has
  // nothing to describe either, and the control must not offer it.
  syncChargeModelControl(ctx);
  if (!ctx.currentMolecule) return;
  // Atom lighting first — the atoms below build their materials from it.
  // Every rebuild path (dropdown, loaded view, share link) comes through here.
  applyAtomStyle(ctx, ctx.display.atomStyle);
  clearGroup(ctx.moleculeGroup);
  clearGroup(ctx.orbitalGroup);
  clearGroup(ctx.labelGroup);
  clearGroup(ctx.orbitalLabelGroup);
  clearGroup(ctx.piSystemGroup);
  clearGroup(ctx.dipoleGroup);
  clearGroup(ctx.espGroup);
  clearGroup(ctx.moGroup);

  const { atoms, bonds } = ctx.currentMolecule;
  const c = ctx.display.colors;
  const scheme = {
    scheme: c.scheme,
    sigma: hsvToHex(c.sigma[0], c.sigma[1], c.sigma[2]),
    pi: hsvToHex(c.pi[0], c.pi[1], c.pi[2]),
    lonePair: hsvToHex(c.lonePair[0], c.lonePair[1], c.lonePair[2]),
  };
  renderAtoms(ctx.moleculeGroup, atoms, ctx.display, ctx.renderer);
  // In space-filling mode, hide bonds
  if (!ctx.display.spaceFilling) {
    renderBonds(ctx.moleculeGroup, atoms, bonds, ctx.display);
  }
  renderHybridOrbitals(ctx.orbitalGroup, ctx.currentMolecule, ctx.display.orbitalPreset, scheme, ctx.atomOrbitals);

  // Pedagogical view presets
  const preset = ctx.display.viewPreset;
  if (preset !== 'all') {
    filterOrbitalsByPreset(ctx.orbitalGroup, preset);
  }

  // Labels — one dropdown controls which (if any) label layer is visible.
  // The atom-centered modes (element symbols, hybridizations, charges) are
  // mutually exclusive and share labelGroup; orbital σ/π/lp labels live in
  // orbitalLabelGroup (plain colored text whose colors must track the
  // background: pale tints on the dark presets, darkened hues on white/gray).
  const labelMode = ctx.display.labelMode;
  const labelPalette = labelPaletteFor(ctx.display.bgColor);
  // The partial charges on display — one array for the labels, the ESP and
  // the dipole (see displayedCharges).
  const shown = displayedCharges(ctx);
  const charges = shown.charges;
  // GFN2's single point at this geometry: bond orders, spin (null while it runs)
  const properties = gfn2PropertiesOnScreen(ctx);
  syncLabelModeControl(properties);
  if (labelMode === 'atom') {
    // Element symbol labels (C, N, O...)
    renderLabels(ctx.labelGroup, ctx.currentMolecule);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
  } else if (labelMode === 'orbital' && ctx.atomOrbitals) {
    // σ/π/lp orbital labels
    renderOrbitalLabels(ctx.orbitalLabelGroup, ctx.currentMolecule, ctx.atomOrbitals, labelPalette);
    ctx.orbitalLabelGroup.visible = true;
    ctx.labelGroup.visible = false;
    document.getElementById('orbital-legend')!.classList.remove('hidden');
  } else if (labelMode === 'hybrid' && ctx.atomOrbitals) {
    // Hybridization labels (sp², sp³) — shadowed on the atom like the
    // element symbols.
    renderHybridizationLabels(ctx.labelGroup, ctx.currentMolecule, ctx.atomOrbitals);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
  } else if (labelMode === 'charge' && charges) {
    // Partial charges — the displayed set (GFN2-xTB ESP-fitted by default).
    renderChargeLabels(ctx.labelGroup, ctx.currentMolecule, charges);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
  } else if (labelMode === 'bond-order' && properties) {
    renderBondOrderLabels(ctx.labelGroup, ctx.currentMolecule, properties.bondOrders);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
  } else if (labelMode === 'spin' && properties?.spin) {
    renderSpinLabels(ctx.labelGroup, ctx.currentMolecule, properties.spin);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
  } else {
    // Off
    ctx.labelGroup.visible = false;
    ctx.orbitalLabelGroup.visible = false;
  }
  if (labelMode !== 'orbital') {
    document.getElementById('orbital-legend')!.classList.add('hidden');
  }

  // π system highlighting: a cloud either side of each system's σ framework,
  // its member p lobes tinted to match (pi-systems.ts)
  if (ctx.display.highlightPiSystems && ctx.atomOrbitals && !ctx.display.spaceFilling) {
    const systems = renderPiSystems(ctx.piSystemGroup, ctx.currentMolecule, ctx.atomOrbitals, ctx.display.orbitalPreset);
    tintPiSystemLobes(ctx.orbitalGroup, systems);
    ctx.piSystemGroup.visible = true;
  } else {
    ctx.piSystemGroup.visible = false;
  }

  // The dipole arrow. Under GFN2 it is the full density's — the charges plus
  // the atomic dipoles, which add up to it exactly: nothing until the single
  // point lands, and the charges' own if it failed. Under MMFF94 it is the BCI
  // charges' own, and nothing when the molecule is untypeable. Visibility
  // belongs to the #ctrl-show-dipole checkbox, so a rebuild never flips the
  // user's choice.
  const gfn2Dipole = isGfn2ChargeModel(shown.model);
  const fullDipole = gfn2Dipole ? properties?.dipole ?? null : null;
  ctx.dipole = fullDipole
    ? dipoleFromFullGfn2(ctx.currentMolecule, fullDipole)
    : gfn2Dipole && !properties && !gfn2ChargesFailed(ctx)
      ? null
      : charges ? dipoleFromCharges(ctx.currentMolecule, charges, shown.residual) : null;
  if (ctx.dipole) {
    renderDipole(ctx.dipoleGroup, ctx.dipole);
  }
  showDipoleReadout(ctx, ctx.dipole, shown.model, ctx.dipole === null && gfn2Dipole && !gfn2ChargesFailed(ctx), fullDipole !== null);

  // The ESP. Under GFN2: its own 0.001 au density surface, built in the
  // worker, coloured by the exact potential of its charge distribution — the
  // picture correct to the model, so it is simply the default, with no switch
  // back to point charges. Nothing is drawn the moment it is being built.
  // Under MMFF94, or when the engine cannot build it, the fused van der Waals
  // surface coloured by the charges (see chem/charge-model/esp.ts), cached by
  // charges since a model switch changes them.
  if (ctx.display.showEsp) {
    const gfn2 = isGfn2ChargeModel(shown.model) && properties;
    const esp = gfn2 ? gfn2EspOnScreen(ctx, properties) : null;
    const building = gfn2 && !esp && !ctx.gfn2EspRequest?.failed;
    if (esp) {
      renderEsp(ctx.espGroup, esp.exact, ctx.display.espOpacity);
      ctx.espGroup.visible = true;
    } else if (building || !charges) {
      ctx.espGroup.visible = false;
    } else {
      if (!ctx.espSurface || ctx.espSurfaceCharges !== charges) {
        ctx.espSurface = computeEspSurface(ctx.currentMolecule, charges);
        ctx.espSurfaceCharges = charges;
      }
      renderEsp(ctx.espGroup, ctx.espSurface, ctx.display.espOpacity);
      ctx.espGroup.visible = true;
    }
  } else {
    ctx.espGroup.visible = false;
  }

  // The selected orbitals — a canonical MO, or localized ones. One picture at
  // a time: orbitals and the VSEPR hybrid lobes answer the same question
  // differently, so an orbital takes the stage while it is selected. The
  // localized view draws SEVERAL at once (a filled orbital and the empty one
  // it reaches into is the hyperconjugation picture), so each takes its own
  // phase colours, in the order it was picked. The localized list is asked
  // for only with one of its orbitals selected — it is not built for a view
  // nobody is looking at.
  const localizedShown = ctx.display.orbitalView === 'localized' && ctx.display.localizedSelection.length > 0
    ? localizedOnScreen(ctx) : null;
  const localized = localizedShown === 'pending' ? null : localizedShown;
  if ((ctx.display.orbitalView === 'delocalized' && ctx.display.moMethod === 'gfn2') || localized?.source === 'gfn2') {
    const selected = drawSelectedGfn2Orbitals(ctx, localized);
    ctx.moGroup.visible = selected;
    ctx.orbitalGroup.visible = selected ? false : ctx.display.showOrbitals;
    return;
  }

  // extended Hückel's: computed on the main thread, cached by field and level
  const picks: Array<{ key: string; coefficients: number[]; phase: [number, number] }> = [];
  if (ctx.display.orbitalView === 'localized' && localized?.orbitals) {
    ctx.display.localizedSelection.forEach((index, slot) => {
      const orbital = localized.orbitals![index];
      if (!orbital) return;
      picks.push({
        key: `${localized.method}:${index}`,
        coefficients: orbital.coefficients,
        phase: MO_PHASE_PAIRS[slot % MO_PHASE_PAIRS.length],
      });
    });
  } else if (ctx.display.moIndex !== null && ctx.ehResult) {
    const index = ctx.display.moIndex;
    if (ctx.ehResult.coefficients[index]) {
      picks.push({ key: `mo:${index}`, coefficients: ctx.ehResult.coefficients[index], phase: MO_PHASE_PAIRS[0] });
    }
  }

  if (picks.length > 0 && ctx.ehResult) {
    if (ctx.display.smoothMo) {
      // One continuous surface of constant amplitude — the picture other
      // programs draw. Two caches, because the work has two halves that depend
      // on different things (measured 2026-09-30): the FIELD is the expensive
      // half and does not care what level it will be drawn at, the MESH is
      // cheaper but keyed by the level. So a level change re-marches a field
      // already in hand, and a rebuild that changes no level costs nothing.
      const value = activeIsoValue(ctx.display);
      const byPercentile = ctx.display.isoMode === 'percentile';
      for (const pick of picks) {
        let grid = ctx.moFields.get(pick.key);
        if (!grid) {
          grid = computeMoField(ctx.currentMolecule, ctx.ehResult.basis, pick.coefficients) ?? undefined;
          if (!grid) continue;
          // A field is a few megabytes; keep a handful of orbitals warm and
          // no more, rather than growing with every level ever clicked.
          if (ctx.moFields.size >= 12) ctx.moFields.clear();
          ctx.moFields.set(pick.key, grid);
        }
        const level = byPercentile ? levelForFraction(grid, value) : value;
        const meshKey = `${pick.key}@${byPercentile ? 'p' : 'a'}${value}`;
        let surface = ctx.moSurfaces.get(meshKey);
        if (!surface) {
          surface = marchMoField(grid, level);
          ctx.moSurfaces.set(meshKey, surface);
        }
        renderMoIsosurface(ctx.moGroup, surface, ctx.display.orbitalPreset, ctx.display.moOpacity, pick.phase);
      }
    } else {
      // the atomic orbitals themselves: which AO, which phase, how much
      for (const pick of picks) {
        renderMoOrbitals(ctx.moGroup, ctx.currentMolecule, ctx.ehResult.basis, [pick.coefficients], 0, ctx.ehResult.frame, ctx.display.orbitalPreset, ctx.display.moOpacity, pick.phase);
      }
    }
    ctx.moGroup.visible = true;
    ctx.orbitalGroup.visible = false;
  } else {
    ctx.moGroup.visible = false;
    ctx.orbitalGroup.visible = ctx.display.showOrbitals;
  }
}

// Show only orbitals matching the active preset.
// sigma-only → hide π and lone pair lobes
// pi-only → hide σ bonds and lone pairs
// lone-pairs-only → hide σ bonds and π orbitals
function filterOrbitalsByPreset(group: THREE.Group, preset: string) {
  for (const child of group.children) {
    const lt = (child as any).userData?.lobeType;
    if (!lt) continue;

    if (preset === 'sigma-only') {
      child.visible = (lt === 'sigma');
    } else if (preset === 'pi-only') {
      child.visible = (lt === 'pi');
    } else if (preset === 'lone-pairs-only') {
      child.visible = (lt === 'lone_pair');
    }
  }
}

// Full build: rebuildDisplay plus frame the camera on the new molecule.
export function buildScene(ctx: SceneContext) {
  // A GFN2 charge bundle belongs to one geometry: drop it when it does not
  // describe the molecule now on screen — a new sketch, a loaded view, an
  // example, none of which carry the engine's charges. This is what makes the
  // pairing safe to carry at all (see SceneContext.gfn2Charges).
  if (ctx.gfn2Charges && ctx.gfn2Charges.molecule !== ctx.currentMolecule) ctx.gfn2Charges = null;
  // Cache the per-molecule orbital assignment here so renderHybridOrbitals can
  // read it instead of recomputing on every display-setting change.
  ctx.atomOrbitals = ctx.currentMolecule ? assignOrbitals(ctx.currentMolecule) : null;
  // The MMFF94 BCI charges (geometry-independent, so once per molecule), for
  // when the user picks that model; the displayed set — GFN2-xTB's by default
  // — and its dipole are chosen in rebuildDisplay.
  ctx.charges = ctx.currentMolecule ? resolveCharges(ctx.currentMolecule) : null;
  if (ctx.gfn2PropertiesRequest && ctx.gfn2PropertiesRequest.molecule !== ctx.currentMolecule) ctx.gfn2PropertiesRequest = null;
  if (ctx.gfn2Properties && ctx.gfn2Properties.molecule !== ctx.currentMolecule) ctx.gfn2Properties = null;
  ctx.gfn2Ladders = null;
  ctx.gfn2SurfaceRequests.clear();
  // New molecule, new ESP surface (recomputed lazily on first render).
  ctx.espSurface = null;
  ctx.espSurfaceCharges = null;
  ctx.gfn2Esp = null;
  ctx.gfn2EspRequest = null;
  ctx.gfn2ChargeSets = null;
  ctx.gfn2ChargeSetsRequest = null;
  ctx.moSurfaces.clear();
  ctx.moFields.clear();
  // Extended Hückel is geometry-dependent (unlike the BCI charges), so it is
  // computed once here and cached; null when an element is outside the
  // parameter table. A new molecule also clears any selected MO.
  ctx.ehResult = ctx.currentMolecule ? solveExtendedHuckel(ctx.currentMolecule) : null;
  // the localized list is built when the Localized view first asks for it
  ctx.localized = null;
  ctx.localizedLists = [];
  ctx.display.moIndex = null;
  ctx.display.localizedSelection = [];
  rebuildDisplay(ctx);
  frameCamera(ctx);
  ctx.onSceneBuilt();
}

/** Point the camera at the molecule from in front, far enough back to see all
 *  of it — on a new molecule, and when the view is reset. */
export function frameCamera(ctx: SceneContext) {
  const center = new THREE.Vector3();
  ctx.moleculeGroup.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      center.add(child.position);
    }
  });
  center.divideScalar(ctx.moleculeGroup.children.length || 1);

  const box = new THREE.Box3().setFromObject(ctx.moleculeGroup);
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = size * 1.5;
  ctx.camera.position.set(center.x, center.y, center.z + dist);
  ctx.camera.lookAt(center);
  ctx.controls.target.set(center.x, center.y, center.z);
  ctx.controls.update();
}
