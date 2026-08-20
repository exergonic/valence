import * as THREE from 'three';
import type { LabelPalette } from '../utils/label-colors';

// Small text sprite for orbital/hybridization labels in the 3D scene.
// No background circle — just crisp text that always faces the camera.
// Colors come from the LabelPalette that matches the current background.
export function makeLabelSprite(text: string, color: string = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.4, 0.2, 1);
  return sprite;
}

// Labels for σ bonds, π orbitals, and lone pairs.
// σ labels show the bond type and connected atoms (e.g., "σ(C–C)").
// π labels show "π", lone pair labels show "lp".
export function renderOrbitalLabels(
  group: THREE.Group,
  molecule: any,
  classifications: any[],
  palette: LabelPalette,
): void {
  const n = molecule.atoms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
  }

  for (let i = 0; i < n; i++) {
    const atom = molecule.atoms[i];
    const info = classifications[i];
    if (!info) continue;

    // Sigma bond labels — at the midpoint of each bond
    for (const ni of adj[i]) {
      if (ni > i) {
        const neighbor = molecule.atoms[ni];
        const midX = (atom.x + neighbor.x) / 2;
        const midY = (atom.y + neighbor.y) / 2;
        const midZ = (atom.z + neighbor.z) / 2;
        const label = makeLabelSprite(`σ(${atom.element}–${neighbor.element})`, palette.sigma);
        label.position.set(midX, midY + 0.3, midZ);
        group.add(label);
      }
    }

    // Pi orbital labels — above the atom, slightly offset
    if (info.hasPi && info.piDirection) {
      const label = makeLabelSprite('π', palette.pi);
      label.position.set(atom.x, atom.y + 0.6, atom.z);
      group.add(label);
    }

    // Lone pair labels — below the atom
    if (info.lonePairs > 0) {
      const label = makeLabelSprite('lp', palette.lonePair);
      label.position.set(atom.x, atom.y - 0.6, atom.z);
      group.add(label);
    }
  }
}

// Hybridization labels above each heavy atom (sp, sp², sp³, sp³d, sp³d²).
export function renderHybridizationLabels(
  group: THREE.Group,
  molecule: any,
  classifications: any[],
  palette: LabelPalette,
): void {
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const info = classifications[i];
    if (!info || atom.element === 'H') continue;

    const label = makeLabelSprite(info.hybridization, palette.hybrid);
    label.position.set(atom.x, atom.y + 0.8, atom.z);
    group.add(label);
  }
}
