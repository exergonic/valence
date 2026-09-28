import * as THREE from 'three';
import type { LabelPalette } from './label-colors';
import type { AtomOrbitals } from '../chem/assign-orbitals';

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
  atomOrbitals: AtomOrbitals[],
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
    const info = atomOrbitals[i];
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
  atomOrbitals: AtomOrbitals[],
  palette: LabelPalette,
): void {
  placePerAtomLabels(group, molecule, 0.8, palette.hybrid, (i) => {
    const atom = molecule.atoms[i];
    const info = atomOrbitals[i];
    if (!info || atom.element === 'H') return null;
    return info.hybridization;
  });
}

/** Render a partial charge as a short sign-prefixed label: "+0.43",
 *  "−0.36" (U+2212 minus), "0.00". Values within ±0.005 read as zero. */
export function formatCharge(q: number): string {
  if (Math.abs(q) < 0.005) return '0.00';
  return q > 0 ? `+${q.toFixed(2)}` : `−${Math.abs(q).toFixed(2)}`;
}

// The one per-atom label placement loop shared by the label modes that hang
// a short text above every atom: the caller supplies the text (null to
// skip) and the color; the placement is always a fixed offset above the atom.
function placePerAtomLabels(
  group: THREE.Group,
  molecule: any,
  offset: number,
  color: string,
  textFor: (i: number) => string | null,
): void {
  for (let i = 0; i < molecule.atoms.length; i++) {
    const atom = molecule.atoms[i];
    const text = textFor(i);
    if (text === null) continue;
    const label = makeLabelSprite(text, color);
    label.position.set(atom.x, atom.y + offset, atom.z);
    group.add(label);
  }
}

// Partial-charge labels above every atom (hydrogens included — the dipole
// counts their charge too). Show the resolved charge-model values the dipole
// uses, so a label and the arrow always agree.
export function renderChargeLabels(
  group: THREE.Group,
  molecule: any,
  charges: number[],
  palette: LabelPalette,
): void {
  placePerAtomLabels(group, molecule, 0.8, palette.charge, (i) => {
    const q = charges[i];
    return q === undefined ? null : formatCharge(q);
  });
}
