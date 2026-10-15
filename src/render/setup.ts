import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Molecule } from '../mol-parser';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { DipoleResult } from '../chem/charge-model/dipole';
import type { ResolvedCharges } from '../chem/charge-model/bci-charges';
import type { Gfn2Properties, Gfn2ChargeSets } from '../geometry/gfn2-refine';
import type { Gfn2Ladder } from '../chem/gfn2-xtb/orbital-ladder';
import type { NormalMode } from '../chem/gfn2-xtb/normal-modes';
import type { EspSurfaceData } from '../chem/charge-model/esp';
import {
  LOCALIZED_ISOVALUE, LOCALIZED_PERCENTILE, MO_SURFACE_ISOVALUE, MO_SURFACE_PERCENTILE,
  type MoFieldData, type MoSurfaceData,
} from '../chem/extended-huckel/mo-surface';
import type { ExtendedHuckelResult } from '../chem/extended-huckel/solve';
import type { LocalizedOrbital } from '../chem/localized-orbitals/order-localized';
import type { BasisFunction } from '../chem/extended-huckel/assign-basis';
import { updateLabels } from './labels';
import { ATOM_LAYER, type AtomStyle } from './atom-styles';

export type ColorScheme = 'element' | 'monochrome' | 'pedagogical' | 'complementary' | 'cool' | 'warm' | 'highcontrast' | 'custom';

/**
 * Which partial charges the charge labels print. Under MMFF94 the ESP surface
 * and the dipole arrow come from the same array; under GFN2-xTB they come from
 * its full electron density, whichever division of it the labels show.
 *
 * GFN2-xTB's ESP-fitted charges are the default — of the point charges, the
 * ones that match the ESP surface most closely (decided with the user
 * 2026-10-12) — fitted to the single point every displayed structure gets;
 * the labels wait the moment the fit takes rather than flash other numbers,
 * and Mulliken (the engine's own SCC charges) stands in when it cannot be
 * built. MMFF94 BCI charges are there when the
 * user picks them — fitting for PubChem's MMFF94 geometries — and as the
 * fallback when the engine cannot treat the molecule.
 */
export type ChargeModel = 'gfn2' | 'gfn2-esp' | 'gfn2-cm5' | 'mmff94';

/** The first three divide GFN2-xTB's one electron density into atoms, three
 *  ways: Mulliken by basis function (`gfn2`), by the point charges that best
 *  reproduce its potential (`gfn2-esp`, the default), by real-space shares
 *  plus a dipole correction (`gfn2-cm5`). MMFF94 is a charge model of its own. */
export function isGfn2ChargeModel(model: ChargeModel): boolean {
  return model !== 'mmff94';
}

/** A control's or a saved view's value as a charge model; anything else
 *  (a view saved before the selector existed) is the default. */
export function asChargeModel(value: string | undefined): ChargeModel {
  return value === 'gfn2' || value === 'gfn2-cm5' || value === 'mmff94' ? value : 'gfn2-esp';
}

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
  highlightPiSystems: boolean;
  /** Which MO of the Delocalized ladder on screen (GFN2-xTB's or extended
   *  Hückel's) is drawn over the molecule (null = none) — what clicking a
   *  level does. */
  moIndex: number | null;
  /** The MO panel's view: the energy ladder, or the localized orbitals
   *  (Pipek–Mezey). Only one of the two selections draws at a time. */
  orbitalView: 'delocalized' | 'localized';
  /** Which calculation the delocalized ladder shows: GFN2-xTB (the default —
   *  self-consistent, so its ordering is the trustworthy one) or extended
   *  Hückel (the textbook picture). */
  moMethod: 'eh' | 'gfn2';
  /** How the Localized view localizes: Pipek–Mezey (the default — the
   *  orbitals find their own bonds and lone pairs, tails and all), or the
   *  Lewis structure as drawn, made into orbitals the NBO way, with the
   *  donor–acceptor energies E(2) between them (lewis-orbitals.ts). */
  localizeMethod: 'pipek-mezey' | 'lewis';
  /** For an open shell's GFN2 orbitals — the ladder or the localized list —
   *  which spin channel is listed. */
  moSpin: 'alpha' | 'beta';
  /** Which vibration is animated (an index into ctx.vibrations), or null. */
  vibrationIndex: number | null;
  /** Which localized orbitals are drawn over the molecule, in the order they
   *  were picked (empty = none). More than one is the hyperconjugation
   *  picture: a filled orbital and the empty one it reaches into, each with
   *  its own phase colours. */
  localizedSelection: number[];
  /** VSEPR/hybrid orbitals visible (the VSEPR view's checkbox). The MO
   *  picture takes precedence: an MO and the hybrid lobes are two different
   *  answers to the same question, so they never draw together. */
  showOrbitals: boolean;
  /** The ESP surface: GFN2-xTB's density surface, or the fused van der Waals
   *  surface under MMFF94 (see rebuildDisplay). */
  showEsp: boolean;
  /** Which partial charges the labels print (see ChargeModel). */
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

/**
 * The localized orbitals the Localized view lists, and where they came from:
 * GFN2-xTB's (one spin channel of an open shell), or extended Hückel's when
 * GFN2 has none to give.
 */
export interface LocalizedList {
  source: 'gfn2' | 'eh';
  /** Pipek–Mezey's orbitals, or the drawn Lewis structure's (NBO-style). */
  method: 'pipek-mezey' | 'lewis';
  spin: 'alpha' | 'beta' | null;
  basis: BasisFunction[];
  /** Classified and ordered; null when the filling is not settled — no list
   *  rather than a wrong one (the panel says why). */
  orbitals: LocalizedOrbital[] | null;
  /** ⟨φᵢ|F|φⱼ⟩ in eV between the orbitals above, in their order (fock-couplings.ts);
   *  null with them. */
  couplings: number[][] | null;
  /** The Lewis structure's E(2) in eV, filled orbital ↔ empty one, both ways
   *  round; null for Pipek–Mezey, whose filled and empty orbitals do not mix. */
  donation: number[][] | null;
  /** The share of the electrons the Lewis orbitals hold, 0–1; null for Pipek–Mezey. */
  lewisShare: number | null;
  /** How many d Rydberg orbitals the Lewis set holds and does not list. */
  rydbergs: number;
  /** Why the drawn structure could not be made into Lewis orbitals, or null. */
  refusal: string | null;
  /** What it was localized from — a GFN2 ladder or the EH result. */
  from: unknown;
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
  /** The selected orbitals' surfaces or lobes (see display.moIndex and
   *  display.localizedSelection). */
  moGroup: THREE.Group;
  atomRig: { key: THREE.DirectionalLight; fill: THREE.DirectionalLight; rim: THREE.DirectionalLight };
  display: DisplaySettings;
  currentMolecule?: Molecule;
  atomOrbitals: AtomOrbitals[] | null;
  /** The dipole of the charges on display (computed in rebuildDisplay from
   *  the same array as the labels and the ESP). */
  dipole: DipoleResult | null;
  /** The MMFF94 BCI charges for the current molecule (BCI + residual
   *  placement), for when that model is chosen or GFN2 cannot treat the
   *  molecule; null outside the MMFF94 type space. */
  charges: ResolvedCharges | null;
  /** The GFN2 optimiser's own Mulliken charges, when the structure on screen
   *  is its result — shown under Mulliken without waiting for the single
   *  point. Paired with its molecule: buildScene drops the bundle when it does
   *  not describe the molecule on screen, so a stale array can never be read. */
  gfn2Charges: Gfn2Charges | null;
  /** What GFN2's single point at the displayed geometry knows — charges,
   *  Wiberg bond orders, spin, the full dipole, the orbitals. Paired with its
   *  molecule like `gfn2Charges`, so a stale bundle is never read. */
  gfn2Properties: { molecule: Molecule; properties: Gfn2Properties } | null;
  /** That single point, asked for the molecule on screen once: pending while
   *  it runs, failed (with why) when the engine could not treat it — the
   *  charges then fall back to MMFF94 and say so. */
  gfn2PropertiesRequest: {
    molecule: Molecule; status: 'pending' | 'failed'; reason?: string;
    /** Settles when the run does, either way — for whoever must wait on it (the SDF export). */
    done?: Promise<void>;
  } | null;
  /** GFN2's orbital ladders, built once from `gfn2Properties` (irrep labels
   *  cost a symmetry detection). */
  gfn2Ladders: { properties: Gfn2Properties; ladders: { alpha: Gfn2Ladder; beta: Gfn2Ladder | null } | null } | null;
  /** GFN2 orbital surfaces asked of the worker and not yet back, by mesh key. */
  gfn2SurfaceRequests: Set<string>;
  /** Cached fused vdW ESP surface for the current molecule (computed lazily
   *  on the first ESP render; null until then or for an untypeable molecule). */
  espSurface: EspSurfaceData | null;
  /** The charges `espSurface` was built from — the surface is a function of
   *  the charges as much as of the geometry, so a different array (a model
   *  switch, or GFN2 charges arriving) re-extracts it. */
  espSurfaceCharges: number[] | null;
  /** GFN2's ESP for the single point `key` names: the exact potential on its
   *  density surface. */
  gfn2Esp: { key: number; exact: EspSurfaceData } | null;
  /** That surface, asked of the worker: the key it was asked for, and whether
   *  it failed (then the van der Waals surface stands in). */
  gfn2EspRequest: { key: number; failed: boolean } | null;
  /** GFN2's ESP-fitted, Hirshfeld and CM5 charges for the single point `key`
   *  names, built in the worker when one of them is first chosen. */
  gfn2ChargeSets: { key: number; sets: Gfn2ChargeSets } | null;
  /** Those charges, asked of the worker, and whether that failed. */
  gfn2ChargeSetsRequest: { key: number; failed: boolean } | null;
  /** Extracted isosurfaces, keyed by orbital and level (`mo:<index>@…`,
   *  `localized:<index>@…`, `gfn2:<run>:<orbital>@…`). Each costs ~50 ms to
   *  extract, and the same orbital can be picked, dropped and
   *  picked again while comparing orbitals — so they are kept until the
   *  isovalue or the molecule changes. */
  moSurfaces: Map<string, MoSurfaceData>;
  /** Evaluated fields, keyed by the orbital — the half of the surface that
   *  does not depend on the level, so a level change re-marches a field that
   *  is already in hand (see computeMoField). */
  moFields: Map<string, MoFieldData>;
  /** Cached extended-Hückel result for the current molecule (computed once in
   *  buildScene); null when an element is outside the parameter table. */
  ehResult: ExtendedHuckelResult | null;
  /** The Localized view's list, built on first ask from the orbitals it names
   *  (see localizedOnScreen) and kept until they change. */
  localized: LocalizedList | null;
  /** Every localized list built for this molecule — both spin channels of an
   *  open shell — so switching back is instant. */
  localizedLists: LocalizedList[];
  rerender: () => void;
  /** Called when the GFN2 single point lands — its orbitals are the ladder's
   *  GFN2 rows and the Localized view's list, which waited for it. */
  onGfn2Orbitals: () => void;
  /** GFN2-xTB's harmonic vibrations for the structure on screen — only when
   *  that structure is GFN2's own minimum (a fetched conformer is not one, so
   *  its "frequencies" would be meaningless). Paired with its molecule. */
  vibrations: { molecule: Molecule; modes: NormalMode[] } | null;
  /** Called on every animation frame (the vibration drives it), or null. */
  frame: { onFrame: ((now: number) => void) | null };
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
    autoRotate = false;
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
  // Nothing to show until an orbital is picked.
  moGroup.visible = false;
  scene.add(moGroup);
  const espGroup = new THREE.Group();
  // Off by default, like the dipole — the ESP surface is a thing you ask to see.
  espGroup.visible = false;
  scene.add(espGroup);

  let autoRotate = false;
  const frame: SceneContext['frame'] = { onFrame: null };

  function animate() {
    requestAnimationFrame(animate);
    frame.onFrame?.(performance.now());
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
    // group is all meshes (its δ+ tail cross is geometry, not a sprite), so it
    // needs no per-frame push.
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
      highlightPiSystems: false,
      moIndex: null,
      orbitalView: 'delocalized',
      moMethod: 'gfn2',
      moSpin: 'alpha',
      localizeMethod: 'pipek-mezey',
      vibrationIndex: null,
      localizedSelection: [],
      showOrbitals: true,
      showEsp: false,
      chargeModel: 'gfn2-esp',
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
    gfn2Ladders: null,
    gfn2SurfaceRequests: new Set(),
    espSurface: null,
    espSurfaceCharges: null,
    gfn2Esp: null,
    gfn2EspRequest: null,
    gfn2ChargeSets: null,
    gfn2ChargeSetsRequest: null,
    moSurfaces: new Map(),
    moFields: new Map(),
    ehResult: null,
    localized: null,
    localizedLists: [],
    rerender: () => {},
    vibrations: null,
    frame,
    onSceneBuilt: () => {},
    onGfn2Orbitals: () => {},
    teardown,
    get autoRotate() { return autoRotate; },
    setAutoRotate: (on: boolean) => { autoRotate = on; },
  };
}
