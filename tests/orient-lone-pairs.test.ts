import { describe, it, expect } from 'vitest';
import { getLonePairDirections } from '../src/chem/vsepr/orient-lone-pairs';
import { OCTAHEDRAL_VECTORS, TRIG_BIPYRAMIDAL_VECTORS } from '../src/chem/vsepr/ideal-vsepr-vectors';
import { vecDot, vecNormalize } from '../src/utils/vec3';

const deg = (d: number) => (d * Math.PI) / 180;
const ang = (a: [number, number, number], b: [number, number, number]) =>
  Math.acos(Math.max(-1, Math.min(1, vecDot(vecNormalize(a), vecNormalize(b))))) * 180 / Math.PI;

describe('getLonePairDirections — three σ bonds, one lone pair (AX₃E)', () => {
  it('aziridine-like pyramid (62°, 110°, 110°): lone pair equidistant from all three bonds', () => {
    // Real aziridine bond angles: C–N–C = 62°, H–N–C = 110° each.
    // The ring C bonds cluster 62° apart; the old centroid method shoved
    // the lone pair to ~101° from the N–H bond.
    const u1: [number, number, number] = [Math.cos(deg(31)), Math.sin(deg(31)), 0];
    const u2: [number, number, number] = [Math.cos(deg(31)), -Math.sin(deg(31)), 0];
    const x = Math.cos(deg(110)) / Math.cos(deg(31));
    const u3: [number, number, number] = [x, 0, Math.sqrt(1 - x * x)];

    const lps = getLonePairDirections([u1, u2, u3], 4);
    expect(lps).toHaveLength(1);
    const v = lps[0];

    // Equal angles with all three σ bonds (the generalized C₃ axis)
    expect(Math.abs(vecDot(v, u1))).toBeCloseTo(Math.abs(vecDot(v, u2)), 9);
    expect(Math.abs(vecDot(v, u1))).toBeCloseTo(Math.abs(vecDot(v, u3)), 9);
    // ...at ~120° from each bond, not ~101° from the N–H
    expect(ang(v, u1)).toBeCloseTo(120.35, 1);
    expect(ang(v, u3)).toBeCloseTo(120.35, 1);
    // ...pointing away from the bond cluster
    const centroid: [number, number, number] = [
      u1[0] + u2[0] + u3[0], u1[1] + u2[1] + u3[1], u1[2] + u2[2] + u3[2],
    ];
    expect(vecDot(v, centroid)).toBeLessThan(0);
  });

  it('ammonia-like symmetric pyramid: lone pair stays on the C₃ axis', () => {
    // Three H directions symmetric about +z with 107° H–N–H angles.
    const c = Math.sqrt((Math.cos(deg(107)) + 0.5) / 1.5);
    const r = Math.sqrt(1 - c * c);
    const u1: [number, number, number] = [r, 0, c];
    const u2: [number, number, number] = [-r / 2, r * Math.sqrt(3) / 2, c];
    const u3: [number, number, number] = [-r / 2, -r * Math.sqrt(3) / 2, c];

    const lps = getLonePairDirections([u1, u2, u3], 4);
    expect(lps).toHaveLength(1);
    const v = lps[0];
    expect(v[0]).toBeCloseTo(0, 9);
    expect(v[1]).toBeCloseTo(0, 9);
    expect(v[2]).toBeCloseTo(-1, 9);
  });

  it('ideal tetrahedral: lone pair at the exact fourth vertex', () => {
    const u1 = vecNormalize([1, 1, 1]);
    const u2 = vecNormalize([1, -1, -1]);
    const u3 = vecNormalize([-1, 1, -1]);
    const lps = getLonePairDirections([u1, u2, u3], 4);
    expect(lps).toHaveLength(1);
    const v = lps[0];
    const expected = vecNormalize([-1, -1, 1]);
    expect(v[0]).toBeCloseTo(expected[0], 9);
    expect(v[1]).toBeCloseTo(expected[1], 9);
    expect(v[2]).toBeCloseTo(expected[2], 9);
  });

  it('collinear (degenerate) σ bonds fall back to the centroid method', () => {
    const lps = getLonePairDirections([[1, 0, 0], [-1, 0, 0], [-0.5, 0, 0]], 4);
    expect(lps).toHaveLength(1);
    const v = lps[0];
    expect(v[0]).toBeCloseTo(1, 9);
    expect(v[1]).toBeCloseTo(0, 9);
    expect(v[2]).toBeCloseTo(0, 9);
  });
});

describe('getLonePairDirections — two σ bonds (unchanged VSEPR behavior)', () => {
  it('water-like (104.5°): two equivalent lone pairs at ~109.5° from the bonds', () => {
    const u1: [number, number, number] = [Math.cos(deg(52.25)), Math.sin(deg(52.25)), 0];
    const u2: [number, number, number] = [Math.cos(deg(52.25)), -Math.sin(deg(52.25)), 0];

    const lps = getLonePairDirections([u1, u2], 4);
    expect(lps).toHaveLength(2);
    for (const v of lps) {
      expect(ang(v, u1)).toBeCloseTo(109.47, 1);
      expect(ang(v, u2)).toBeCloseTo(109.47, 1);
    }
    // symmetric straddle above/below the bond plane
    expect(lps[0][0]).toBeCloseTo(lps[1][0], 9);
    expect(lps[0][1]).toBeCloseTo(lps[1][1], 9);
    expect(lps[0][2]).toBeCloseTo(-lps[1][2], 9);
    // lone pair–lone pair ~114° (the water value)
    expect(ang(lps[0], lps[1])).toBeCloseTo(114.0, 1);
  });

  it('a wide AX₂E₂ angle opens the lone pairs instead of pinching them shut', () => {
    // Disiloxane's Si–O–Si is about 144°. Holding each lone pair at 109.47°
    // to each bond has no solution past 141° (the lobes were NaN) and had
    // already squeezed the pair to 59° apart at 135°. Past the tetrahedral
    // angle the pair opens with the bonds: lone pair–lone pair = bond angle.
    for (const bondAngle of [120, 135, 144, 160]) {
      const half = deg(bondAngle / 2);
      const u1: [number, number, number] = [Math.cos(half), Math.sin(half), 0];
      const u2: [number, number, number] = [Math.cos(half), -Math.sin(half), 0];
      const lps = getLonePairDirections([u1, u2], 4);
      expect(lps).toHaveLength(2);
      for (const v of lps) for (const c of v) expect(Number.isFinite(c)).toBe(true);
      expect(ang(lps[0], lps[1])).toBeCloseTo(bondAngle, 6);
      expect(ang(lps[0], u1)).toBeCloseTo(ang(lps[0], u2), 9); // still equivalent
    }
  });

  it('pyridine-like (120°, one lone pair): in-plane, opposite the bisector', () => {
    const u1: [number, number, number] = [Math.cos(deg(60)), Math.sin(deg(60)), 0];
    const u2: [number, number, number] = [Math.cos(deg(60)), -Math.sin(deg(60)), 0];

    const lps = getLonePairDirections([u1, u2], 3);
    expect(lps).toHaveLength(1);
    expect(lps[0][0]).toBeCloseTo(-1, 9);
    expect(lps[0][1]).toBeCloseTo(0, 9);
    expect(lps[0][2]).toBeCloseTo(0, 9);
  });
});

describe('getLonePairDirections — five and six domains', () => {
  // Bonds from the ideal polyhedra; the lone pairs belong on the vertices left
  // over — equatorial in the trigonal bipyramid, trans in the octahedron.
  const [axialUp, axialDown, eq1, eq2, eq3] = TRIG_BIPYRAMIDAL_VECTORS;
  const nearest = (found: [number, number, number][], want: [number, number, number]) =>
    Math.min(...found.map((v) => ang(v, want)));

  it('SF₄ (AX₄E): the lone pair takes the empty equatorial site', () => {
    const lps = getLonePairDirections([eq3, axialUp, eq1, axialDown], 5);
    expect(lps).toHaveLength(1);
    expect(ang(lps[0], eq2)).toBeLessThan(1e-6);
  });

  it('ClF₃ (AX₃E₂): both lone pairs equatorial, whatever order the bonds come in', () => {
    for (const bonds of [[axialUp, axialDown, eq1], [eq1, axialUp, axialDown]]) {
      const lps = getLonePairDirections(bonds, 5);
      expect(lps).toHaveLength(2);
      expect(nearest(lps, eq2)).toBeLessThan(1e-6);
      expect(nearest(lps, eq3)).toBeLessThan(1e-6);
    }
  });

  it('I₃⁻ (AX₂E₃): three lone pairs in the equatorial plane, 120° apart', () => {
    const lps = getLonePairDirections([axialUp, axialDown], 5);
    expect(lps).toHaveLength(3);
    for (const v of lps) expect(ang(v, axialUp)).toBeCloseTo(90, 9);
    expect(ang(lps[0], lps[1])).toBeCloseTo(120, 9);
    expect(ang(lps[1], lps[2])).toBeCloseTo(120, 9);
  });

  it('BrF₅ (AX₅E) and ICl₄⁻ (AX₄E₂): trans, whatever order the bonds come in', () => {
    const [px, mx, py, my, pz, mz] = OCTAHEDRAL_VECTORS;
    for (const bonds of [[px, mx, py, my, pz], [pz, px, py, mx, my]]) {
      const lps = getLonePairDirections(bonds, 6);
      expect(lps).toHaveLength(1);
      expect(ang(lps[0], mz)).toBeLessThan(1e-6);
    }
    for (const bonds of [[px, mx, py, my], [px, py, mx, my]]) {
      const lps = getLonePairDirections(bonds, 6);
      expect(lps).toHaveLength(2);
      expect(nearest(lps, pz)).toBeLessThan(1e-6);
      expect(nearest(lps, mz)).toBeLessThan(1e-6);
    }
  });
});

describe('getLonePairDirections — one σ bond (unchanged VSEPR behavior)', () => {
  it('O₂-like: two lone pairs at 120° in the σ plane, straddling the π normal', () => {
    const lps = getLonePairDirections([[1, 0, 0]], 3, [0, 0, 1]);
    expect(lps).toHaveLength(2);
    // rotate the σ bond ±120° about the π normal (z): lone pairs land in
    // the xy plane — the sp² plane containing the bond
    expect(lps[0][0]).toBeCloseTo(-0.5, 9);
    expect(lps[0][1]).toBeCloseTo(Math.sqrt(3) / 2, 9);
    expect(lps[0][2]).toBeCloseTo(0, 9);
    expect(lps[1][0]).toBeCloseTo(-0.5, 9);
    expect(lps[1][1]).toBeCloseTo(-Math.sqrt(3) / 2, 9);
    expect(lps[1][2]).toBeCloseTo(0, 9);
  });
});
