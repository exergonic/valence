import type { Molecule } from '../../mol-parser';
import { vecNormalize, vecDot, vecSub, crossProduct, findPerpendicular } from '../../utils/vec3';

// Maximum |cos| between a promoted lone-pair p orbital and any single σ
// bond of the promoting atom.  A real p orbital's node plane contains the
// whole σ framework, so the borrowed π direction must be perpendicular to
// every σ bond; each bond may sit up to 30° out of the node plane before
// we refuse to call the lone pair conjugated — beyond that the π overlap
// is weak enough that drawing a parallel p lobe would be misleading
// (e.g. thioanisole S, methyl ~60° out of the ring plane).
export const MAX_PROMOTION_TILT = Math.sin(Math.PI / 6); // sin 30°

// True when `direction` is perpendicular to every σ-bond vector (each
// bond within MAX_PROMOTION_TILT of the direction's node plane).
//
// Every bond has to be tested, not just the plane of two of them.  For a
// three-bond atom that plane is whichever pair the bond list happens to
// start with, and the pairs disagree on a pyramidal centre: the allyl
// anion's carbanion passed the old two-bond test on its first pair
// (|dot| = 0.999) while its third bond sat 35° out of the node plane
// (|dot| = 0.815), promoting a σ lone pair that the atom's own geometry
// says is not conjugated.  No direction is perpendicular to all three
// bonds of a pyramid, so such centres veto the promotion outright.
export function perpendicularToAllBonds(
  direction: [number, number, number],
  neighborVectors: [number, number, number][],
): boolean {
  const d = vecNormalize(direction);
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return false;
  for (const v of neighborVectors) {
    const u = vecNormalize(v);
    if (u[0] === 0 && u[1] === 0 && u[2] === 0) continue;
    if (Math.abs(vecDot(d, u)) > MAX_PROMOTION_TILT) return false;
  }
  return true;
}

// Two bonds closer to a straight line than this (sin of the angle between
// them) fix no plane: their cross product is zero, or numerical noise.
const LINEAR = Math.sin((10 * Math.PI) / 180);

function sinBetween(a: [number, number, number], b: [number, number, number]): number {
  const c = crossProduct(vecNormalize(a), vecNormalize(b));
  return Math.hypot(c[0], c[1], c[2]);
}

function bondOrder(molecule: Molecule, i: number, j: number): number {
  const bond = molecule.bonds.find(
    (b) => (b.atom1Index === i && b.atom2Index === j) || (b.atom1Index === j && b.atom2Index === i),
  );
  return bond?.order ?? 0;
}

// The p direction of an atom double-bonded to the sp centre of a cumulene:
// ketene's O (H₂C=C=O), CO₂'s, the O of an isocyanate R–N=C=O. Each π bond of
// a cumulene is at right angles to the next, so the atom's p is set by the far
// end of the chain. Walk along it, through double bonds, to the first atom that
// ends the chain; if its bonds fix a plane, its p is that plane's normal, turned
// 90° about the axis for every double bond between there and here. Whether a
// centre is cumulated is read from the bond orders, not from how straight the
// chain is: HN=C=O bends 8° and is still a cumulene.
// A chain with no plane at either end (CO₂) has no preferred direction: the
// lower-numbered terminal takes a fixed perpendicular, the other end the same
// one turned for each bond between, so the two π bonds stay at right angles.
function cumulenePiDirection(
  atomIdx: number,
  partnerIdx: number,
  adj: number[][],
  molecule: Molecule,
): [number, number, number] | null {
  const at = (i: number): [number, number, number] => [molecule.atoms[i].x, molecule.atoms[i].y, molecule.atoms[i].z];
  const axis = vecNormalize(vecSub(at(partnerIdx), at(atomIdx)));
  const turn = (v: [number, number, number], times: number): [number, number, number] =>
    times % 2 === 1 ? vecNormalize(crossProduct(axis, v)) : v;

  let prev = partnerIdx;
  let here = adj[partnerIdx].find((n) => n !== atomIdx)!;
  let turns = 1;
  for (;;) {
    const onward = adj[here].filter((n) => n !== prev);
    // the chain goes on through a single further double bond
    if (onward.length === 1 && bondOrder(molecule, here, onward[0]) === 2) {
      prev = here;
      here = onward[0];
      turns += 1;
      continue;
    }
    if (onward.length === 0) {
      // the far terminal: no plane anywhere along the chain
      const fixed = vecNormalize(findPerpendicular(axis));
      return atomIdx < here ? fixed : turn(fixed, turns);
    }
    // the chain ends at an atom with a plane of its own (CH₂, N–H)
    const toPrev = vecSub(at(prev), at(here));
    const inPlane = onward.find((n) => sinBetween(vecSub(at(n), at(here)), toPrev) >= LINEAR);
    if (inPlane === undefined) return null;
    return turn(vecNormalize(crossProduct(toPrev, vecSub(at(inPlane), at(here)))), turns);
  }
}

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
    const nrm = vecNormalize(crossProduct(v1, v2));
    return (nrm[0] !== 0 || nrm[1] !== 0 || nrm[2] !== 0) ? nrm : null;
  }

  if (otherBonds.length === 1) {
    const nb = molecule.atoms[neighborIdx];
    const s1 = molecule.atoms[otherBonds[0]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
    // the sp centre of a cumulene: its two bonds fix no plane, and this
    // atom's p is set by the far end of the chain
    if (bondOrder(molecule, atomIdx, neighborIdx) === 2 && bondOrder(molecule, neighborIdx, otherBonds[0]) === 2) {
      return cumulenePiDirection(atomIdx, neighborIdx, adj, molecule);
    }
    // two bonds in line fix no plane: the cross product is noise
    if (sinBetween(v1, bd) < LINEAR) return null;
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
    // Try pairs of σ-bond vectors until a non-collinear pair gives a proper
    // plane normal.  Linear arrangements (e.g. C-C≡C where C1 and C3 are
    // collinear with the sp² C) produce zero cross products.
    for (let a = 0; a < neighborVectors.length && !piDirection; a++) {
      for (let b = a + 1; b < neighborVectors.length && !piDirection; b++) {
        const nrm = vecNormalize(crossProduct(neighborVectors[a], neighborVectors[b]));
        if (nrm[0] !== 0 || nrm[1] !== 0 || nrm[2] !== 0) piDirection = nrm;
      }
    }
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

  // sp without a conjugating side neighbor but with a triple-bond partner:
  // inherit the π direction from the partner so both p-orbital pairs align
  // across the triple bond.  If the partner's σ geometry is degenerate
  // (collinear bonds), fall back to an arbitrary perpendicular — this is
  // deterministic for a given bond axis, so both atoms get the same result.
  if (!piDirection && hyb.hybridization === 'sp' && neighborVectors.length >= 1) {
    const triplePartner = adj[atomIdx].find((ni) => {
      const bond = molecule.bonds.find(
        (b) => (b.atom1Index === atomIdx && b.atom2Index === ni)
            || (b.atom1Index === ni && b.atom2Index === atomIdx)
      );
      return bond && bond.order === 3;
    });
    if (triplePartner !== undefined) {
      piDirection = getPiDirectionFromNeighbor(atomIdx, adj, molecule, piCount, atomPos);
      // Degenerate collinear σ geometry (e.g. linear C-C≡C-C chain) —
      // pick a deterministic perpendicular; same axis → same result for
      // both atoms in the triple bond pair.
      if (!piDirection) {
        piDirection = vecNormalize(findPerpendicular(neighborVectors[0]));
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
