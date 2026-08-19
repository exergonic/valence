/**
 * Pure fade logic for world-space atom labels — unit-tested without Three.js
 * (tests/label-fade.test.ts).
 *
 * Atom-label sprites are composited on top of the scene (depthTest: false),
 * so they are never geometrically occluded. Unmodulated, that means EVERY
 * label in the molecule — the distant methyl hydrogen included — renders
 * over the foreground orbitlols, cluttering the view. Fading opacity by
 * camera distance declutters it: atoms in front stay fully readable (their
 * own orbitals never hide the label, since depth is ignored), while labels
 * past the fade window disappear instead of poking through the scene.
 */

/**
 * Label opacity for an atom `distance` from the camera. 1 up to `near`, 0 at
 * or beyond `far`, with a smoothstep ease between so labels stay readable
 * while they matter and then taper off cleanly.
 */
export function labelOpacity(distance: number, near: number, far: number): number {
  if (far <= near) return distance < near ? 1 : 0;
  const t = (distance - near) / (far - near);
  if (t <= 0) return 1;
  if (t >= 1) return 0;
  const s = t * t * (3 - 2 * t); // smoothstep
  return 1 - s;
}

/**
 * The fade window for a molecule, anchored to the actual camera-distance
 * span of its atoms (computed once at framing time in buildScene).
 *
 * The camera frames the molecule from outside it, so every atom sits between
 * `nearestDist` (the front of the molecule) and `farthestDist` (its rear).
 * Spanning the fade across that depth range — with a little slack so the
 * front-most atoms are solidly opaque and the rear ones genuinely recede —
 * keeps labels visible exactly where you are looking and fades the rest,
 * self-adapting to every molecule and to any zoom.
 */
export function fadeWindow(nearestDist: number, farthestDist: number): { near: number; far: number } {
  const min = Math.max(nearestDist, 0);
  const max = Math.max(farthestDist, min);
  return { near: 0.9 * min, far: 1.1 * max };
}
