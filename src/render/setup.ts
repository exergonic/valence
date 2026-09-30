import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Molecule } from '../mol-parser';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { DipoleResult } from '../chem/charge-model/dipole';
import type { ResolvedCharges } from '../chem/charge-model/bci-charges';
import type { EspSurfaceData } from '../chem/charge-model/esp';
import { LOCALIZED_ISOVALUE, MO_SURFACE_ISOVALUE, type MoSurfaceData } from '../chem/extended-huckel/mo-surface';
import type { ExtendedHuckelResult } from '../chem/extended-huckel/solve';
import type { LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import { updateLabels } from './labels';
import { ATOM_LAYER, type AtomStyle } from './atom-styles';

export type ColorScheme = 'element' | 'monochrome' | 'pedagogical' | 'complementary' | 'cool' | 'warm' | 'highcontrast' | 'custom';

export interface ColorSettings {
  scheme: ColorScheme;
  sigma: [number, number, number];  // HSV
  pi: [number, number, number];
  lonePair: [number, number, number];
}

export interface DisplaySettings {
  atomScale: number;
  bondScale: number;
  labelMode: 'atom' | 'orbital' | 'hybrid' | 'charge' | 'off';
  orbitalPreset: 'glass' | 'glossy' | 'matte' | 'metallic';
  atomStyle: AtomStyle;
  bgColor: string;
  colors: ColorSettings;
  viewPreset: 'all' | 'sigma-only' | 'pi-only' | 'lone-pairs-only';
  spaceFilling: boolean;
  autoRotate: boolean;
  highlightPiSystems: boolean;
  /** Which extended-Hückel MO is shown over the molecule (null = none).
   *  Selecting one is what "click a level" does in the MO tab. */
  moIndex: number | null;
  /** The MO panel's view: the energy ladder, or the localized orbitals
   *  (Pipek–Mezey). Only one of the two selections draws at a time. */
  orbitalView: 'ladder' | 'localized';
  /** Which localized orbitals are drawn over the molecule, in the order they
   *  were picked (empty = none). More than one is the hyperconjugation
   *  picture: a filled orbital and the empty one it reaches into, each with
   *  its own phase colours. */
  localizedSelection: number[];
  /** VSEPR/hybrid orbitals visible — the checkbox in the Build tab. The MO
   *  picture takes precedence: an MO and the hybrid lobes are two different
   *  answers to the same question, so they never draw together. */
  showOrbitals: boolean;
  /** Charge-model ESP surface (translucent vdW spheres colored by V). */
  showEsp: boolean;
  /** ESP surface translucency — 0.05..0.95 (1 − opacity reads as see-through). */
  espOpacity: number;
  /** Draw a selected MO as one continuous isosurface (default) rather than as
   *  the individual atomic orbitals it is built from. */
  smoothMo: boolean;
  /** Opacity of the MO picture (both views) — 0.15..0.9. */
  moOpacity: number;
  /** Isosurface level for the MO surface (see MO_SURFACE_ISOVALUES). */
  moIsovalue: number;
  /** Isosurface level for the localized picture, which wants its own — see
   *  `activeIsovalue` and the measurements in NOTES.md. */
  localizedIsovalue: number;
}

/**
 * The isosurface level for the view currently on stage.
 *
 * The two views want different levels, and not symmetrically. A localized
 * orbital drawn at the MO default is about 1.5× its bond length (water's O–H
 * lobes reach 1.50 Å against a 0.96 Å bond), so the localized default sits
 * higher. But not as high as a single bond would like: the failure modes are
 * asymmetric. Set too low, a picture is merely fat and shows everything. Set
 * too high, whole atoms drop out — benzene's delocalized ring orbital covers
 * six carbons at 0.10 and three at 0.20 — and a picture that has silently lost
 * half its molecule is worse than a fat one. So the higher value is for the
 * bond, the safer one is the default. NOTES.md has the measurements.
 */
export function activeIsovalue(display: DisplaySettings): number {
  return display.orbitalView === 'localized' ? display.localizedIsovalue : display.moIsovalue;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: TrackballControls;
  moleculeGroup: THREE.Group;
  orbitalGroup: THREE.Group;
  labelGroup: THREE.Group;
  orbitalLabelGroup: THREE.Group;
  piSystemGroup: THREE.Group;
  dipoleGroup: THREE.Group;
  espGroup: THREE.Group;
  /** Extended-Hückel MO lobes for the selected level (see display.moIndex). */
  moGroup: THREE.Group;
  atomRig: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight };
  display: DisplaySettings;
  currentMolecule?: Molecule;
  atomOrbitals: AtomOrbitals[] | null;
  /** Per-molecule charge-model dipole (computed in buildScene, like atomOrbitals). */
  dipole: DipoleResult | null;
  /** Resolved per-atom partial charges for the current molecule — the same
   *  values the dipole arrow uses (BCI + residual placement). Feeds the
   *  charge label mode (and the future ESP surface). */
  charges: ResolvedCharges | null;
  /** Cached fused vdW ESP surface for the current molecule (computed lazily
   *  on the first ESP render; null until then or for an untypeable molecule). */
  espSurface: EspSurfaceData | null;
  /** Extracted isosurfaces, keyed `mo:<index>` / `localized:<index>`. Each
   *  costs ~50 ms to extract, and the same orbital can be picked, dropped and
   *  picked again while comparing orbitals — so they are kept until the
   *  isovalue or the molecule changes. */
  moSurfaces: Map<string, MoSurfaceData>;
  /** Cached extended-Hückel result for the current molecule (computed once in
   *  buildScene, like the dipole); null when an element is outside the
   *  parameter table. */
  ehResult: ExtendedHuckelResult | null;
  /** The molecule's localized orbitals, classified and ordered for display
   *  (computed once in buildScene). Null when EH refused, the shell is open,
   *  or there is nothing occupied — no list rather than a wrong one. */
  localizedOrbitals: LocalizedOrbital[] | null;
  rerender: () => void;
  /** Called at the end of buildScene, i.e. when a new molecule is in the
   *  scene — panels that read per-molecule data (the MO ladder) redraw here
   *  rather than polling or guessing. */
  onSceneBuilt: () => void;
  teardown: () => void;
  autoRotate: boolean;
  setAutoRotate: (on: boolean) => void;
}

export function initScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;

  // Auto-rotate stops on first user interaction
  controls.addEventListener('start', () => {
    if (autoRotate) {
      autoRotate = false;
    }
  });

  const light = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Atom-only studio rig, dark until an atom style turns it on.  Layer 1
  // keeps it off the orbitals and bonds.
  const atomRig = {
    key: new THREE.DirectionalLight(0xffffff, 0),
    fill: new THREE.DirectionalLight(0xffffff, 0),
    rim: new THREE.DirectionalLight(0xffffff, 0),
  };
  atomRig.key.position.set(2, 3, 4);
  atomRig.fill.position.set(-2, -3, 2);
  atomRig.rim.position.set(-3, 2, -4);
  for (const lamp of [atomRig.key, atomRig.fill, atomRig.rim]) {
    lamp.layers.set(ATOM_LAYER);
    scene.add(lamp);
  }
  // Atom meshes of the lit styles render on layer 1; the camera must see it.
  camera.layers.enable(ATOM_LAYER);

  const moleculeGroup = new THREE.Group();
  moleculeGroup.visible = false;
  scene.add(moleculeGroup);
  const orbitalGroup = new THREE.Group();
  orbitalGroup.visible = true;
  scene.add(orbitalGroup);
  const labelGroup = new THREE.Group();
  labelGroup.visible = false;
  scene.add(labelGroup);
  const orbitalLabelGroup = new THREE.Group();
  orbitalLabelGroup.visible = false;
  scene.add(orbitalLabelGroup);
  const piSystemGroup = new THREE.Group();
  piSystemGroup.visible = false;
  scene.add(piSystemGroup);
  const dipoleGroup = new THREE.Group();
  // Off by default — a dipole is a thing you ask to see, not the default view.
  dipoleGroup.visible = false;
  scene.add(dipoleGroup);
  const moGroup = new THREE.Group();
  // Nothing to show until a level is picked in the MO tab.
  moGroup.visible = false;
  scene.add(moGroup);
  const espGroup = new THREE.Group();
  // Off by default, like the dipole — the ESP surface is a thing you ask to see.
  espGroup.visible = false;
  scene.add(espGroup);

  let autoRotate = false;

  function animate() {
    requestAnimationFrame(animate);
    if (autoRotate) {
      moleculeGroup.rotation.y += 0.005;
      orbitalGroup.rotation.y += 0.005;
      labelGroup.rotation.y += 0.005;
      orbitalLabelGroup.rotation.y += 0.005;
      piSystemGroup.rotation.y += 0.005;
      dipoleGroup.rotation.y += 0.005;
      espGroup.rotation.y += 0.005;
      moGroup.rotation.y += 0.005;
    }
    controls.update();
    // Forward-push the atom labels against the (moved) camera. The dipole
    // group is all meshes now (its δ+ tail cross is geometry, not a sprite),
    // so it needs no per-frame push.
    updateLabels(labelGroup, camera);
    renderer.render(scene, camera);
  }
  animate();

  const handleResize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);

  const teardown = () => {
    window.removeEventListener('resize', handleResize);
  };

  return {
    scene, camera, renderer, controls, moleculeGroup, orbitalGroup, labelGroup, orbitalLabelGroup, piSystemGroup, dipoleGroup, espGroup, moGroup, atomRig,
    display: {
      atomScale: 1, bondScale: 1, labelMode: 'atom', orbitalPreset: 'metallic', atomStyle: 'glossy', bgColor: '#ffffff',
      colors: { scheme: 'element', sigma: [0, 0, 1], pi: [0.58, 0.7, 1], lonePair: [0.1, 0.7, 1] },
      viewPreset: 'all',
      spaceFilling: false,
      autoRotate: false,
      highlightPiSystems: false,
      moIndex: null,
      orbitalView: 'ladder',
      localizedSelection: [],
      showOrbitals: true,
      showEsp: false,
      espOpacity: 0.5,
      smoothMo: true,
      moOpacity: 0.85,
      moIsovalue: MO_SURFACE_ISOVALUE,
      localizedIsovalue: LOCALIZED_ISOVALUE,
    },
    atomOrbitals: null,
    dipole: null,
    charges: null,
    espSurface: null,
    moSurfaces: new Map(),
    ehResult: null,
    localizedOrbitals: null,
    rerender: () => {},
    onSceneBuilt: () => {},
    teardown,
    get autoRotate() { return autoRotate; },
    setAutoRotate: (on: boolean) => { autoRotate = on; },
  };
}
