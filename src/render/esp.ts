import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import { getVdwRadius } from './chem-data';
import { espPotentialAt, espColor, espVmax } from '../chem/esp';

/**
 * The charge-model ESP surface: one translucent vdW-radius sphere per atom,
 * each vertex colored by the electric potential of ALL the molecule's point
 * charges (V(r) = Σ qᵢ/|r − rᵢ|, see chem/esp.ts). Built on the default
 * layer so the scene's ambient + directional light give it a lit look while
 * staying clear of the atom-only studio rig (layer 1).
 *
 * Transparency is the point here (the user asks to see the atoms beneath):
 * a single `opacity` slider drives the surface's translucency, and depth
 * writes are off so overlapping atomic spheres don't occlude each other.
 * The overlapping-sphere look (vdW spheres intersect) is the honest atomic
 * surface; a fused surface is a bigger job and not needed for the teaching
 * picture.
 */
const SEGMENTS = 32;
const CLIP_PERCENTILE = 90;

export function renderEsp(
  group: THREE.Group,
  molecule: Molecule,
  charges: number[],
  opacity: number,
): void {
  // Gather the potential at every vertex of every atom's sphere so the
  // color scale is computed over the whole surface at once (a global,
  // percentile-clipped, symmetric-about-zero scale). The geometries are
  // built once and held until the scale is known, then colored in place.
  const built: { geo: THREE.SphereGeometry; potentials: number[] }[] = [];
  const all: number[] = [];
  for (let i = 0; i < molecule.atoms.length; i++) {
    const radius = getVdwRadius(molecule.atoms[i].element);
    const geo = new THREE.SphereGeometry(radius, SEGMENTS, SEGMENTS);
    const pos = geo.getAttribute('position');
    const potentials: number[] = [];
    for (let k = 0; k < pos.count; k++) {
      const vx = molecule.atoms[i].x + pos.getX(k);
      const vy = molecule.atoms[i].y + pos.getY(k);
      const vz = molecule.atoms[i].z + pos.getZ(k);
      const p = espPotentialAt(vx, vy, vz, molecule.atoms, charges);
      potentials.push(p);
      all.push(p);
    }
    built.push({ geo, potentials });
  }
  const vmax = espVmax(all, CLIP_PERCENTILE);

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: Math.max(0.05, Math.min(0.95, opacity)),
    depthWrite: false,
  });

  for (let i = 0; i < molecule.atoms.length; i++) {
    const { geo, potentials } = built[i];
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const t = potentials[k] / vmax;
      const [r, g, b] = espColor(t);
      colors[k * 3] = r / 255;
      colors[k * 3 + 1] = g / 255;
      colors[k * 3 + 2] = b / 255;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(molecule.atoms[i].x, molecule.atoms[i].y, molecule.atoms[i].z);
    mesh.userData = { atomIndex: i, element: molecule.atoms[i].element, lobeType: 'esp' };
    group.add(mesh);
  }
}