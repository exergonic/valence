import type { Molecule } from '../mol-parser';
import { assignHybridization, assignBySteric } from '../hybridization';
import { VALENCE } from '../data/valence';
import { computePiDirection } from './pi';
import { vecDot } from './vec3';

// Result for one atom after running the full VSEPR + conjugation pipeline.
// The renderer uses this to decide which lobes to draw and where.
export interface AtomClassification {
  element: string;
  hybridization: string;   // display label: 'sp', 'sp²', 'sp³'
  lonePairs: number;       // σ lone pairs (lobes drawn in σ positions)
  hasPi: boolean;          // whether a p orbital should be rendered
  piDirection: [number, number, number] | null;  // which way the p orbital points
}

// Takes a molecule with 3D coordinates and classifies every heavy atom.
// Returns the same number of entries as molecule.atoms (hydrogen included,
// but hydrogens always classify as sp³ with 0 lone pairs and no π system).
export function classifyMolecule(molecule: Molecule): AtomClassification[] {
  const atomCount = molecule.atoms.length;

  // Adjacency list + count of π bonds touching each atom.
  // A double bond = 1 π bond, a triple bond = 2 π bonds.
  const neighborsOf: number[][] = Array.from({ length: atomCount }, () => []);
  const piBondsPerAtom: number[] = new Array(atomCount).fill(0);
  for (const bond of molecule.bonds) {
    neighborsOf[bond.atom1Index].push(bond.atom2Index);
    neighborsOf[bond.atom2Index].push(bond.atom1Index);
    const piCount = Math.max(0, bond.order - 1);
    piBondsPerAtom[bond.atom1Index] += piCount;
    piBondsPerAtom[bond.atom2Index] += piCount;
  }

  const result: AtomClassification[] = [];

  for (let atomIdx = 0; atomIdx < atomCount; atomIdx++) {
    const atom = molecule.atoms[atomIdx];
    const neighborIndices = neighborsOf[atomIdx];

    // Vectors from this atom to each of its neighbors (needed for angle measurement)
    const bondVectors: [number, number, number][] = neighborIndices.map((ni) => {
      const n = molecule.atoms[ni];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z];
    });

    // Step 1: pick hybridization — from bond angles when possible,
    // otherwise from valence electron count (steric number).
    const hybrid = bondVectors.length >= 2
      ? assignHybridization(atom.element, bondVectors, piBondsPerAtom[atomIdx])
      : assignBySteric(Math.min(4, Math.max(2,
          neighborIndices.length + Math.round(Math.max(0,
            (VALENCE[atom.element] || 4) - neighborIndices.length - piBondsPerAtom[atomIdx]) / 2))));

    // Step 2: count σ lone pairs from steric number − σ bonds.
    // (Steric number = σ bonds + lone pairs, by VSEPR)
    const stericNumber = hybrid.hybridization === 'sp' ? 2
      : hybrid.hybridization === 'sp2' ? 3 : 4;
    const sigmaBonds = neighborIndices.length;
    let lonePairs = Math.max(0, stericNumber - sigmaBonds);

    // Step 3: conjugation detection — can a σ lone pair delocalize into
    // a neighbor's π system?  This happens for furan O, aniline N, amide N,
    // and H₂SO₄ OH oxygen (lone pair donates into S=O π*).
    // Only C, N, O, S neighbors count as π sources.
    const PI_SOURCE_ELEMENTS = new Set(['C', 'N', 'O', 'S']);
    const conjugatingNeighbors = neighborIndices.filter((ni) => {
      if (!PI_SOURCE_ELEMENTS.has(molecule.atoms[ni].element)) return false;
      // π bonds in the bond between this atom and the neighbor shouldn't count
      const sharedPi = molecule.bonds
        .filter((b) => (b.atom1Index === atomIdx && b.atom2Index === ni)
                     || (b.atom1Index === ni && b.atom2Index === atomIdx))
        .reduce((s, b) => s + Math.max(0, b.order - 1), 0);
      return (piBondsPerAtom[ni] - sharedPi) > 0;
    }).length;

    // Conjugation: promote one σ lone pair to a p orbital.
    // Only needed for sp³ atoms (they have all 4 orbitals hybridized).
    // sp² already has an unused p orbital, so no promotion is needed.
    const conjugated = lonePairs > 0 && conjugatingNeighbors > 0 && piBondsPerAtom[atomIdx] === 0;
    if (conjugated && hybrid.hybridization === 'sp3') lonePairs -= 1;

    // Step 4: decide whether a p orbital exists (the "π system").
    // Sources: own π bonds, a promoted σ lone pair, or an inherently
    // unhybridized p orbital from sp²/sp geometry.
    const hasPi = piBondsPerAtom[atomIdx] > 0 || conjugated
      || (hybrid.hybridization === 'sp2' && piBondsPerAtom[atomIdx] === 0)
      || (hybrid.hybridization === 'sp' && bondVectors.length >= 1);

    // Step 5: compute which direction the p orbital points.
    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];
    const piDirection = computePiDirection(
      atomIdx, molecule, neighborsOf, piBondsPerAtom,
      atomPos, bondVectors, hybrid, conjugated,
    );

    // Step 6: pick the display label.
    // Conjugation turns sp³ into sp² (one σ lone pair became p).
    // Map internal 'sp2'/'sp3' to Unicode 'sp²'/'sp³'.
    const internalLabel = hybrid.hybridization === 'sp2' ? 'sp²'
      : hybrid.hybridization === 'sp3' ? 'sp³'
      : hybrid.hybridization;
    const displayLabel = conjugated && hybrid.hybridization === 'sp3' ? 'sp²' : internalLabel;

    result.push({
      element: atom.element,
      hybridization: displayLabel,
      lonePairs,
      hasPi,
      piDirection,
    });
  }

  // Post-processing: synchronize piDirections across triple-bond sp pairs.
  // Both sp atoms in a triple bond must use the same p-orbital orientation
  // so their two π systems overlap correctly (one p from each atom forms
  // a π bond; the second pair of perpendicular p's forms the other π bond).
  // Independent computation can give different results (one used neighbor
  // conjugation, the other fell back to findPerpendicular on the bond axis).
  for (const bond of molecule.bonds) {
    if (bond.order !== 3) continue;
    const a = result[bond.atom1Index];
    const b = result[bond.atom2Index];
    if (!a.piDirection || !b.piDirection) continue;
    if (Math.abs(vecDot(a.piDirection, b.piDirection)) >= 0.99) continue;
    // Unify: use the first atom's direction for both.
    b.piDirection = a.piDirection;
  }

  return result;
}
