import * as THREE from 'three';

// Orbital lobes are surfaces of revolution: a 2D teardrop profile revolved
// around the lobe axis with LatheGeometry.
export interface LobeProfile {
  points: { x: number; y: number }[];
  segments: number;
}

/** Steps around the axis, and points along the outline. Measured
 *  2026-10-12: a lobe this fine builds in the same ~0.1 ms as the old 8 × 24
 *  one (the fixed cost of a geometry dominates), and each kind is built once
 *  and shared, so the smoothness costs nothing a user could feel. */
const SEGMENTS = 48;
const OUTLINE_POINTS = 32;

/**
 * The teardrop outline, x = radius, y = distance along the axis:
 * r(s) = R · (3√3/2) · s · √(1 − s), s = y / length — widest (R) two thirds of
 * the way out. Convex everywhere by construction: the √(1 − s) end is a
 * parabolic cap, so the lobe ends round at any zoom, and the linear start keeps
 * the point at the nucleus where a p orbital's two lobes meet. (A smooth curve
 * through the old hand-placed points put a nipple on the tip: their last point
 * sat inside the convex outline, and the curve had to bend in and out to
 * reach it.) The points crowd toward the tip, where the radius changes
 * fastest: s = 1 − (1 − u)², u even.
 */
function teardropOutline(length: number, maxRadius: number): { x: number; y: number }[] {
  const scale = (3 * Math.sqrt(3)) / 2;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < OUTLINE_POINTS; k++) {
    const u = k / (OUTLINE_POINTS - 1);
    const s = 1 - (1 - u) ** 2;
    out.push({ x: maxRadius * scale * s * Math.sqrt(Math.max(0, 1 - s)), y: length * s });
  }
  out[OUTLINE_POINTS - 1] = { x: 0, y: length };
  return out;
}

const SIGMA_LENGTH = 1.0;
const SIGMA_RADIUS = 0.25;
const PI_LENGTH = 1.1;
const PI_RADIUS = 0.35;
const LONE_PAIR_LENGTH = 1.2;
const LONE_PAIR_RADIUS = 0.4;

const profile = (length: number, radius: number): LobeProfile => ({
  points: teardropOutline(length, radius),
  segments: SEGMENTS,
});
const SIGMA = profile(SIGMA_LENGTH, SIGMA_RADIUS);
const PI = profile(PI_LENGTH, PI_RADIUS);
const LONE_PAIR = profile(LONE_PAIR_LENGTH, LONE_PAIR_RADIUS);

export function sigmaLobe(): LobeProfile {
  return SIGMA;
}

export function piLobe(): LobeProfile {
  return PI;
}

export function lonePairLobe(): LobeProfile {
  return LONE_PAIR;
}

/**
 * One geometry per lobe kind, at unit size, shared by every lobe of that kind
 * — a lobe's size is its mesh's scale. Marked `shared`, so clearing a group
 * leaves it alone (rebuild.ts).
 */
const lobeGeometries = new Map<LobeProfile, THREE.LatheGeometry>();

function lobeGeometry(profile: LobeProfile): THREE.LatheGeometry {
  let geometry = lobeGeometries.get(profile);
  if (!geometry) {
    geometry = new THREE.LatheGeometry(profile.points.map((p) => new THREE.Vector2(p.x, p.y)), profile.segments);
    geometry.userData.shared = true;
    lobeGeometries.set(profile, geometry);
  }
  return geometry;
}

let unitSphere: THREE.SphereGeometry | null = null;

/** The unit sphere an s orbital is drawn with, shared like the lobes. */
export function sharedUnitSphere(): THREE.SphereGeometry {
  if (!unitSphere) {
    unitSphere = new THREE.SphereGeometry(1, 48, 32);
    unitSphere.userData.shared = true;
  }
  return unitSphere;
}

export function createLobeMesh(
  profile: LobeProfile,
  color: number,
  opacity: number = 0.7,
  preset: 'glass' | 'glossy' | 'matte' | 'metallic' = 'glass',
  scale: number = 1,
): THREE.Mesh {
  const geo = lobeGeometry(profile);

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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(scale);
  return mesh;
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
