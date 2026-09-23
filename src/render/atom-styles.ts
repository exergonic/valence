// The atom look: four presets for the atom meshes, from the plain Phong of
// 'classic' to the env-lit, three-lamp 'showcase'.  Atoms are styled
// independently of the orbitals, so the lit presets keep the base
// ambient/directional off the atoms and light them from a dedicated rig —
// three.js allows that only per object, so those atoms sit on layer 1 alone.
// Any new raycaster must enable layer 1 or atoms stop being pickable.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { SceneContext } from './setup';

export type AtomStyle = 'classic' | 'soft' | 'glossy' | 'showcase';

/** Layer reserved for atom meshes that must ignore the base lights. */
export const ATOM_LAYER = 1;

interface StyleSpec {
  /** Key / fill / rim intensities of the atom rig. */
  rig: [number, number, number];
  /** Environment-map intensity; 0 means the material gets no env map. */
  env: number;
  /** Surface for MeshPhysicalMaterial, or null for the plain Phong of 'classic'. */
  surface: { roughness: number; clearcoat: number; clearcoatRoughness: number } | null;
}

const SPECS: Record<AtomStyle, StyleSpec> = {
  classic: { rig: [0, 0, 0], env: 0, surface: null },
  soft: { rig: [0, 0, 0], env: 0.9, surface: { roughness: 0.55, clearcoat: 0, clearcoatRoughness: 0 } },
  glossy: { rig: [0.9, 0.25, 0], env: 1.0, surface: { roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.22 } },
  showcase: { rig: [1.0, 0.2, 0.6], env: 1.25, surface: { roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15 } },
};

let envMap: THREE.Texture | null = null;

/** RoomEnvironment through PMREM — built once, shared by every atom style. */
export function atomEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  if (!envMap) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envMap;
}

export function makeAtomMaterial(style: AtomStyle, color: number, env: THREE.Texture | null): THREE.Material {
  const spec = SPECS[style];
  if (!spec.surface) return new THREE.MeshPhongMaterial({ color });
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: spec.surface.roughness,
    metalness: 0,
    clearcoat: spec.surface.clearcoat,
    clearcoatRoughness: spec.surface.clearcoatRoughness,
    ior: 1.5,
    envMap: env,
    envMapIntensity: spec.env,
  });
}

/** Layer the atom meshes of a style belong to: the default one for classic,
 *  the atom-only layer once the rig or the environment does the lighting. */
export function atomLayer(style: AtomStyle): number {
  return style === 'classic' ? 0 : ATOM_LAYER;
}

/** Point the scene's atom lighting at a style.  buildScene calls this, so
 *  every path that rebuilds — dropdown, loaded view, share link — lands here. */
export function applyAtomStyle(ctx: SceneContext, style: AtomStyle): void {
  ctx.display.atomStyle = style;
  const spec = SPECS[style];
  ctx.atomRig.key.intensity = spec.rig[0];
  ctx.atomRig.fill.intensity = spec.rig[1];
  ctx.atomRig.rim.intensity = spec.rig[2];
  if (spec.env > 0) atomEnvMap(ctx.renderer);
}
