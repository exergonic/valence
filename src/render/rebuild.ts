import * as THREE from 'three';
import { activeIsovalue, type SceneContext } from './setup';
import { renderAtoms } from './atoms';
import { renderBonds } from './bonds';
import { renderHybridOrbitals } from './hybrid-orbitals';
import { renderLabels, renderChargeLabels, renderHybridizationLabels } from './labels';
import { renderOrbitalLabels } from './orbital-labels';
import { renderPiSystems } from './pi-systems';
import { renderDipole } from './dipole';
import { renderEsp } from './esp';
import { renderMoOrbitals, MO_PHASE_PAIRS } from './mo-lobes';
import { computeEspSurface } from '../chem/charge-model/esp';
import { computeMoSurface } from '../chem/extended-huckel/mo-surface';
import { renderMoIsosurface } from './mo-isosurface';
import { applyAtomStyle } from './atom-styles';
import { hsvToHex } from './color-schemes';
import { assignOrbitals } from '../chem/vsepr/assign-orbitals';
import { computeDipole } from '../chem/charge-model/dipole';
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

// Rebuild all molecule meshes from ctx.currentMolecule without touching the
// camera. Used for display settings (atom size, orbital style, colors).
export function rebuildDisplay(ctx: SceneContext) {
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
  } else if (labelMode === 'charge' && ctx.charges) {
    // Partial charges — the same resolved charge-model values the dipole
    // arrow uses (BCI + residual placement), drawn like element labels.
    renderChargeLabels(ctx.labelGroup, ctx.currentMolecule, ctx.charges.charges);
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

  // π system highlighting — render translucent tubes connecting parallel p orbitals
  if (ctx.display.highlightPiSystems && ctx.atomOrbitals && !ctx.display.spaceFilling) {
    renderPiSystems(ctx.piSystemGroup, ctx.currentMolecule, ctx.atomOrbitals);
    ctx.piSystemGroup.visible = true;
  } else {
    ctx.piSystemGroup.visible = false;
  }

  // Charge-model dipole arrow — nothing to render when the molecule is
  // untypeable (computeDipole returned null) or the model gives ~0 D.
  // Visibility belongs to the #ctrl-show-dipole checkbox, so a rebuild
  // never flips the user's choice back on (or off).
  if (ctx.dipole) {
    renderDipole(ctx.dipoleGroup, ctx.dipole);
  }

  // Charge-model ESP surface — a translucent overlay of the FUSED (united)
// vdW molecular surface, colored by the potential probed at the fused
// boundary (see chem/charge-model/esp.ts). Only when the charges exist (untypeable
// molecules get no surface, like no dipole) and the toggle asks for it. The
// surface mesh is cached per molecule and extracted lazily on first render —
// opacity changes reuse it.
  if (ctx.display.showEsp && ctx.charges) {
    if (!ctx.espSurface) {
      ctx.espSurface = computeEspSurface(ctx.currentMolecule, ctx.charges.charges);
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
      // one continuous surface of constant amplitude — the picture other
      // programs draw. Cached per orbital: extracting one costs 100 ms on
      // water and 300-950 ms on benzene, PCl₅ or I₂ (measured 2026-09-30, and
      // it grows with the vertex count), so a level is paid for once.
      for (const pick of picks) {
        let surface = ctx.moSurfaces.get(pick.key);
        if (!surface) {
          surface = computeMoSurface(ctx.currentMolecule, ctx.ehResult.basis, pick.coefficients, activeIsovalue(ctx.display));
          ctx.moSurfaces.set(pick.key, surface);
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
  // Cache the per-molecule orbital assignment here so renderHybridOrbitals can
  // read it instead of recomputing on every display-setting change.
  ctx.atomOrbitals = ctx.currentMolecule ? assignOrbitals(ctx.currentMolecule) : null;
  // Same for the charge-model dipole (BCI charges are geometry-independent:
  // computed once per molecule — see chem/charge-model/dipole.ts). The resolved per-atom
  // charges join it — the charge label mode reads them.
  ctx.dipole = ctx.currentMolecule ? computeDipole(ctx.currentMolecule) : null;
  ctx.charges = ctx.currentMolecule ? resolveCharges(ctx.currentMolecule) : null;
  // New molecule, new ESP surface (recomputed lazily on first render).
  ctx.espSurface = null;
  ctx.moSurfaces.clear();
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
