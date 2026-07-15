import * as THREE from 'three';
import type { LobeProfile } from './types';

export function createLobeMesh(
  profile: LobeProfile,
  color: number,
  opacity: number = 0.7,
): THREE.Mesh {
  const points = profile.points.map((p) => new THREE.Vector2(p.x, p.y));
  const geo = new THREE.LatheGeometry(points, profile.segments);
  const mat = new THREE.MeshPhongMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
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
