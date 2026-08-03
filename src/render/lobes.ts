import * as THREE from 'three';

// Orbital lobes are surfaces of revolution: a 2D teardrop profile revolved
// around the lobe axis with LatheGeometry.
export interface LobeProfile {
  points: { x: number; y: number }[];
  segments: number;
}

const SEGMENTS = 24;

// Hand-tuned teardrop outline: radius swells to a maximum near 60% of the
// length, then tapers to the tip.  x = radius, y = distance along the axis.
function lobePoints(length: number, maxRadius: number): { x: number; y: number }[] {
  return [
    { x: 0, y: 0 },
    { x: maxRadius * 0.15, y: length * 0.05 },
    { x: maxRadius * 0.5, y: length * 0.15 },
    { x: maxRadius * 0.85, y: length * 0.35 },
    { x: maxRadius, y: length * 0.6 },
    { x: maxRadius * 0.8, y: length * 0.8 },
    { x: maxRadius * 0.35, y: length * 0.93 },
    { x: 0, y: length },
  ];
}

const SIGMA_LENGTH = 1.0;
const SIGMA_RADIUS = 0.25;
const PI_LENGTH = 1.1;
const PI_RADIUS = 0.35;
const LONE_PAIR_LENGTH = 1.2;
const LONE_PAIR_RADIUS = 0.4;

export function sigmaLobe(): LobeProfile {
  return { points: lobePoints(SIGMA_LENGTH, SIGMA_RADIUS), segments: SEGMENTS };
}

export function piLobe(): LobeProfile {
  return { points: lobePoints(PI_LENGTH, PI_RADIUS), segments: SEGMENTS };
}

export function lonePairLobe(): LobeProfile {
  return { points: lobePoints(LONE_PAIR_LENGTH, LONE_PAIR_RADIUS), segments: SEGMENTS };
}

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
