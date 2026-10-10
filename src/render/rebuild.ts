import * as THREE from 'three';
import { activeIsoValue, type SceneContext } from './setup';
import { renderAtoms } from './atoms';
import { renderBonds } from './bonds';
import { renderHybridOrbitals } from './hybrid-orbitals';
import { renderLabels, renderChargeLabels, renderHybridizationLabels, renderBondOrderLabels, renderSpinLabels } from './labels';
import { renderOrbitalLabels } from './orbital-labels';
import { renderPiSystems, tintPiSystemLobes } from './pi-systems';
import { renderDipole } from './dipole';
import { renderEsp } from './esp';
import { renderMoOrbitals, MO_PHASE_PAIRS } from './mo-lobes';
import { computeEspSurface } from '../chem/charge-model/esp';
import { computeMoField, levelForFraction, marchMoField } from '../chem/extended-huckel/mo-surface';
import { renderMoIsosurface } from './mo-isosurface';
import { applyAtomStyle } from './atom-styles';
import { hsvToHex } from './color-schemes';
import { assignOrbitals } from '../chem/vsepr/assign-orbitals';
import {
  dipoleFromCharges, dipoleFromFullGfn2, DIPOLE_APPROXIMATE, DIPOLE_RESIDUAL_CHARGE, type DipoleResult,
} from '../chem/charge-model/dipole';
import { parameterGapWarnings } from '../geometry/parameter-warnings';
import { gfn2PropertiesAt } from '../geometry/gfn2-refine';
import type { ChargeModel } from './setup';
import type { Gfn2Properties } from '../geometry/gfn2-refine';
import { solveExtendedHuckel } from '../chem/extended-huckel/solve';
import { localizeOrbitals } from '../chem/localized-orbitals/localize-pm';
import { orderLocalizedOrbitals } from '../chem/localized-orbitals/order-localized';
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
      child.geometry.dispose();
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

/**
 * The charge model on screen for this molecule: the one the control selects,
 * or the other when the selected one has no charges for it — GFN2 when the
 * engine failed, MMFF94 when the molecule is outside its type space. The
 * selection itself is left alone (it is the user's intent, and the next
 * molecule may honour it).
 */
function effectiveChargeModel(ctx: SceneContext): ChargeModel {
  if (ctx.display.chargeModel === 'gfn2' && gfn2ChargesFailed(ctx) && ctx.charges) return 'mmff94';
  if (ctx.display.chargeModel === 'mmff94' && !ctx.charges && ctx.currentMolecule && !gfn2ChargesFailed(ctx)) {
    return 'gfn2';
  }
  return ctx.display.chargeModel;
}

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
  const gfn2Option = select.querySelector<HTMLOptionElement>('option[value="gfn2"]');
  const mmff94Option = select.querySelector<HTMLOptionElement>('option[value="mmff94"]');
  if (gfn2Option) gfn2Option.disabled = gfn2Failed;
  if (mmff94Option) mmff94Option.disabled = mmff94Missing;
  select.title = gfn2Failed
    ? `GFN2-xTB could not give charges for this molecule (${ctx.gfn2PropertiesRequest?.reason ?? 'the engine failed'}).`
    : mmff94Missing
      ? 'This molecule is outside the MMFF94 type space, so it has no MMFF94 charges.'
      : 'Which partial charges the charge labels, the ESP surface and the dipole arrow show — one set for all three.';
  select.value = effectiveChargeModel(ctx);
}

/**
 * Ask the engine for its single point at the molecule on screen, once per
 * molecule, in the background: the display draws as soon as it arrives. Every
 * structure gets one, a GFN2-optimised one included — its charges came with
 * the run, but the bond orders, the spin and the orbitals did not, and one SCC
 * costs milliseconds at these sizes.
 */
export function requestGfn2Properties(ctx: SceneContext): void {
  const molecule = ctx.currentMolecule;
  if (!molecule || ctx.gfn2Properties?.molecule === molecule) return;
  if (ctx.gfn2PropertiesRequest?.molecule === molecule) return;
  ctx.gfn2PropertiesRequest = { molecule, status: 'pending' };
  const settle = (properties: Gfn2Properties | null, reason?: string) => {
    if (ctx.currentMolecule !== molecule) return; // the molecule changed meanwhile
    if (properties && properties.charges.length === molecule.atoms.length) {
      ctx.gfn2Properties = { molecule, properties };
      ctx.gfn2PropertiesRequest = null;
    } else {
      ctx.gfn2PropertiesRequest = { molecule, status: 'failed', reason: reason ?? 'the engine returned nothing' };
    }
    ctx.rerender();
  };
  gfn2PropertiesAt(molecule).then(
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
 * charge distribution. GFN2-xTB by default: null while its single point is
 * still running (the picture fills in when it lands), MMFF94 in its place when
 * the engine cannot treat the molecule. MMFF94 when the user picks it.
 */
function displayedCharges(ctx: SceneContext): { charges: number[] | null; model: ChargeModel; residual: boolean } {
  if (effectiveChargeModel(ctx) === 'mmff94') {
    return { charges: ctx.charges?.charges ?? null, model: 'mmff94', residual: ctx.charges?.residualCharge ?? false };
  }
  // the optimiser's own charges when this structure is its result, else the
  // single point's
  if (ctx.gfn2Charges && ctx.gfn2Charges.molecule === ctx.currentMolecule) {
    return { charges: ctx.gfn2Charges.charges, model: 'gfn2', residual: false };
  }
  const properties = gfn2PropertiesOnScreen(ctx);
  return { charges: properties?.charges ?? null, model: 'gfn2', residual: false };
}

/** Spin density is only on offer for an open-shell structure; the option says
 *  why when it is not. Bond orders wait on the single point, silently. */
function syncLabelModeControl(properties: Gfn2Properties | null) {
  const option = document.querySelector<HTMLOptionElement>('#ctrl-label-mode option[value="spin"]');
  if (!option || !properties) return;
  option.disabled = properties.spin === null;
  option.textContent = properties.spin === null ? 'Spin density (closed shell: none)' : 'Spin density';
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
    element.title = model === 'gfn2'
      ? (full
        ? 'The full GFN2-xTB dipole: the Mulliken point charges the labels and the ESP show, plus each atom’s '
          + 'own dipole (the lone pairs’ lopsidedness the point charges cannot hold). Semiempirical: water reads '
          + '2.28 D against experiment’s 1.85 D. '
        : 'The dipole of the GFN2-xTB Mulliken point charges — the charges the labels and the ESP show; '
          + 'not the full GFN2 dipole, which adds atomic dipoles. ') + convention
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
  syncChargeModelControl(ctx);
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
    // Partial charges — the displayed set (GFN2-xTB Mulliken by default).
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

  // Charge-model dipole arrow — nothing to render when the molecule is
  // untypeable (computeDipole returned null) or the model gives ~0 D.
  // Visibility belongs to the #ctrl-show-dipole checkbox, so a rebuild
  // never flips the user's choice back on (or off).
  // GFN2's dipole is its full one — the charges plus the atomic dipoles — once
  // the single point lands; until then (or if it failed) the charges' own.
  const fullDipole = shown.model === 'gfn2' ? properties?.dipole ?? null : null;
  ctx.dipole = fullDipole
    ? dipoleFromFullGfn2(ctx.currentMolecule, fullDipole)
    : shown.model === 'gfn2' && !properties && !gfn2ChargesFailed(ctx)
      ? null
      : charges ? dipoleFromCharges(ctx.currentMolecule, charges, shown.residual) : null;
  if (ctx.dipole) {
    renderDipole(ctx.dipoleGroup, ctx.dipole);
  }
  showDipoleReadout(ctx, ctx.dipole, shown.model, ctx.dipole === null && shown.model === 'gfn2' && !gfn2ChargesFailed(ctx), fullDipole !== null);

  // Charge-model ESP surface — a translucent overlay of the FUSED (united)
// vdW molecular surface, colored by the potential probed at the fused
// boundary (see chem/charge-model/esp.ts). Only when the charges exist (untypeable
// molecules get no surface, like no dipole) and the toggle asks for it. The
// surface mesh is cached per molecule and extracted lazily on first render —
// opacity changes reuse it.
  if (ctx.display.showEsp && charges) {
    // The surface is a function of the charges as much as of the geometry, so
    // the cache is keyed by both: a charge-model switch re-extracts (tens of
    // ms), an opacity change reuses what is in hand.
    if (!ctx.espSurface || ctx.espSurfaceCharges !== charges) {
      ctx.espSurface = computeEspSurface(ctx.currentMolecule, charges);
      ctx.espSurfaceCharges = charges;
    }
    renderEsp(ctx.espGroup, ctx.espSurface, ctx.display.espOpacity);
    ctx.espGroup.visible = true;
  } else {
    ctx.espGroup.visible = false;
  }

  // Extended-Hückel MO, or localized orbitals: whatever is selected, from the
  // cached results. One picture at a time — orbitals and the VSEPR hybrid
  // lobes answer the same question differently, so an orbital takes the stage
  // while it is selected. The localized view draws SEVERAL at once (a filled
  // orbital and the empty one it reaches into is the hyperconjugation
  // picture), so each takes its own phase colours, in the order it was picked.
  const picks: Array<{ key: string; coefficients: number[]; phase: [number, number] }> = [];
  if (ctx.display.orbitalView === 'localized' && ctx.localizedOrbitals) {
    ctx.display.localizedSelection.forEach((index, slot) => {
      const orbital = ctx.localizedOrbitals![index];
      if (!orbital) return;
      picks.push({
        key: `localized:${index}`,
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
  // New molecule, new ESP surface (recomputed lazily on first render).
  ctx.espSurface = null;
  ctx.espSurfaceCharges = null;
  ctx.moSurfaces.clear();
  ctx.moFields.clear();
  // Extended Hückel is geometry-dependent (unlike the BCI charges), so it is
  // computed once here and cached; null when an element is outside the
  // parameter table. A new molecule also clears any selected MO.
  ctx.ehResult = ctx.currentMolecule ? solveExtendedHuckel(ctx.currentMolecule) : null;
  ctx.localizedOrbitals = null;
  if (ctx.currentMolecule && ctx.ehResult) {
    const localized = localizeOrbitals(ctx.currentMolecule, ctx.ehResult);
    if (localized) ctx.localizedOrbitals = orderLocalizedOrbitals(ctx.currentMolecule, ctx.ehResult, localized);
  }
  ctx.display.moIndex = null;
  ctx.display.localizedSelection = [];
  rebuildDisplay(ctx);

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
  ctx.onSceneBuilt();
}
