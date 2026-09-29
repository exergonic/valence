import * as THREE from 'three';
import type { EspSurfaceData } from '../chem/charge-model/esp';
import { espColor } from '../chem/charge-model/esp';

/**
 * The charge-model ESP surface: render the fused (united) vdW molecular
 * surface computed by chem/charge-model/esp.ts — non-indexed triangle soup whose per-
 * vertex normals come from the union field's gradient and whose colors come
 * from the potential probed at each surface vertex. This function only turns
 * the cached surface data into Three.js geometry; the surface itself is
 * computed once per molecule (see rebuild.ts), so opacity changes never
 * re-extract it.
 *
 * Translucent overlay on the default layer (the user asks to see the atoms
 * beneath it). Depth writes are off so the surface doesn't occlude itself.
 */
export function renderEsp(group: THREE.Group, surface: EspSurfaceData, opacity: number): void {
  if (surface.vertexCount === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));

  const colors = new Float32Array(surface.positions.length);
  for (let i = 0; i < surface.vertexCount; i++) {
    const t = surface.potentials[i] / surface.vmax;
    const [r, g, b] = espColor(t);
    colors[i * 3] = r / 255;
    colors[i * 3 + 1] = g / 255;
    colors[i * 3 + 2] = b / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Two passes so the translucent surface occludes ITSELF. A single
  // depthWrite:false translucent mesh lets the far side of the closed
  // surface blend through the near side — and at the deep creases where
  // atoms meet (DMS's hydrogen clusters), near + far + the white background
  // all blend into bright "leaks". The depth-only back-face pass writes the
  // far side's depth without painting anything; the front pass then blends
  // only the near surface (the atoms stay visible beneath it).
  const back = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    colorWrite: false,
    depthWrite: true,
  }));
  group.add(back);

  const front = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: Math.max(0.05, Math.min(0.95, opacity)),
    depthWrite: false,
  }));
  front.userData = { lobeType: 'esp' };
  group.add(front);
}