/**
 * The MO isosurface mesh: |ψ| = c drawn as one continuous surface per phase,
 * the picture other programs show.
 *
 * The companion view — `mo-lobes.ts` — draws the same MO as its individual
 * atomic orbitals, which says exactly *which* AO contributes how much but
 * does not show the orbital's actual shape. Both read the same coefficients;
 * the user switches between them, and the composition line in the panel
 * describes the AO view's numbers either way.
 *
 * Phases are per-vertex colors from the surface data (the sign of ψ where the
 * surface was crossed), so the two sheets read as blue and orange exactly as
 * the lobes do.
 *
 * Translucent presets are drawn in two passes: a depth-only back-face pass
 * writes the far side's depth, then the translucent front pass blends only
 * the near surface. Without it the far side of a closed surface blends
 * through the near side — the ESP's lesson (see render/esp.ts), and an MO
 * surface is the same kind of closed shell.
 */
import * as THREE from 'three';
import type { MoSurfaceData } from '../chem/extended-huckel/mo-surface';
import { MO_PHASE_NEGATIVE, MO_PHASE_POSITIVE } from './mo-lobes';

export function renderMoIsosurface(
  group: THREE.Group,
  surface: MoSurfaceData,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  opacity = 0.85,
): void {
  if (surface.vertexCount === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(surface.normals, 3));
  const colors = new Float32Array(surface.positions.length);
  const positive = new THREE.Color(MO_PHASE_POSITIVE);
  const negative = new THREE.Color(MO_PHASE_NEGATIVE);
  for (let i = 0; i < surface.vertexCount; i++) {
    const color = surface.phases[i] > 0 ? positive : negative;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // The style sets the gloss. The OPACITY comes from the panel's slider and is
  // used as given — including in the metallic style, which is the app's
  // default: keying transparency off the style instead (as this did first)
  // makes the slider silently inert in the default configuration, which is
  // exactly how it was reported.
  let shininess = 300;
  let specular = 0xffffff;
  switch (preset) {
    case 'glossy':
      shininess = 60;
      specular = 0x333333;
      break;
    case 'matte':
      shininess = 3;
      specular = 0x000000;
      break;
    case 'metallic':
      shininess = 1000;
      break;
    default:
      break;
  }
  const alpha = Math.max(0.05, Math.min(1, opacity));

  if (alpha >= 1) {
    // fully opaque: one pass, no blending, no need for the far-side depth
    group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      shininess,
      specular,
    })));
    return;
  }

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
    opacity: alpha,
    depthWrite: false,
    shininess,
    specular,
  }));
  group.add(front);
}
