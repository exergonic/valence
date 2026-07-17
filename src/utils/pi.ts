import type { Molecule } from '../mol-parser';
import { vecNormalize, vecDot, crossProduct, findPerpendicular } from './vec3';

// Computes the p-orbital direction for an atom by looking at a specific
// neighbor's σ-bond geometry.  The neighbor's π-plane normal is determined
// from its σ-bond vectors (cross product of two of its own bonds).
function piDirectionFromNeighbor(
  neighborIdx: number,
  atomIdx: number,
  adj: number[][],
  molecule: Molecule,
  atomPos: [number, number, number],
): [number, number, number] | null {
  const otherBonds = adj[neighborIdx].filter((ni) => ni !== atomIdx);
  if (otherBonds.length >= 2) {
    const nb = molecule.atoms[neighborIdx];
    const s1 = molecule.atoms[otherBonds[0]];
    const s2 = molecule.atoms[otherBonds[1]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const v2: [number, number, number] = [s2.x - nb.x, s2.y - nb.y, s2.z - nb.z];
    return vecNormalize(crossProduct(v1, v2));
  }

  if (otherBonds.length === 1) {
    const nb = molecule.atoms[neighborIdx];
    const s1 = molecule.atoms[otherBonds[0]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
    return vecNormalize(crossProduct(v1, bd));
  }

  // Fallback: perpendicular to the bond to the neighbor
  const nb = molecule.atoms[neighborIdx];
  const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
  return vecNormalize(findPerpendicular(bd));
}

// Finds the first neighbor with π bonds and returns that neighbor's
// p-orbital direction.  Used for conjugated sp³ atoms and for sp² atoms
// that need to borrow their π geometry from an adjacent π system.
export function getPiDirectionFromNeighbor(
  atomIdx: number,
  adj: number[][],
  molecule: Molecule,
  piCount: number[],
  atomPos: [number, number, number],
): [number, number, number] | null {
  const piNeighbor = adj[atomIdx].find((ni) => piCount[ni] > 0);
  if (piNeighbor === undefined) return null;
  return piDirectionFromNeighbor(piNeighbor, atomIdx, adj, molecule, atomPos);
}

// Main π-direction decision tree.
// Returns the direction a p orbital should point, or null if no p orbital
// exists (sp³ with no conjugation) or if the atom's π system is handled
// independently by the renderer (sp without a conjugating side neighbor).
export function computePiDirection(
  atomIdx: number,
  molecule: Molecule,
  adj: number[][],
  piCount: number[],
  atomPos: [number, number, number],
  neighborVectors: [number, number, number][],
  hyb: { hybridization: string },
  conjugated: boolean,
): [number, number, number] | null {
  let piDirection: [number, number, number] | null = null;

  if (conjugated) {
    piDirection = getPiDirectionFromNeighbor(atomIdx, adj, molecule, piCount, atomPos);
  }

  if (!piDirection && hyb.hybridization === 'sp2' && neighborVectors.length === 1 && piCount[atomIdx] > 0) {
    piDirection = getPiDirectionFromNeighbor(atomIdx, adj, molecule, piCount, atomPos);
  }

  if (!piDirection && hyb.hybridization === 'sp2' && neighborVectors.length >= 2) {
    const nrm = vecNormalize(crossProduct(neighborVectors[0], neighborVectors[1]));
    if (nrm[0] !== 0 || nrm[1] !== 0 || nrm[2] !== 0) piDirection = nrm;
  }

  // sp with ≥2 neighbors: one is the triple-bond partner, another may carry
  // a π system (e.g. a carbonyl or alkene).  Align one p orbital parallel
  // to that neighbor's π direction so the π systems overlap correctly.
  if (!piDirection && hyb.hybridization === 'sp' && neighborVectors.length >= 2) {
    for (const ni of adj[atomIdx]) {
      const bond = molecule.bonds.find(
        (b) => (b.atom1Index === atomIdx && b.atom2Index === ni)
            || (b.atom1Index === ni && b.atom2Index === atomIdx)
      );
      // The triple-bond partner (bond order 3) is not a conjugation source
      if (bond && bond.order === 3) continue;
      if (piCount[ni] > 0) {
        piDirection = piDirectionFromNeighbor(ni, atomIdx, adj, molecule, atomPos);
        break;
      }
    }
  }

  // Ensure π direction is perpendicular to the first σ bond (the reference
  // bond).  This projection prevents the p orbital from having a component
  // along the σ framework.
  if (piDirection && neighborVectors.length > 0) {
    const ref = vecNormalize(neighborVectors[0]);
    const dot = vecDot(ref, piDirection);
    piDirection = vecNormalize([
      piDirection[0] - dot * ref[0],
      piDirection[1] - dot * ref[1],
      piDirection[2] - dot * ref[2],
    ]);
  }

  return piDirection;
}
