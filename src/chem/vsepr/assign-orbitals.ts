// Per-atom orbital assignment: for every atom of a molecule with 3D
// coordinates, decide which orbitals it shows and where they point —
// hybridization (hybridize.ts), σ lone pairs, the conjugation promotion,
// and the p-orbital direction(s) (orient-pi.ts).  The renderer consumes
// this to draw lobes and labels.

import type { Molecule } from '../../mol-parser';
import { assignHybridization } from './hybridize';
import { VALENCE_ELECTRONS } from '../valence-electrons';
import { showsOnlyValenceS, valenceSOrbital } from '../elements';
import { computePiDirection, getPiDirectionFromNeighbor, perpendicularToAllBonds } from './orient-pi';
import { vecDot, crossProduct } from '../../utils/vec3';
import * as THREE from 'three';

// One atom's assigned orbitals — what the renderer draws and labels.
export interface AtomOrbitals {
  element: string;
  hybridization: string;   // display label: 'sp', 'sp²', 'sp³'
  lonePairs: number;       // σ lone pairs (lobes drawn in σ positions)
  hasPi: boolean;          // whether a p orbital should be rendered
  piDirection: [number, number, number] | null;  // primary p-orbital direction
  piDirection2: [number, number, number] | null; // second p-orbital direction (sp only)
  /** False for an element this electron-domain model does not describe — a
   *  transition metal or an alkali metal. Such an atom gets no hybrids and
   *  counts as no neighbour for the atoms bonded to it: a haptic Fe–C contact
   *  is not a VSEPR domain, and counting it made every cyclopentadienyl carbon
   *  read sp³ instead of sp². */
  described: boolean;
  /** For an undescribed metal, its valence s orbital ("4s" on Ni) — drawn as
   *  a sphere and labelled, because a bare atom said less than the truth: the
   *  metal does have a valence s. Null for every described atom. */
  valenceS: string | null;
}

/**
 * Does the electron-domain model describe this element? The main group does,
 * metals and noble gases included — BeCl₂ is linear, SnCl₂ bent, BiCl₃
 * pyramidal, XeF₄ square planar, all by counting σ pairs and lone pairs. A
 * transition metal does not: its bonding is d-based and often haptic, so
 * ferrocene's iron would be labelled "sp³d²" by clamping ten contacts into
 * the six-domain ceiling; nor does an alkali metal, whose one electron makes
 * a mostly ionic contact (`showsOnlyValenceS`). An element needs a valence
 * count to be counted at all.
 */
export function isVseprElement(element: string): boolean {
  return !showsOnlyValenceS(element) && element in VALENCE_ELECTRONS;
}

/**
 * Each atom's σ neighbours — the bonds that are electron domains. Between two
 * main-group atoms every bond is one. A bond to a metal is one for the ligand
 * atom when it is a donor bond: Cl⁻ in NiCl₄²⁻ or the cyanide C in
 * Ni(CN)₄²⁻ gives the metal a lone pair, and that pair still points somewhere —
 * at the metal. Dropping the bond left each chloride with four lone pairs and
 * no bond to orient them by, so none were drawn. A haptic contact is not a
 * domain: when the metal is also bonded to one of the atom's own neighbours
 * (a cyclopentadienyl ring, an η² alkene), the atom shares the metal with its
 * ring rather than donating a pair, and counting it made every ferrocene
 * carbon read sp³. The metal itself has no neighbours here: the model does
 * not describe it.
 */
export function sigmaNeighbors(molecule: Molecule): number[][] {
  const { atoms, bonds } = molecule;
  const bonded: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    bonded[b.atom1Index].push(b.atom2Index);
    bonded[b.atom2Index].push(b.atom1Index);
  }
  const described = (i: number) => isVseprElement(atoms[i].element);
  return bonded.map((list, i) => {
    if (!described(i)) return [];
    return list.filter((j) => described(j)
      || !list.some((k) => k !== j && bonded[j].includes(k)));
  });
}

// Takes a molecule with 3D coordinates and assigns the orbitals of every
// heavy atom.  Returns the same number of entries as molecule.atoms
// (hydrogen included: one σ bond and no lone pair is steric number 1, which
// reads 's' — no hybridization and no π system).
export function assignOrbitals(molecule: Molecule): AtomOrbitals[] {
  const atomCount = molecule.atoms.length;

  const neighborsOf = sigmaNeighbors(molecule);

  // Count of π bonds touching each atom: a double bond = 1, a triple = 2.
  // Only bonds between described atoms — a metal's d-orbital π back-bonding
  // is not a p orbital this model draws.
  const piBondsPerAtom: number[] = new Array(atomCount).fill(0);
  for (const bond of molecule.bonds) {
    const a = molecule.atoms[bond.atom1Index].element;
    const b = molecule.atoms[bond.atom2Index].element;
    if (!isVseprElement(a) || !isVseprElement(b)) continue;
    const piCount = Math.max(0, bond.order - 1);
    piBondsPerAtom[bond.atom1Index] += piCount;
    piBondsPerAtom[bond.atom2Index] += piCount;
  }

  const result: AtomOrbitals[] = [];

  for (let atomIdx = 0; atomIdx < atomCount; atomIdx++) {
    const atom = molecule.atoms[atomIdx];
    if (!isVseprElement(atom.element)) {
      result.push({
        element: atom.element, hybridization: '', lonePairs: 0, hasPi: false,
        piDirection: null, piDirection2: null, described: false,
        valenceS: showsOnlyValenceS(atom.element) ? valenceSOrbital(atom.element) : null,
      });
      continue;
    }
    const neighborIndices = neighborsOf[atomIdx];

    // Vectors from this atom to each of its neighbors (needed for angle measurement)
    const bondVectors: [number, number, number][] = neighborIndices.map((ni) => {
      const n = molecule.atoms[ni];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z];
    });

    // Step 1: hybridization from the bond graph — element, σ bonds,
    // π bonds, and the formal charge determine the electron-domain
    // count. No angle measurement: measured angles are the OUTPUT of
    // geometry refinement, and any threshold misclassifies part of the
    // continuous range (the refined ether oxygen at 111.7° vs sp²'s
    // ~120°). An ether O has 2 σ bonds → 2 lone pairs → 4 domains →
    // sp³ at any angle; a carbonyl O (1 σ + 1 π) has 3 domains → sp².
    // The charge matters because it changes the electron count: a
    // methyl anion (C, 3 σ, −1) is isoelectronic with ammonia — 1 lone
    // pair → sp³ — where a neutral 3-σ carbon (CH₃ radical/cation) has
    // none and reads sp².
    const hybrid = assignHybridization(atom.element, neighborIndices.length, piBondsPerAtom[atomIdx], atom.charge ?? 0);

    // Step 2: count σ lone pairs from steric number − σ bonds.
    // (Steric number = σ bonds + lone pairs, by VSEPR)
    const stericNumber = hybrid.hybridization === 's' ? 1
      : hybrid.hybridization === 'sp' ? 2
      : hybrid.hybridization === 'sp2' ? 3
      : hybrid.hybridization === 'sp3d' ? 5
      : hybrid.hybridization === 'sp3d2' ? 6
      : 4;
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

    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];

    // Conjugation: promote one σ lone pair to a p orbital.
    // Only needed for sp³ atoms (they have all 4 orbitals hybridized).
    // sp² already has an unused p orbital, so no promotion is needed.
    let conjugated = lonePairs > 0 && conjugatingNeighbors > 0 && piBondsPerAtom[atomIdx] === 0;

    // Geometric veto on the promotion: a p orbital's node plane contains
    // the σ framework, so the borrowed π direction must be perpendicular
    // to EVERY σ bond — not just to the plane of two of them.  On a
    // three-bond atom that plane is whichever pair the bond list starts
    // with, and a pyramidal centre passes on one pair while another bond
    // sticks far out of the node plane (allyl anion: 0.999 on the first
    // pair, 0.815 on the third bond), promoting a σ lone pair that the
    // atom's own geometry says is not conjugated.  Planar phenol/furan O
    // passes, pyramidal carbanions and thioanisole S (methyl twisted ~60°
    // out of the ring plane) keep their σ lone pairs instead of drawing a
    // fake p lobe parallel to the ring.
    if (conjugated) {
      const borrowed = getPiDirectionFromNeighbor(atomIdx, neighborsOf, molecule, piBondsPerAtom, atomPos);
      if (borrowed && !perpendicularToAllBonds(borrowed, bondVectors)) {
        conjugated = false;
      }
    }

    if (conjugated && hybrid.hybridization === 'sp3') lonePairs -= 1;

    // Step 4: decide whether a p orbital exists (the "π system").
    // Sources: own π bonds, a promoted σ lone pair, or an inherently
    // unhybridized p orbital from sp²/sp geometry.
    const hasPi = piBondsPerAtom[atomIdx] > 0 || conjugated
      || (hybrid.hybridization === 'sp2' && piBondsPerAtom[atomIdx] === 0)
      || (hybrid.hybridization === 'sp' && bondVectors.length >= 1);

    // Step 5: compute which direction the p orbital points.
    const piDirection = computePiDirection(
      atomIdx, molecule, neighborsOf, piBondsPerAtom,
      atomPos, bondVectors, hybrid, conjugated,
    );

    // For sp atoms with π bonds, compute the second p-orbital direction
    // (perpendicular to the first and to the bond axis). Triple-bonded sp
    // atoms have two perpendicular π systems (ethyne, N₂).
    let piDirection2: [number, number, number] | null = null;
    if (piDirection && hybrid.hybridization === 'sp' && bondVectors.length >= 1 && piBondsPerAtom[atomIdx] >= 2) {
      const bondAxis = [
        bondVectors[0][0],
        bondVectors[0][1],
        bondVectors[0][2],
      ] as [number, number, number];
      const p2 = crossProduct(bondAxis, piDirection);
      const p2n = new THREE.Vector3(p2[0], p2[1], p2[2]).normalize();
      piDirection2 = [p2n.x, p2n.y, p2n.z];
    }

    // Step 6: pick the display label.
    // Conjugation turns sp³ into sp² (one σ lone pair became p).
    let hybridLabel = hybrid.hybridization === 's' ? 's'
      : hybrid.hybridization === 'sp2' ? 'sp²'
      : hybrid.hybridization === 'sp3' ? 'sp³'
      : hybrid.hybridization === 'sp3d' ? 'sp³d'
      : hybrid.hybridization === 'sp3d2' ? 'sp³d²'
      : hybrid.hybridization;
    if (conjugated && hybrid.hybridization === 'sp3') hybridLabel = 'sp²';

    result.push({
      element: atom.element,
      hybridization: hybridLabel,
      lonePairs,
      hasPi,
      piDirection,
      piDirection2,
      described: true,
      valenceS: null,
    });
  }

  // Post-processing: synchronize piDirections across triple-bond sp pairs.
  // Both sp atoms in a triple bond must use the same p-orbital orientation
  // so their two π systems overlap correctly (one p from each atom forms
  // a π bond; the second pair of perpendicular p's forms the other π bond).
  for (const bond of molecule.bonds) {
    if (bond.order !== 3) continue;
    const a = result[bond.atom1Index];
    const b = result[bond.atom2Index];
    if (!a.piDirection || !b.piDirection) continue;
    if (Math.abs(vecDot(a.piDirection, b.piDirection)) >= 0.99) continue;
    // Unify: use the first atom's direction for both.
    b.piDirection = a.piDirection;
    b.piDirection2 = a.piDirection2;
  }

  return result;
}
