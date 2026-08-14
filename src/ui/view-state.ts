// View state: serialize the current scene (molecule, camera, display
// settings, annotations) to JSON for save-to-file, load-from-file, and
// shareable URL hashes. Teachers prepare a view, share the link, and
// students open the exact same scene.
import * as THREE from 'three';
import type { SceneContext } from '../render';
import { buildScene } from '../render';
import type { Annotation } from './annotations';

export interface ViewState {
  version: 1;
  molecule: { atoms: { element: string; x: number; y: number; z: number }[]; bonds: { atom1Index: number; atom2Index: number; order: number }[] };
  camera: { position: [number, number, number]; target: [number, number, number] };
  display: {
    atomScale: number;
    bondScale: number;
    labelMode: string;
    orbitalPreset: string;
    bgColor: string;
    colors: { scheme: string; sigma: [number, number, number]; pi: [number, number, number]; lonePair: [number, number, number] };
    viewPreset: string;
    spaceFilling: boolean;
    autoRotate: boolean;
  };
  annotations: Annotation[];
}

export function serializeView(ctx: SceneContext, annotations: Annotation[]): ViewState {
  if (!ctx.currentMolecule) throw new Error('No molecule to save');
  return {
    version: 1,
    molecule: {
      atoms: ctx.currentMolecule.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z })),
      bonds: ctx.currentMolecule.bonds.map((b) => ({ atom1Index: b.atom1Index, atom2Index: b.atom2Index, order: b.order })),
    },
    camera: {
      position: [ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z],
      target: [ctx.controls.target.x, ctx.controls.target.y, ctx.controls.target.z],
    },
    display: {
      atomScale: ctx.display.atomScale,
      bondScale: ctx.display.bondScale,
      labelMode: ctx.display.labelMode,
      orbitalPreset: ctx.display.orbitalPreset,
      bgColor: ctx.display.bgColor,
      colors: {
        scheme: ctx.display.colors.scheme,
        sigma: [...ctx.display.colors.sigma],
        pi: [...ctx.display.colors.pi],
        lonePair: [...ctx.display.colors.lonePair],
      },
      viewPreset: ctx.display.viewPreset,
      spaceFilling: ctx.display.spaceFilling,
      autoRotate: ctx.display.autoRotate,
    },
    annotations: annotations.map((a) => ({ ...a })),
  };
}

export function applyViewState(ctx: SceneContext, state: ViewState, annotations: { setAnnotations: (a: Annotation[]) => void }): void {
  if (state.version !== 1) return;

  ctx.currentMolecule = {
    atoms: state.molecule.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z })),
    bonds: state.molecule.bonds.map((b) => ({ atom1Index: b.atom1Index, atom2Index: b.atom2Index, order: b.order })),
  };

  const d = state.display;
  ctx.display.atomScale = d.atomScale;
  ctx.display.bondScale = d.bondScale;
  ctx.display.labelMode = d.labelMode as any;
  ctx.display.orbitalPreset = d.orbitalPreset as any;
  ctx.display.bgColor = d.bgColor;
  ctx.scene.background = new THREE.Color(d.bgColor);
  ctx.display.colors = {
    scheme: d.colors.scheme as any,
    sigma: [...d.colors.sigma] as [number, number, number],
    pi: [...d.colors.pi] as [number, number, number],
    lonePair: [...d.colors.lonePair] as [number, number, number],
  };
  ctx.display.viewPreset = d.viewPreset as any;
  ctx.display.spaceFilling = d.spaceFilling;
  ctx.setAutoRotate(d.autoRotate);

  // Rebuild the scene from the restored molecule, then apply the saved camera.
  buildScene(ctx);
  ctx.camera.position.set(state.camera.position[0], state.camera.position[1], state.camera.position[2]);
  ctx.controls.target.set(state.camera.target[0], state.camera.target[1], state.camera.target[2]);
  ctx.controls.update();

  annotations.setAnnotations(state.annotations);
}

export function saveViewToFile(ctx: SceneContext, annotations: Annotation[]): void {
  const state = serializeView(ctx, annotations);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'valence-view.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function loadViewFromFile(ctx: SceneContext, file: File, annotations: { setAnnotations: (a: Annotation[]) => void }): Promise<void> {
  return file.text().then((text) => {
    const state = JSON.parse(text) as ViewState;
    applyViewState(ctx, state, annotations);
  });
}

// Shareable URL: encode the view state in the hash as #view=<base64url json>.
export function buildShareLink(ctx: SceneContext, annotations: Annotation[]): string {
  const state = serializeView(ctx, annotations);
  const json = JSON.stringify(state);
  const b64 = btoa(unescape(encodeURIComponent(json))) // unicode-safe base64
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(window.location.href);
  url.hash = `view=${b64}`;
  return url.toString();
}

export function parseShareLink(hash: string): ViewState | null {
  if (!hash.startsWith('#view=')) return null;
  const b64 = hash.slice(6);
  try {
    const json = decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))));
    return JSON.parse(json) as ViewState;
  } catch {
    return null;
  }
}
