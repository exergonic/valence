import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { Molecule } from '../mol-parser';

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
  showLabels: boolean;
  orbitalPreset: 'glass' | 'glossy' | 'matte' | 'metallic';
  bgColor: string;
  colors: ColorSettings;
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: TrackballControls;
  moleculeGroup: THREE.Group;
  orbitalGroup: THREE.Group;
  labelGroup: THREE.Group;
  display: DisplaySettings;
  currentMolecule?: Molecule;
  rerender: () => void;
}

export function initScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new TrackballControls(camera, renderer.domElement);
  controls.rotateSpeed = 3.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;

  const light = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(light);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  const moleculeGroup = new THREE.Group();
  moleculeGroup.visible = false;
  scene.add(moleculeGroup);
  const orbitalGroup = new THREE.Group();
  orbitalGroup.visible = true;
  scene.add(orbitalGroup);
  const labelGroup = new THREE.Group();
  labelGroup.visible = true;
  scene.add(labelGroup);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
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

  return {
    scene, camera, renderer, controls, moleculeGroup, orbitalGroup, labelGroup,
    display: {
      atomScale: 1, bondScale: 1, showLabels: true, orbitalPreset: 'metallic', bgColor: '#1a1a2e',
      colors: { scheme: 'element', sigma: [0, 0, 1], pi: [0.58, 0.7, 1], lonePair: [0.1, 0.7, 1] },
    },
    rerender: () => {},
  };
}
