import * as THREE from 'three';
import type { LobeProfile } from './types';

export function createLobeMesh(
  profile: LobeProfile,
  color: number,
  opacity: number = 0.7,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  scale: number = 1,
): THREE.Mesh {
  const points = profile.points.map((p) => new THREE.Vector2(p.x * scale, p.y * scale));
  const geo = new THREE.LatheGeometry(points, profile.segments);

  let mat: THREE.MeshPhongMaterial;
  switch (preset) {
    case 'glossy':
      mat = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity: Math.min(1, opacity + 0.15),
        side: THREE.DoubleSide, depthWrite: false,
        shininess: 60, specular: 0x333333,
      });
      break;
    case 'matte':
      mat = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity: Math.min(1, opacity + 0.2),
        side: THREE.DoubleSide, depthWrite: false,
        shininess: 3, specular: 0x000000,
      });
      break;
    case 'metallic':
      mat = new THREE.MeshPhongMaterial({
        color, opacity: 1,
        side: THREE.DoubleSide, depthWrite: true,
        shininess: 1000, specular: 0xffffff,
      });
      break;
    default: // glass — bright, shiny, almost metallic
      mat = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity: Math.min(1, opacity * 0.85),
        side: THREE.DoubleSide, depthWrite: false,
        shininess: 300, specular: 0xffffff,
      });
  }
  return new THREE.Mesh(geo, mat);
}

export function orientLobe(
  mesh: THREE.Mesh,
  origin: [number, number, number],
  direction: [number, number, number],
): void {
  mesh.position.set(origin[0], origin[1], origin[2]);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize();

  if (Math.abs(dir.dot(up)) > 0.9999) {
    if (dir.y < 0) mesh.rotation.z = Math.PI;
    return;
  }

  const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
  mesh.quaternion.copy(quat);
}
