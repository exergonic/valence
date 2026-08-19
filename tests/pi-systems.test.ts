import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { renderPiSystems, detectPiSystems } from '../src/render/pi-systems';
import { classifyMolecule } from '../src/chem/classify';
import type { Molecule } from '../src/mol-parser';

// A planar collection of carbons on a circle (all C–C in-plane ⇒ all p
// orbitals parallel), with the given bonds. Planar 2D coordinates keep the π
// directions perpendicular to the plane so every ring carbon lands in the
// same detected system.
function planarCarbonRings(
  n: number,
  bonds: { atom1Index: number; atom2Index: number; order: number }[],
): Molecule {
  const atoms = Array.from({ length: n }, (_, k) => {
    const angle = (2 * Math.PI * k) / n;
    return { element: 'C', x: 1.4 * Math.cos(angle), y: 1.4 * Math.sin(angle), z: 0 };
  });
  return { atoms, bonds };
}

// Benzene: a six-cycle with alternating double bonds.
const BENZENE = planarCarbonRings(6, [
  { atom1Index: 0, atom2Index: 1, order: 2 },
  { atom1Index: 1, atom2Index: 2, order: 1 },
  { atom1Index: 2, atom2Index: 3, order: 2 },
  { atom1Index: 3, atom2Index: 4, order: 1 },
  { atom1Index: 4, atom2Index: 5, order: 2 },
  { atom1Index: 5, atom2Index: 0, order: 1 },
]);

// Naphthalene as a regular decagon PLUS a fusion chord 0–5 (topologically the
// fused two-ring system: fusion carbons 0 and 5 each have degree 3). The
// Kekulé sets every other decagon edge double and the fusion chord single.
const NAPHTHALENE = planarCarbonRings(10, [
  { atom1Index: 0, atom2Index: 1, order: 2 },
  { atom1Index: 1, atom2Index: 2, order: 1 },
  { atom1Index: 2, atom2Index: 3, order: 2 },
  { atom1Index: 3, atom2Index: 4, order: 1 },
  { atom1Index: 4, atom2Index: 5, order: 2 },
  { atom1Index: 5, atom2Index: 6, order: 1 },
  { atom1Index: 6, atom2Index: 7, order: 2 },
  { atom1Index: 7, atom2Index: 8, order: 1 },
  { atom1Index: 8, atom2Index: 9, order: 2 },
  { atom1Index: 9, atom2Index: 0, order: 1 },
  { atom1Index: 0, atom2Index: 5, order: 1 }, // the shared fusion bond
]);

function renderCount(molecule: Molecule): number {
  const classifications = classifyMolecule(molecule);
  const group = new THREE.Group();
  renderPiSystems(group, molecule, classifications);
  return group.children.length;
}

describe('π system highlight (one tube per π bond)', () => {
  it('benzene forms a single 6-atom system', () => {
    const systems = detectPiSystems(BENZENE, classifyMolecule(BENZENE));
    expect(systems).toHaveLength(1);
    expect(systems[0].atomIndices).toHaveLength(6);
  });

  it('naphthalene forms a single 10-atom system including the fusion carbons', () => {
    const systems = detectPiSystems(NAPHTHALENE, classifyMolecule(NAPHTHALENE));
    expect(systems).toHaveLength(1);
    expect(systems[0].atomIndices).toHaveLength(10);
  });

  it('benzene renders one tube (×2 sides) per ring bond — 12 meshes', () => {
    expect(renderCount(BENZENE)).toBe(6 * 2);
  });

  it('naphthalene renders a tube for every bond INCLUDING the shared 4a–8a fusion bond — 22 meshes', () => {
    // 11 C–C bonds (the 10-cycle plus the fusion chord) × 2 sides = 22.
    // A single threaded curve could not traverse the fusion bond; the
    // per-bond rule includes it automatically.
    expect(renderCount(NAPHTHALENE)).toBe(11 * 2);
  });

  it('only bonded atoms within a system get tubes (no cross-system tubes)', () => {
    // Two separate benzene rings in one molecule stay two systems; the bond
    // count is 6 + 6 = 12 C–C bonds → 24 meshes, nothing bridging the rings.
    const biphenyl = planarCarbonRings(12, [
      // ring 1: atoms 0..5
      { atom1Index: 0, atom2Index: 1, order: 2 },
      { atom1Index: 1, atom2Index: 2, order: 1 },
      { atom1Index: 2, atom2Index: 3, order: 2 },
      { atom1Index: 3, atom2Index: 4, order: 1 },
      { atom1Index: 4, atom2Index: 5, order: 2 },
      { atom1Index: 5, atom2Index: 0, order: 1 },
      // ring 2: atoms 6..11
      { atom1Index: 6, atom2Index: 7, order: 2 },
      { atom1Index: 7, atom2Index: 8, order: 1 },
      { atom1Index: 8, atom2Index: 9, order: 2 },
      { atom1Index: 9, atom2Index: 10, order: 1 },
      { atom1Index: 10, atom2Index: 11, order: 2 },
      { atom1Index: 11, atom2Index: 6, order: 1 },
    ]);
    expect(renderCount(biphenyl)).toBe(12 * 2);
  });
});
