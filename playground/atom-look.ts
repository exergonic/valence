// Dev-only playground — four panes, one camera, four scenes: the same
// content under four material/lighting treatments, so an atom look can be
// picked by eye instead of by argument.  Vite's build entry is index.html
// alone, so nothing here ships: `npm run dev` and open
// /valence/playground/atom-look.html
//
// Pane 1 reproduces the app exactly (atoms.ts MeshPhongMaterial + setup.ts
// ambient/directional).  Panes 2-4 are candidates; pane 4 opts into tone
// mapping (material.toneMapped), which is why the tone-map select changes
// only that pane — scene.background is never tone-mapped for sRGB colours
// (WebGLBackground sets toneMapped=false for them), so white stays white.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { getElementColor, getVisualRadius } from '../src/render/chem-data';

// Every pane uses 48×48 spheres: this comparison is about material and
// light, not tessellation.  (The app ships 24×24 today — separate axis.)
const SEGMENTS = 48;

// --------------------------------------------------------------- content

function centered(mol: Molecule): Molecule {
  const n = mol.atoms.length;
  const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / n;
  const cy = mol.atoms.reduce((s, a) => s + a.y, 0) / n;
  const cz = mol.atoms.reduce((s, a) => s + a.z, 0) / n;
  return { atoms: mol.atoms.map((a) => ({ ...a, x: a.x - cx, y: a.y - cy, z: a.z - cz })), bonds: mol.bonds };
}

const PHENOL = centered(parseMolBlock(EXAMPLES.find((e) => e.name.startsWith('Phenol'))!.mol));

// The element palette in one glance: H, C, N, O / P, S, Cl, F.
const GRID_ELEMENTS = ['H', 'C', 'N', 'O', 'P', 'S', 'Cl', 'F'];
const ELEMENTS: Molecule = {
  atoms: GRID_ELEMENTS.map((element, i) => ({
    element,
    x: ((i % 4) - 1.5) * 2.4,
    y: (0.5 - Math.floor(i / 4)) * 2.4,
    z: 0,
  })),
  bonds: [],
};

// ------------------------------------------------------------ treatments

interface Treatment {
  scene: THREE.Scene;
  spin: THREE.Group;
  materials: THREE.Material[];
  makeMaterial: (color: number) => THREE.Material;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// RoomEnvironment is three's built-in studio: emissive boxes around the
// origin.  PMREM-filtering it gives roughness-aware reflections with no
// asset to download — the same trick the app would use in setup.ts.
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

function whiteScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  return scene;
}

function track(scene: THREE.Scene) {
  const spin = new THREE.Group();
  scene.add(spin);
  const materials: THREE.Material[] = [];
  return {
    spin,
    materials,
    register: (m: THREE.Material) => {
      materials.push(m);
      return m;
    },
  };
}

// 1 — today: flat two-lamp Phong.
function paneToday(): Treatment {
  const scene = whiteScene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(1, 1, 1);
  scene.add(sun);
  const t = track(scene);
  return {
    scene,
    spin: t.spin,
    materials: t.materials,
    makeMaterial: (color) => t.register(new THREE.MeshPhongMaterial({ color, toneMapped: false })),
  };
}

// 2 — soft studio: the environment does all the lighting.
function paneSoft(): Treatment {
  const scene = whiteScene();
  scene.environment = envMap;
  const t = track(scene);
  return {
    scene,
    spin: t.spin,
    materials: t.materials,
    makeMaterial: (color) =>
      t.register(
        new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, envMapIntensity: 0.9, toneMapped: false }),
      ),
  };
}

// 3 — glossy ceramic: environment + one key light for a crisp highlight.
function paneGlossy(): Treatment {
  const scene = whiteScene();
  scene.environment = envMap;
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(2, 3, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(-3, -1, -2);
  scene.add(fill);
  const t = track(scene);
  return {
    scene,
    spin: t.spin,
    materials: t.materials,
    makeMaterial: (color) =>
      t.register(
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.28,
          metalness: 0,
          clearcoat: 0.55,
          clearcoatRoughness: 0.22,
          ior: 1.5,
          envMapIntensity: 1.0,
          toneMapped: false,
        }),
      ),
  };
}

// 4 — showcase: key + rim + fill, brighter environment, tone-mapped.
function paneShowcase(): Treatment {
  const scene = whiteScene();
  scene.environment = envMap;
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(-3, 2, -4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(-2, -3, 2);
  scene.add(fill);
  const t = track(scene);
  return {
    scene,
    spin: t.spin,
    materials: t.materials,
    makeMaterial: (color) =>
      t.register(
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.22,
          metalness: 0,
          clearcoat: 0.7,
          clearcoatRoughness: 0.15,
          ior: 1.5,
          envMapIntensity: 1.25,
          toneMapped: true,
        }),
      ),
  };
}

const treatments: Treatment[] = [paneToday(), paneSoft(), paneGlossy(), paneShowcase()];

// Same two contents in every pane: the molecule, and the element grid.
const moleculeGroups: THREE.Group[] = [];
const elementGroups: THREE.Group[] = [];

function fill(parent: THREE.Group, mol: Molecule, makeMaterial: (c: number) => THREE.Material) {
  for (const atom of mol.atoms) {
    const geometry = new THREE.SphereGeometry(getVisualRadius(atom.element), SEGMENTS, SEGMENTS);
    const mesh = new THREE.Mesh(geometry, makeMaterial(getElementColor(atom.element)));
    mesh.position.set(atom.x, atom.y, atom.z);
    parent.add(mesh);
  }
}

for (const t of treatments) {
  const molGroup = new THREE.Group();
  fill(molGroup, PHENOL, t.makeMaterial);
  const elGroup = new THREE.Group();
  fill(elGroup, ELEMENTS, t.makeMaterial);
  elGroup.visible = false;
  t.spin.add(molGroup, elGroup);
  moleculeGroups.push(molGroup);
  elementGroups.push(elGroup);
}

// ---------------------------------------------------------------- camera

// One camera for all four panes.  Each content gets its own fit distance
// (a pane is half the window, and half-height/half-width keep the window's
// aspect, so the vertical FOV is the fit); toggling refits along whatever
// direction the user has rotated to.
function radiusOf(mol: Molecule): number {
  let r = 0;
  for (const atom of mol.atoms) r = Math.max(r, Math.hypot(atom.x, atom.y, atom.z) + getVisualRadius(atom.element));
  return r;
}
const FOV = 42;
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 1);
const fitDistance = (radius: number) => (radius / Math.sin((FOV / 2) * (Math.PI / 180))) * 1.12;

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 2.5;
controls.zoomSpeed = 1.0;
controls.panSpeed = 0.6;

function fitCamera(radius: number) {
  const dir = camera.position.lengthSq() > 0 ? camera.position.clone().normalize() : new THREE.Vector3(0, 0, 1);
  camera.position.copy(dir.multiplyScalar(fitDistance(radius)));
  controls.target.set(0, 0, 0);
  controls.update();
}

// ---------------------------------------------------------------- render

// Pane order matches the labels: 0 tl, 1 tr, 2 bl, 3 br.  Viewport y is
// measured from the BOTTOM in WebGL, hence the flipped halves.
function renderAll() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const hw = w / 2;
  const hh = h / 2;
  const views: [number, number, number, number][] = [
    [0, hh, hw, hh],
    [hw, hh, hw, hh],
    [0, 0, hw, hh],
    [hw, 0, hw, hh],
  ];
  renderer.setScissorTest(true);
  treatments.forEach((t, i) => {
    const [x, y, vw, vh] = views[i];
    renderer.setViewport(x, y, vw, vh);
    renderer.setScissor(x, y, vw, vh);
    renderer.render(t.scene, camera);
  });
  renderer.setScissorTest(false);
}

let spinning = true;
let last = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  if (spinning) for (const t of treatments) t.spin.rotation.y += dt * 0.3;
  controls.update();
  renderAll();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ------------------------------------------------------------------- UI

const btnMol = document.getElementById('btn-molecule')!;
const btnEl = document.getElementById('btn-elements')!;

function setContent(which: 'molecule' | 'elements') {
  moleculeGroups.forEach((g) => (g.visible = which === 'molecule'));
  elementGroups.forEach((g) => (g.visible = which === 'elements'));
  btnMol.classList.toggle('active', which === 'molecule');
  btnEl.classList.toggle('active', which === 'elements');
  fitCamera(which === 'molecule' ? radiusOf(PHENOL) : radiusOf(ELEMENTS));
}

btnMol.onclick = () => setContent('molecule');
btnEl.onclick = () => setContent('elements');

const selTone = document.getElementById('sel-tone') as HTMLSelectElement;

function setTone(value: string) {
  renderer.toneMapping =
    value === 'none' ? THREE.NoToneMapping : value === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  // Only pane 4's materials are toneMapped, so only it visibly changes —
  // but the shader program is keyed on the curve, so flag the materials.
  for (const t of treatments) for (const m of t.materials) m.needsUpdate = true;
  selTone.value = value;
}

selTone.onchange = () => setTone(selTone.value);

const btnSpin = document.getElementById('btn-spin')!;
btnSpin.onclick = () => {
  spinning = !spinning;
  btnSpin.classList.toggle('active', spinning);
};

// ------------------------------------------------- scripted verification
// The agent can't see: these hooks let it assert every pane actually drew
// (per-pane pixel statistics) and drive the toggles for screenshots.
(window as unknown as Record<string, unknown>).__probe = () => {
  renderAll();
  const gl = renderer.getContext();
  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const stat = (x0: number, y0: number, ww: number, hh: number) => {
    let n = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let colored = 0;
    let nonWhite = 0;
    let minL = 255;
    let maxL = 0;
    for (let y = y0; y < y0 + hh; y += 4) {
      for (let x = x0; x < x0 + ww; x += 4) {
        const i = (y * w + x) * 4;
        const r = buf[i];
        const g = buf[i + 1];
        const b = buf[i + 2];
        sr += r;
        sg += g;
        sb += b;
        n++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 14) colored++;
        if (Math.min(r, g, b) < 245) nonWhite++;
        const l = (r + g + b) / 3;
        if (l < minL) minL = l;
        if (l > maxL) maxL = l;
      }
    }
    return {
      mean: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
      coloredPct: Number(((100 * colored) / n).toFixed(1)),
      coveragePct: Number(((100 * nonWhite) / n).toFixed(1)),
      lumRange: [minL, maxL],
    };
  };
  const hw = w >> 1;
  const hh = h >> 1;
  return {
    size: [w, h],
    pane1_today: stat(0, hh, hw, hh),
    pane2_soft: stat(hw, hh, hw, hh),
    pane3_glossy: stat(0, 0, hw, hh),
    pane4_showcase: stat(hw, 0, hw, hh),
  };
};
(window as unknown as Record<string, unknown>).__setContent = setContent;
(window as unknown as Record<string, unknown>).__setTone = setTone;
(window as unknown as Record<string, unknown>).__setSpin = (on: boolean) => {
  spinning = on;
  btnSpin.classList.toggle('active', spinning);
};

setTone('aces');
setContent('molecule');
animate();
(window as unknown as Record<string, unknown>).__ready = true;
