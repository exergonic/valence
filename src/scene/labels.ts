import * as THREE from 'three';
import type { Molecule } from '../mol-parser';

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
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.25, 0.25, 1);
  return sprite;
}

export function renderLabels(group: THREE.Group, molecule: Molecule): void {
  for (const atom of molecule.atoms) {
    const sprite = makeTextSprite(atom.element);
    sprite.position.set(atom.x, atom.y, atom.z);
    group.add(sprite);
  }
}
