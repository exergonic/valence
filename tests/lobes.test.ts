import { describe, expect, it } from 'vitest';
import { createLobeMesh, lonePairLobe, piLobe, sigmaLobe } from '../src/render/lobes';

// The teardrop keeps each kind's length and girth, never crosses the axis,
// keeps its point at the nucleus, and is convex all the way to a rounded tip
// (a concave stretch near the tip is the "nipple" a smoothed curve through the
// old hand-placed points produced).
describe('the hybrid lobe outline', () => {
  const kinds = [
    { name: 'σ', profile: sigmaLobe(), length: 1.0, radius: 0.25 },
    { name: 'π', profile: piLobe(), length: 1.1, radius: 0.35 },
    { name: 'lone pair', profile: lonePairLobe(), length: 1.2, radius: 0.4 },
  ];

  for (const { name, profile, length, radius } of kinds) {
    it(`keeps the ${name} lobe's length and girth, smoothly`, () => {
      const p = profile.points;
      expect(p.length).toBe(32);
      expect(p[0]).toEqual({ x: 0, y: 0 });
      expect(p[p.length - 1]).toEqual({ x: 0, y: length });
      for (const point of p) expect(point.x).toBeGreaterThanOrEqual(0);
      const widest = Math.max(...p.map((point) => point.x));
      expect(widest).toBeGreaterThan(radius * 0.98);
      expect(widest).toBeLessThan(radius * 1.05);
      // along the axis without doubling back
      for (let i = 1; i < p.length; i++) expect(p[i].y).toBeGreaterThan(p[i - 1].y);
      // rounded tip: the last step runs across the axis more than along it
      const last = p[p.length - 1], prev = p[p.length - 2];
      expect(prev.x - last.x).toBeGreaterThan(last.y - prev.y);
      // convex: the slope dr/dy only ever falls from base to tip
      const slopes = p.slice(1).map((q, i) => (q.x - p[i].x) / (q.y - p[i].y));
      for (let i = 1; i < slopes.length; i++) expect(slopes[i]).toBeLessThan(slopes[i - 1]);
    });
  }

  it('shares one geometry per kind and sizes each lobe by its scale', () => {
    const small = createLobeMesh(sigmaLobe(), 0xffffff, 0.6, 'glass', 0.9);
    const large = createLobeMesh(sigmaLobe(), 0xffffff, 0.6, 'glass', 1.4);
    expect(small.geometry).toBe(large.geometry);
    expect(small.geometry.userData.shared).toBe(true);
    expect(large.scale.x).toBeCloseTo(1.4);
  });
});
