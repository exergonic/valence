import * as THREE from 'three';
import type { SceneContext } from './setup';
import { renderAtoms } from './atoms';
import { renderBonds } from './bonds';
import { renderOrbitals } from './orbitals';
import { renderLabels } from './labels';
import { renderOrbitalLabels, renderHybridizationLabels } from './orbital-labels';
import { renderPiSystems } from './pi-systems';
import { hsvToHex } from './color-schemes';
import { classifyMolecule } from '../chem/classify';

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
  clearGroup(ctx.moleculeGroup);
  clearGroup(ctx.orbitalGroup);
  clearGroup(ctx.labelGroup);
  clearGroup(ctx.orbitalLabelGroup);
  clearGroup(ctx.hybridizationLabelGroup);
  clearGroup(ctx.piSystemGroup);

  const { atoms, bonds } = ctx.currentMolecule;
  const c = ctx.display.colors;
  const scheme = {
    scheme: c.scheme,
    sigma: hsvToHex(c.sigma[0], c.sigma[1], c.sigma[2]),
    pi: hsvToHex(c.pi[0], c.pi[1], c.pi[2]),
    lonePair: hsvToHex(c.lonePair[0], c.lonePair[1], c.lonePair[2]),
  };
  renderAtoms(ctx.moleculeGroup, atoms, ctx.display);
  // In space-filling mode, hide bonds
  if (!ctx.display.spaceFilling) {
    renderBonds(ctx.moleculeGroup, atoms, bonds, ctx.display);
  }
  renderOrbitals(ctx.orbitalGroup, ctx.currentMolecule, ctx.display.orbitalPreset, scheme, ctx.classifications);

  // Pedagogical view presets
  const preset = ctx.display.viewPreset;
  if (preset !== 'all') {
    filterOrbitalsByPreset(ctx.orbitalGroup, preset);
  }

  // Labels — one dropdown controls which (if any) label layer is visible
  const labelMode = ctx.display.labelMode;
  if (labelMode === 'atom') {
    // Element symbol labels (C, N, O...) — rendered into labelGroup
    renderLabels(ctx.labelGroup, ctx.currentMolecule);
    ctx.labelGroup.visible = true;
    ctx.orbitalLabelGroup.visible = false;
    ctx.hybridizationLabelGroup.visible = false;
  } else if (labelMode === 'orbital' && ctx.classifications) {
    // σ/π/lp orbital labels
    renderOrbitalLabels(ctx.orbitalLabelGroup, ctx.currentMolecule, ctx.classifications);
    ctx.orbitalLabelGroup.visible = true;
    ctx.labelGroup.visible = false;
    ctx.hybridizationLabelGroup.visible = false;
    document.getElementById('orbital-legend')!.classList.remove('hidden');
  } else if (labelMode === 'hybrid' && ctx.classifications) {
    // Hybridization labels (sp², sp³)
    renderHybridizationLabels(ctx.hybridizationLabelGroup, ctx.currentMolecule, ctx.classifications);
    ctx.hybridizationLabelGroup.visible = true;
    ctx.labelGroup.visible = false;
    ctx.orbitalLabelGroup.visible = false;
  } else {
    // Off
    ctx.labelGroup.visible = false;
    ctx.orbitalLabelGroup.visible = false;
    ctx.hybridizationLabelGroup.visible = false;
  }
  if (labelMode !== 'orbital') {
    document.getElementById('orbital-legend')!.classList.add('hidden');
  }

  // π system highlighting — render translucent tubes connecting parallel p orbitals
  if (ctx.display.highlightPiSystems && ctx.classifications && !ctx.display.spaceFilling) {
    renderPiSystems(ctx.piSystemGroup, ctx.currentMolecule, ctx.classifications);
    ctx.piSystemGroup.visible = true;
  } else {
    ctx.piSystemGroup.visible = false;
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
  // Cache the per-molecule classification here so renderOrbitals can
  // read it instead of recomputing on every display-setting change.
  ctx.classifications = ctx.currentMolecule ? classifyMolecule(ctx.currentMolecule) : null;
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
}
