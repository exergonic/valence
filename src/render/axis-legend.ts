/**
 * The x, y, z legend in the scene's corner: the structure's own coordinate
 * axes — the frame its XYZ export is written in — as they point on screen
 * right now. It turns with the trackball and with auto-rotate (which turns
 * the molecule, not the camera), so it always says which way x is.
 *
 * Drawn as an SVG overlay rather than a second Three.js scene: three lines
 * and three letters, crisp at any size and coloured by the theme's tokens.
 * An axis pointing away from the reader is drawn behind and dimmer.
 */
import * as THREE from 'three';

const SVG = 'http://www.w3.org/2000/svg';
/** The legend's box and the length of an axis pointing straight across, px. */
const SIZE = 64;
const ARM = 20;
const AXES = [
  { name: 'x', vector: new THREE.Vector3(1, 0, 0) },
  { name: 'y', vector: new THREE.Vector3(0, 1, 0) },
  { name: 'z', vector: new THREE.Vector3(0, 0, 1) },
];

export interface AxisLegend {
  /** Point the axes as the camera sees the molecule's frame. */
  update(camera: THREE.Camera, molecule: THREE.Object3D, visible: boolean): void;
}

export function createAxisLegend(container: HTMLElement): AxisLegend {
  const svg = document.createElementNS(SVG, 'svg');
  svg.id = 'axis-legend';
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.setAttribute('aria-hidden', 'true');
  const centre = SIZE / 2;
  const ring = document.createElementNS(SVG, 'circle');
  ring.setAttribute('class', 'axis-ring');
  ring.setAttribute('cx', String(centre));
  ring.setAttribute('cy', String(centre));
  ring.setAttribute('r', String(centre - 1));
  svg.appendChild(ring);
  const arms = AXES.map(({ name }) => {
    const group = document.createElementNS(SVG, 'g');
    group.setAttribute('class', `axis-${name}`);
    const line = document.createElementNS(SVG, 'line');
    line.setAttribute('x1', String(centre));
    line.setAttribute('y1', String(centre));
    const label = document.createElementNS(SVG, 'text');
    label.textContent = name;
    group.append(line, label);
    svg.appendChild(group);
    return { group, line, label };
  });
  container.appendChild(svg);

  const toCamera = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  let last = '';
  return {
    update(camera, molecule, visible) {
      svg.classList.toggle('hidden', !visible);
      if (!visible) return;
      // skip the DOM when nothing turned since the last frame
      const key = [...camera.quaternion.toArray(), ...molecule.quaternion.toArray()].map((q) => q.toFixed(4)).join();
      if (key === last) return;
      last = key;
      toCamera.copy(camera.quaternion).invert().multiply(molecule.quaternion);
      const placed = AXES.map((axis, k) => {
        direction.copy(axis.vector).applyQuaternion(toCamera);
        return { k, x: direction.x, y: direction.y, z: direction.z };
      });
      // back to front, so a nearer axis is drawn over a farther one
      placed.sort((a, b) => a.z - b.z);
      for (const { k, x, y, z } of placed) {
        const { group, line, label } = arms[k];
        line.setAttribute('x2', (centre + ARM * x).toFixed(2));
        line.setAttribute('y2', (centre - ARM * y).toFixed(2));
        label.setAttribute('x', (centre + (ARM + 7) * x).toFixed(2));
        label.setAttribute('y', (centre - (ARM + 7) * y).toFixed(2));
        group.setAttribute('opacity', (0.45 + 0.55 * (z + 1) / 2).toFixed(2));
        svg.appendChild(group);
      }
    },
  };
}
