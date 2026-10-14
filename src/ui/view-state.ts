// View state: serialize the current scene (molecule, camera, display
// settings, annotations) to JSON for save-to-file, load-from-file, and
// shareable URL hashes. Teachers prepare a view, share the link, and
// students open the exact same scene.
import * as THREE from 'three';
import type { SceneContext } from '../render';
import type { Bond } from '../mol-parser';
import { buildScene } from '../render';
import { asChargeModel } from '../render/setup';
import type { Annotation } from './annotations';
import { downloadFile } from './controls';

export interface ViewState {
  version: 1;
  /** The structure. The formal charges, the drawn wedges and the spin are
   *  absent from views saved before they were kept — such a view of an ion
   *  reloads neutral. */
  molecule: {
    atoms: { element: string; x: number; y: number; z: number; charge?: number }[];
    bonds: { atom1Index: number; atom2Index: number; order: number; stereo?: Bond['stereo'] }[];
    multiplicity?: number;
  };
  camera: { position: [number, number, number]; target: [number, number, number] };
  display: {
    atomScale: number;
    bondScale: number;
    labelMode: string;
    /** Absent in views saved before the charge-model selector existed. */
    chargeModel?: string;
    orbitalPreset: string;
    atomStyle: string;
    bgColor: string;
    colors: { scheme: string; sigma: [number, number, number]; pi: [number, number, number]; lonePair: [number, number, number] };
    viewPreset: string;
    spaceFilling: boolean;
    autoRotate: boolean;
    highlightPiSystems: boolean;
  };
  annotations: Annotation[];
}

function serializeView(ctx: SceneContext, annotations: Annotation[]): ViewState {
  if (!ctx.currentMolecule) throw new Error('No molecule to save');
  return {
    version: 1,
    // the charges and the spin decide the electron count every calculation
    // runs on, so a view without them would reload as another species
    molecule: {
      atoms: ctx.currentMolecule.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z, charge: a.charge })),
      bonds: ctx.currentMolecule.bonds.map((b) => ({ atom1Index: b.atom1Index, atom2Index: b.atom2Index, order: b.order, stereo: b.stereo })),
      multiplicity: ctx.currentMolecule.multiplicity,
    },
    camera: {
      position: [ctx.camera.position.x, ctx.camera.position.y, ctx.camera.position.z],
      target: [ctx.controls.target.x, ctx.controls.target.y, ctx.controls.target.z],
    },
    display: {
      atomScale: ctx.display.atomScale,
      bondScale: ctx.display.bondScale,
      labelMode: ctx.display.labelMode,
      chargeModel: ctx.display.chargeModel,
      orbitalPreset: ctx.display.orbitalPreset,
      atomStyle: ctx.display.atomStyle,
      bgColor: ctx.display.bgColor,
      colors: {
        scheme: ctx.display.colors.scheme,
        sigma: [...ctx.display.colors.sigma],
        pi: [...ctx.display.colors.pi],
        lonePair: [...ctx.display.colors.lonePair],
      },
      viewPreset: ctx.display.viewPreset,
      spaceFilling: ctx.display.spaceFilling,
      autoRotate: ctx.autoRotate,
      highlightPiSystems: ctx.display.highlightPiSystems,
    },
    annotations: annotations.map((a) => ({ ...a })),
  };
}

export function applyViewState(ctx: SceneContext, state: ViewState, annotations: { setAnnotations: (a: Annotation[]) => void }): void {
  if (state.version !== 1) return;

  const { atoms, bonds, multiplicity } = state.molecule;
  ctx.currentMolecule = {
    atoms: atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z, ...(a.charge ? { charge: a.charge } : {}) })),
    bonds: bonds.map((b) => ({ atom1Index: b.atom1Index, atom2Index: b.atom2Index, order: b.order, ...(b.stereo === 1 || b.stereo === 6 ? { stereo: b.stereo } : {}) })),
    ...(multiplicity && multiplicity > 1 ? { multiplicity } : {}),
  };

  const d = state.display;
  ctx.display.atomScale = d.atomScale;
  ctx.display.bondScale = d.bondScale;
  ctx.display.labelMode = d.labelMode as any;
  // The default (GFN2-xTB ESP-fitted) unless the view chose another: views
  // saved before the selector existed never chose, so they get it too.
  ctx.display.chargeModel = asChargeModel(d.chargeModel);
  ctx.display.orbitalPreset = d.orbitalPreset as any;
  // Views saved before atom styles existed fall back to the classic look.
  ctx.display.atomStyle = (d.atomStyle ?? 'classic') as any;
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
  ctx.display.highlightPiSystems = d.highlightPiSystems;

  // Rebuild the scene from the restored molecule, then apply the saved camera.
  buildScene(ctx);
  ctx.camera.position.set(state.camera.position[0], state.camera.position[1], state.camera.position[2]);
  ctx.controls.target.set(state.camera.target[0], state.camera.target[1], state.camera.target[2]);
  ctx.controls.update();

  annotations.setAnnotations(state.annotations);
}

export function saveViewToFile(ctx: SceneContext, annotations: Annotation[]): void {
  downloadFile(JSON.stringify(serializeView(ctx, annotations), null, 2), 'valence-view.json', 'application/json');
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
