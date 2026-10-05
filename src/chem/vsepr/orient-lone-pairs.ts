import {
  vecSub, vecNormalize, vecDot, crossProduct, findPerpendicular, projectPerpendicular, rotateRodrigues, rotateToward,
} from '../../utils/vec3';

// Direction(s) for the σ lone-pair lobes of an atom, given its σ-bond
// directions and the total number of hybrid orbitals (σ bonds + lone
// pairs).  The σ/π direction-placement logic, next to orient-pi.ts; pure
// geometry, no Three.js, so it unit-tests like the hybridization rules.
export function getLonePairDirections(
  sigmaDirs: [number, number, number][],
  total: number,
  sigmaPlaneNormal?: [number, number, number] | null,
): [number, number, number][] {
  const missing = total - sigmaDirs.length;
  if (missing <= 0) return [];

  // Five and six electron domains have rules of their own: the lone pairs of
  // a trigonal bipyramid are equatorial, and those of an octahedron trans to
  // one another. The four-domain rules below placed SF₄'s lone pair 30° off
  // its equatorial slot, ClF₃'s on one arbitrary perpendicular and I₃⁻'s as a
  // tetrahedron around one bond.
  if (total === 5) return trigonalBipyramidalLonePairs(sigmaDirs.map(vecNormalize), missing);
  if (total === 6) return octahedralLonePairs(sigmaDirs.map(vecNormalize), missing);

  // One empty hybrid orbital: lone pair opposite the σ-bond centroid
  // (e.g. NH₃, H₂O: sp³ with one or two lone pairs filling one slot;
  //  also AX₃E or AX₂E₂ trigonal pyramidal / bent geometries).
  if (missing === 1) {
    // Three σ bonds: use the axis equidistant from all of them — the
    // generalized C₃ axis of the trigonal pyramid.  The centroid
    // shortcut below is exact for symmetric pyramids (NH₃, Me₃N) but is
    // dragged toward clustered bonds in strained rings: aziridine's ring
    // C–N–C angle is 62°, which shoved the lone pair to ~101° from the
    // N–H bond instead of the correct ~120° from all three bonds.
    if (sigmaDirs.length === 3) {
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
      const perp = vecNormalize(findPerpendicular(a));
      return [perp, [-perp[0], -perp[1], -perp[2]]];
    }

    // The two lone pairs sit symmetrically above and below the σ-bond plane,
    // in the plane through the bisector: l = −cosψ·û ± sinψ·n̂, with û the
    // bond bisector and n̂ the plane normal. ψ is the larger of two angles:
    //  - the one that puts each lone pair at the tetrahedral 109.47° to each
    //    bond, cosψ = 1/(3cos(φ/2)) — water's picture;
    //  - half the bond angle, φ/2 — the lone pairs opening as the bonds do.
    // They agree at φ = 109.47°, so the switch is seamless. The first alone
    // pinched the pairs together as the bonds opened (59° apart at a 135°
    // bond angle) and had no solution past 141° — disiloxane's 144° Si–O–Si
    // drew NaN lobes. With the second, a linear AX₂E₂ meets the branch above.
    const bisector = vecNormalize([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
    const normal = vecNormalize(crossProduct(a, b));
    const halfBondAngle = Math.acos(Math.max(-1, Math.min(1, cosPhi))) / 2;
    const tetrahedral = Math.acos(Math.min(1, 1 / (3 * Math.cos(halfBondAngle))));
    const psi = Math.max(tetrahedral, halfBondAngle);
    const along = -Math.cos(psi);
    const across = Math.sin(psi);
    return [
      vecNormalize([along * bisector[0] + across * normal[0], along * bisector[1] + across * normal[1], along * bisector[2] + across * normal[2]]),
      vecNormalize([along * bisector[0] - across * normal[0], along * bisector[1] - across * normal[1], along * bisector[2] - across * normal[2]]),
    ];
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

  // Three empty hybrids, one σ bond: tetrahedral arrangement of the three
  // lone pairs around it (a terminal halogen, HF). The hypervalent AX₂E₃
  // (I₃⁻, XeF₂) is five domains and is placed above.
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

const COS_120 = -0.5;
const SIN_120 = Math.sqrt(3) / 2;

/**
 * Lone pairs of a five-domain centre. In a trigonal bipyramid the equatorial
 * sites are the roomy ones (three neighbours at 90° instead of an axial
 * site's four), so lone pairs take them: SF₄'s one, ClF₃'s two, I₃⁻'s three.
 * `bonds` are unit vectors.
 */
function trigonalBipyramidalLonePairs(
  bonds: [number, number, number][],
  missing: number,
): [number, number, number][] {
  // AX₄E (seesaw): the axial pair cancels, so the centroid of the four bonds
  // lies along the equatorial bisector and the lone pair sits opposite it
  if (missing === 1) {
    const sum: [number, number, number] = [0, 0, 0];
    for (const d of bonds) { sum[0] -= d[0]; sum[1] -= d[1]; sum[2] -= d[2]; }
    const lp = vecNormalize(sum);
    return lp[0] === 0 && lp[1] === 0 && lp[2] === 0 ? [] : [lp];
  }
  // AX₃E₂ (T-shape): the two bonds nearest to opposite are axial; the lone
  // pairs share the equatorial plane with the third bond, 120° either side
  if (missing === 2 && bonds.length === 3) {
    let axial: [number, number] = [0, 1];
    let mostOpposite = Infinity;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const d = vecDot(bonds[i], bonds[j]);
        if (d < mostOpposite) { mostOpposite = d; axial = [i, j]; }
      }
    }
    const axis = vecNormalize(vecSub(bonds[axial[0]], bonds[axial[1]]));
    const equatorial = bonds[3 - axial[0] - axial[1]];
    const inPlane = vecNormalize(projectPerpendicular(equatorial, axis));
    if (inPlane[0] === 0 && inPlane[1] === 0 && inPlane[2] === 0) return [];
    return [
      vecNormalize(rotateRodrigues(inPlane, axis, COS_120, SIN_120)),
      vecNormalize(rotateRodrigues(inPlane, axis, COS_120, -SIN_120)),
    ];
  }
  // AX₂E₃ (linear): all three lone pairs equatorial, 120° apart around the
  // bond axis — which way round is arbitrary, as it is for the molecule
  if (missing === 3 && bonds.length === 2) {
    const axis = vecNormalize(vecSub(bonds[0], bonds[1]));
    const first = vecNormalize(findPerpendicular(axis));
    return [
      first,
      vecNormalize(rotateRodrigues(first, axis, COS_120, SIN_120)),
      vecNormalize(rotateRodrigues(first, axis, COS_120, -SIN_120)),
    ];
  }
  return [];
}

/**
 * Lone pairs of a six-domain centre: trans to the bond they replace in BrF₅
 * (AX₅E, square pyramid), trans to each other in XeF₄ (AX₄E₂, square plane).
 * `bonds` are unit vectors.
 */
function octahedralLonePairs(
  bonds: [number, number, number][],
  missing: number,
): [number, number, number][] {
  // AX₅E: the four basal bonds cancel and leave the apical one; opposite it
  if (missing === 1) {
    const sum: [number, number, number] = [0, 0, 0];
    for (const d of bonds) { sum[0] -= d[0]; sum[1] -= d[1]; sum[2] -= d[2]; }
    const lp = vecNormalize(sum);
    return lp[0] === 0 && lp[1] === 0 && lp[2] === 0 ? [] : [lp];
  }
  // AX₄E₂: both lone pairs on the normal of the bonds' plane, from any two
  // bonds that are not trans to each other
  if (missing === 2 && bonds.length === 4) {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const normal = vecNormalize(crossProduct(bonds[i], bonds[j]));
        if (normal[0] !== 0 || normal[1] !== 0 || normal[2] !== 0) {
          return [normal, [-normal[0], -normal[1], -normal[2]]];
        }
      }
    }
  }
  return [];
}
