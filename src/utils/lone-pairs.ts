import {
  vecSub, vecNormalize, vecDot, crossProduct, findPerpendicular, rotateRodrigues, rotateToward,
} from './vec3';

// Direction(s) for the σ lone-pair lobes of an atom, given its σ-bond
// directions and the total number of hybrid orbitals (σ bonds + lone
// pairs).  Pure geometry, no Three.js — kept out of render/ so it can be
// unit-tested like the hybridization logic.
export function getLonePairDirections(
  sigmaDirs: [number, number, number][],
  total: number,
  sigmaPlaneNormal?: [number, number, number] | null,
): [number, number, number][] {
  const missing = total - sigmaDirs.length;
  if (missing <= 0) return [];

  // One empty hybrid orbital: lone pair opposite the σ-bond centroid
  // (e.g. NH₃, H₂O: sp³ with one or two lone pairs filling one slot;
  //  also AX₃E or AX₂E₂ trigonal pyramidal / bent geometries).
  if (missing === 1) {
    // Three or more σ bonds: use the axis equidistant from all of them —
    // the generalized C₃ axis of the trigonal pyramid.  The centroid
    // shortcut below is exact for symmetric pyramids (NH₃, Me₃N) but is
    // dragged toward clustered bonds in strained rings: aziridine's ring
    // C–N–C angle is 62°, which shoved the lone pair to ~101° from the
    // N–H bond instead of the correct ~120° from all three bonds.
    if (sigmaDirs.length >= 3) {
      const u1 = vecNormalize(sigmaDirs[0]);
      const u2 = vecNormalize(sigmaDirs[1]);
      const u3 = vecNormalize(sigmaDirs[2]);
      // v ⊥ (u1−u2) and v ⊥ (u1−u3) ⇒ v·u1 = v·u2 = v·u3: equal angles
      // with all three σ bonds by construction.  Degenerate only when
      // the bonds are collinear (cross product vanishes) — then fall
      // through to the centroid.
      const v = vecNormalize(crossProduct(vecSub(u1, u2), vecSub(u1, u3)));
      if (v[0] !== 0 || v[1] !== 0 || v[2] !== 0) {
        // Pick the side away from the bond cluster (the pyramid apex).
        const toward = vecDot(v, [u1[0] + u2[0] + u3[0], u1[1] + u2[1] + u3[1], u1[2] + u2[2] + u3[2]]);
        return [toward > 0 ? [-v[0], -v[1], -v[2]] : v];
      }
    }
    const sum: [number, number, number] = [0, 0, 0];
    for (const d of sigmaDirs) { sum[0] += d[0]; sum[1] += d[1]; sum[2] += d[2]; }
    const lp = vecNormalize([-sum[0], -sum[1], -sum[2]]);
    if (lp[0] === 0 && lp[1] === 0 && lp[2] === 0) return [[0, 0, 1]];
    return [lp];
  }

  // Two empty hybrids with two σ bonds: lone pair positions above and
  // below the σ-bond plane (e.g. bent AX₂E₂ like H₂O — 2 σ bonds
  // in the plane, 2 lone pairs in equatorial-like positions).
  if (missing === 2 && sigmaDirs.length >= 2) {
    const a = vecNormalize(sigmaDirs[0]);
    const b = vecNormalize(sigmaDirs[1]);
    const cosPhi = vecDot(a, b);

    if (Math.abs(cosPhi + 1) < 1e-6) {
      const perp = findPerpendicular(a);
      return [perp, [-perp[0], -perp[1], -perp[2]]];
    }

    // Coefficients for placing 2 lone pairs when 2 σ bonds define a
    // plane.  Derived from VSEPR: lone pairs occupy equatorial-like
    // positions above and below the σ-bond plane, symmetric about it.
    // alpha = -1 / (3(1+cosϕ)), gamma = sqrt(1 − 2/(9(1+cosϕ)))
    const sumAB: [number, number, number] = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const normal = vecNormalize(crossProduct(a, b));
    const alpha = -1 / (3 * (1 + cosPhi));
    const gamma = Math.sqrt(1 - 2 / (9 * (1 + cosPhi)));

    const lp1: [number, number, number] = [
      alpha * sumAB[0] + gamma * normal[0],
      alpha * sumAB[1] + gamma * normal[1],
      alpha * sumAB[2] + gamma * normal[2],
    ];
    const lp2: [number, number, number] = [
      alpha * sumAB[0] - gamma * normal[0],
      alpha * sumAB[1] - gamma * normal[1],
      alpha * sumAB[2] - gamma * normal[2],
    ];
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  // Two empty hybrids, one σ bond, and a known π-plane normal:
  // lone pairs placed 120° apart in the σ plane — the plane containing
  // the σ bond and perpendicular to the π p-orbital direction (e.g. O₂:
  // one σ bond, two lone pairs in the sp² plane straddling the π system).
  if (missing === 2 && sigmaDirs.length === 1 && sigmaPlaneNormal) {
    const a = vecNormalize(sigmaDirs[0]);
    let axis: [number, number, number] = sigmaPlaneNormal;
    const dotAV = vecDot(a, axis);
    axis = [axis[0] - dotAV * a[0], axis[1] - dotAV * a[1], axis[2] - dotAV * a[2]];
    axis = vecNormalize(axis);
    if (axis[0] === 0 && axis[1] === 0 && axis[2] === 0) {
      axis = findPerpendicular(a);
    }
    const cos120 = -0.5;
    const sin120 = Math.sqrt(3) / 2;
    const lp1 = rotateRodrigues(a, axis, cos120, sin120);
    const lp2 = rotateRodrigues(a, axis, cos120, -sin120);
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  // Two empty hybrids, one σ bond, no plane normal:
  // fallback to a perpendicular plane with 120° spacing
  // (e.g. diatomic molecules or isolated fragments).
  if (missing === 2 && sigmaDirs.length >= 1) {
    const a = vecNormalize(sigmaDirs[0]);
    const perp = findPerpendicular(a);
    const cos120 = -0.5;
    const sin120 = Math.sqrt(3) / 2;
    const lp1: [number, number, number] = [
      cos120 * a[0] + sin120 * perp[0],
      cos120 * a[1] + sin120 * perp[1],
      cos120 * a[2] + sin120 * perp[2],
    ];
    const lp2: [number, number, number] = [
      cos120 * a[0] - sin120 * perp[0],
      cos120 * a[1] - sin120 * perp[1],
      cos120 * a[2] - sin120 * perp[2],
    ];
    return [vecNormalize(lp1), vecNormalize(lp2)];
  }

  // Three empty hybrids, one σ bond: tetrahedral arrangement of
  // the three lone pairs around the remaining σ direction
  // (e.g. XeF₂ or similar hypervalent AX₂E₃ geometry).
  if (missing === 3 && sigmaDirs.length >= 1) {
    const a = vecNormalize(sigmaDirs[0]);
    const invSqrt3 = 1 / Math.sqrt(3);
    const tets: [number, number, number][] = [
      [invSqrt3, invSqrt3, invSqrt3],
      [invSqrt3, -invSqrt3, -invSqrt3],
      [-invSqrt3, invSqrt3, -invSqrt3],
      [-invSqrt3, -invSqrt3, invSqrt3],
    ];
    const rotated = tets.map((v) => rotateToward(v, tets[0], a));
    return rotated.slice(1).map((v) => vecNormalize(v));
  }

  return [];
}
