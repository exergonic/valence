import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Molecule } from '../mol-parser';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { DipoleResult } from '../chem/charge-model/dipole';
import type { ResolvedCharges } from '../chem/charge-model/bci-charges';
import type { Gfn2Properties } from '../geometry/gfn2-refine';
import type { EspSurfaceData } from '../chem/charge-model/esp';
import {
  LOCALIZED_ISOVALUE, LOCALIZED_PERCENTILE, MO_SURFACE_ISOVALUE, MO_SURFACE_PERCENTILE,
  type MoFieldData, type MoSurfaceData,
} from '../chem/extended-huckel/mo-surface';
import type { ExtendedHuckelResult } from '../chem/extended-huckel/solve';
import type { LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import { updateLabels } from './labels';
import { ATOM_LAYER, type AtomStyle } from './atom-styles';

export type ColorScheme = 'element' | 'monochrome' | 'pedagogical' | 'complementary' | 'cool' | 'warm' | 'highcontrast' | 'custom';

/**
 * Which partial charges the display draws — the charge labels, the ESP surface
 * and the dipole arrow, all three from one array so they describe one charge
 * distribution.
 *
 * GFN2-xTB's Mulliken SCC charges are the default: the engine's own for a
 * structure it optimised, or one single point at the displayed geometry for a
 * structure it did not (a PubChem conformer, an example), computed when a
 * charge display first asks for them. MMFF94 BCI charges are there when the
 * user picks them — fitting for PubChem's MMFF94 geometries — and as the
 * fallback when the engine cannot treat the molecule.
 */
export type ChargeModel = 'mmff94' | 'gfn2';

/** GFN2-xTB per-atom charges, paired with the molecule they belong to — a
 *  charge array is only valid for the geometry it was computed at. */
export interface Gfn2Charges {
  molecule: Molecule;
  charges: number[];
}

export interface ColorSettings {
  scheme: ColorScheme;
  sigma: [number, number, number];  // HSV
  pi: [number, number, number];
  lonePair: [number, number, number];
}

export interface DisplaySettings {
  atomScale: number;
  bondScale: number;
  labelMode: 'atom' | 'orbital' | 'hybrid' | 'charge' | 'bond-order' | 'spin' | 'off';
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
  orbitalView: 'delocalized' | 'localized';
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
  /** Which partial-charge model the charge labels and the ESP surface draw.
   *  GFN2-xTB's own charges are offered only for a structure the GFN2 tier
   *  produced; the dipole arrow stays on MMFF94 either way. */
  chargeModel: ChargeModel;
  /** ESP surface translucency — 0.05..0.95 (1 − opacity reads as see-through). */
  espOpacity: number;
  /** Draw a selected MO as one continuous isosurface (default) rather than as
   *  the individual atomic orbitals it is built from. */
  smoothMo: boolean;
  /** Opacity of the MO picture (both views) — 0.15..0.9. */
  moOpacity: number;
  /** Which quantity the level control sets: the fraction of the orbital's own
   *  weight the surface encloses (the default — the only setting that means
   *  the same thing on every orbital and element), or an absolute amplitude in
   *  true Slater units, which is how another program's picture is reproduced. */
  isoMode: 'percentile' | 'absolute';
  /** Absolute level for the molecular view (bohr^-3/2). */
  moIsovalue: number;
  /** Absolute level for the localized view. */
  localizedIsovalue: number;
  /** Percentile level for the molecular view, 0..1. */
  moPercentile: number;
  /** Percentile level for the localized view. */
  localizedPercentile: number;
}

/**
 * The level the control shows for the view on stage. Both modes keep their own
 * value per view; switching modes does not carry a number across, because a
 * percentile and an amplitude are different quantities and a carried number
 * would mean something else on arrival.
 */
export function activeIsoValue(display: DisplaySettings): number {
  const localized = display.orbitalView === 'localized';
  if (display.isoMode === 'percentile') {
    return localized ? display.localizedPercentile : display.moPercentile;
  }
  return localized ? display.localizedIsovalue : display.moIsovalue;
}

/** Write a new level for the view on stage, into the active mode's field. */
export function setActiveIsoValue(display: DisplaySettings, value: number): void {
  const localized = display.orbitalView === 'localized';
  if (display.isoMode === 'percentile') {
    if (localized) display.localizedPercentile = value;
    else display.moPercentile = value;
  } else if (localized) {
    display.localizedIsovalue = value;
  } else {
    display.moIsovalue = value;
  }
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
  /** The dipole of the charges on display (computed in rebuildDisplay from
   *  the same array as the labels and the ESP). */
  dipole: DipoleResult | null;
  /** Resolved per-atom partial charges for the current molecule — the same
   *  values the dipole arrow uses (BCI + residual placement). Feeds the
   *  charge label mode and, at the charge model the control selects, the ESP
   *  surface. */
  charges: ResolvedCharges | null;
  /** GFN2-xTB's own per-atom charges for the displayed structure, when it
   *  came out of the GFN2 tier — the second charge model the display can
   *  offer. Paired with its molecule: buildScene drops the bundle when it does
   *  not describe the molecule on screen, so a stale array can never be read. */
  gfn2Charges: Gfn2Charges | null;
  /** What GFN2's single point at the displayed geometry knows — charges,
   *  Wiberg bond orders, spin, the full dipole, the orbitals. Paired with its
   *  molecule like `gfn2Charges`, so a stale bundle is never read. */
  gfn2Properties: { molecule: Molecule; properties: Gfn2Properties } | null;
  /** That single point, asked for the molecule on screen once: pending while
   *  it runs, failed (with why) when the engine could not treat it — the
   *  charges then fall back to MMFF94 and say so. */
  gfn2PropertiesRequest: { molecule: Molecule; status: 'pending' | 'failed'; reason?: string } | null;
  /** Cached fused vdW ESP surface for the current molecule (computed lazily
   *  on the first ESP render; null until then or for an untypeable molecule). */
  espSurface: EspSurfaceData | null;
  /** The charges `espSurface` was built from — the surface is a function of
   *  the charges as much as of the geometry, so a different array (a model
   *  switch, or GFN2 charges arriving) re-extracts it. */
  espSurfaceCharges: number[] | null;
  /** Extracted isosurfaces, keyed `mo:<index>` / `localized:<index>`. Each
   *  costs ~50 ms to extract, and the same orbital can be picked, dropped and
   *  picked again while comparing orbitals — so they are kept until the
   *  isovalue or the molecule changes. */
  moSurfaces: Map<string, MoSurfaceData>;
  /** Evaluated fields, keyed by the orbital — the half of the surface that
   *  does not depend on the level, so a level change re-marches a field that
   *  is already in hand (see computeMoField). */
  moFields: Map<string, MoFieldData>;
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
      orbitalView: 'delocalized',
      localizedSelection: [],
      showOrbitals: true,
      showEsp: false,
      chargeModel: 'gfn2',
      espOpacity: 0.5,
      smoothMo: true,
      moOpacity: 0.85,
      isoMode: 'percentile',
      moIsovalue: MO_SURFACE_ISOVALUE,
      localizedIsovalue: LOCALIZED_ISOVALUE,
      moPercentile: MO_SURFACE_PERCENTILE,
      localizedPercentile: LOCALIZED_PERCENTILE,
    },
    atomOrbitals: null,
    dipole: null,
    charges: null,
    gfn2Charges: null,
    gfn2Properties: null,
    gfn2PropertiesRequest: null,
    espSurface: null,
    espSurfaceCharges: null,
    moSurfaces: new Map(),
    moFields: new Map(),
    ehResult: null,
    localizedOrbitals: null,
    rerender: () => {},
    onSceneBuilt: () => {},
    teardown,
    get autoRotate() { return autoRotate; },
    setAutoRotate: (on: boolean) => { autoRotate = on; },
  };
}
