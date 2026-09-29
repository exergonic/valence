import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Molecule } from '../mol-parser';
import type { AtomOrbitals } from '../chem/vsepr/assign-orbitals';
import type { DipoleResult } from '../chem/charge-model/dipole';
import type { ResolvedCharges } from '../chem/charge-model/bci-charges';
import type { EspSurfaceData } from '../chem/charge-model/esp';
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
  /** Charge-model ESP surface (translucent vdW spheres colored by V). */
  showEsp: boolean;
  /** ESP surface translucency — 0.05..0.95 (1 − opacity reads as see-through). */
  espOpacity: number;
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
  rerender: () => void;
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
    scene, camera, renderer, controls, moleculeGroup, orbitalGroup, labelGroup, orbitalLabelGroup, piSystemGroup, dipoleGroup, espGroup, atomRig,
    display: {
      atomScale: 1, bondScale: 1, labelMode: 'atom', orbitalPreset: 'metallic', atomStyle: 'glossy', bgColor: '#ffffff',
      colors: { scheme: 'element', sigma: [0, 0, 1], pi: [0.58, 0.7, 1], lonePair: [0.1, 0.7, 1] },
      viewPreset: 'all',
      spaceFilling: false,
      autoRotate: false,
      highlightPiSystems: false,
      showEsp: false,
      espOpacity: 0.5,
    },
    atomOrbitals: null,
    dipole: null,
    charges: null,
    espSurface: null,
    rerender: () => {},
    teardown,
    get autoRotate() { return autoRotate; },
    setAutoRotate: (on: boolean) => { autoRotate = on; },
  };
}
