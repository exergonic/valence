import * as THREE from 'three';
import type { Molecule } from '../mol-parser';
import { getCovalentRadius } from './chem-data';

// How far each label is pushed toward the camera, as a multiple of the
// atom's own orbital-cloud radius (covalent radius + padding). The orbital
// lobes extend ~1.0–1.2 × that scale from the atom center, so this puts the
// label just past its OWN lobes: its own σ/π/lone-pair orbitals (and its own
// atom) can never occlude it, while any genuinely nearer geometry can.
const LABEL_PUSH = 1.25;

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  const cx = 40, cy = 40, r = 32;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  // depthTest: true — labels STEP IN FRONT of their own orbitals via the
  // per-frame push (updateLabels), so they are occluded by anything genuinely
  // nearer (foreground lobes, bonds, atoms) but never by their own geometry.
  // depthWrite: false keeps the labels from hiding each other.
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.375, 0.375, 1);
  return sprite;
}

export function renderLabels(group: THREE.Group, molecule: Molecule): void {
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const sprite = makeTextSprite(atom.element);
    sprite.position.set(atom.x, atom.y, atom.z);
    // Remember the atom position and the label's push so updateLabels can
    // re-position the sprite toward the camera on every frame.
    sprite.userData = {
      atomIndex: i,
      atomX: atom.x, atomY: atom.y, atomZ: atom.z,
      push: LABEL_PUSH * (getCovalentRadius(atom.element) + 0.2),
    };
    group.add(sprite);
  }
}

/**
 * Per-frame label update (called from the render loop): keep each label
 * pushed just in front of its own orbitals.
 *
 * The push makes depth testing behave the way it should for a label: its own
 * σ/π/lone-pair lobes sit behind the pushed depth, so they never occlude it,
 * while genuinely foreground geometry (another atom's lobes — the Metal-style
 * opaque ones included — or bonds/atoms) does.
 */
export function updateLabels(group: THREE.Group, camera: THREE.PerspectiveCamera): void {
  // Compute the camera in the group's local frame: the label group can be
  // auto-rotating independently of the camera.
  group.updateMatrixWorld(true);
  const camLocal = group.worldToLocal(camera.position.clone());

  for (const child of group.children) {
    if (!(child instanceof THREE.Sprite)) continue;
    const ud = child.userData;
    const bx = ud.atomX as number | undefined;
    const by = ud.atomY as number | undefined;
    const bz = ud.atomZ as number | undefined;
    if (bx === undefined || by === undefined || bz === undefined) continue;

    const base = new THREE.Vector3(bx, by, bz);
    const toCam = camLocal.clone().sub(base);
    const dist = toCam.length();
    if (dist > 1e-9) toCam.divideScalar(dist);

    child.position.copy(base).addScaledVector(toCam, ud.push as number);
  }
}
