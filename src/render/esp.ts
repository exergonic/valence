import * as THREE from 'three';
import type { EspSurfaceData } from '../chem/esp';
import { espColor } from '../chem/esp';

/**
 * The charge-model ESP surface: render the fused (united) vdW molecular
 * surface computed by chem/esp.ts — non-indexed triangle soup whose per-
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

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: Math.max(0.05, Math.min(0.95, opacity)),
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData = { lobeType: 'esp' };
  group.add(mesh);
}