import { beforeAll, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { renderPiSystems, detectPiSystems, piCloudSurface, tintPiSystemLobes } from '../src/render/pi-systems';
import { renderHybridOrbitals } from '../src/render/hybrid-orbitals';
import { parseMolBlock } from '../src/mol-parser';
import { localGeometry } from './helpers/local-geometry';
import { NAPHTHALENE as NAPHTHALENE_SKETCH } from './references/sketches';
import { assignOrbitals } from '../src/chem/vsepr/assign-orbitals';
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


describe('π system detection', () => {
  it('benzene forms a single 6-atom system', () => {
    const systems = detectPiSystems(BENZENE, assignOrbitals(BENZENE));
    expect(systems).toHaveLength(1);
    expect(systems[0].atomIndices).toHaveLength(6);
  });

  it('naphthalene forms a single 10-atom system including the fusion carbons', () => {
    const systems = detectPiSystems(NAPHTHALENE, assignOrbitals(NAPHTHALENE));
    expect(systems).toHaveLength(1);
    expect(systems[0].atomIndices).toHaveLength(10);
  });

});

// The highlight is a π cloud: for each system, the two sheets of the in-phase
// sum of its p orbitals, one either side of the σ framework (pi-systems.ts).
describe('the π cloud', () => {
  const vertices = (surface: ReturnType<typeof piCloudSurface>) =>
    Array.from({ length: surface.vertexCount }, (_, v) => ({
      x: surface.positions[3 * v], y: surface.positions[3 * v + 1], z: surface.positions[3 * v + 2],
      phase: surface.phases[v],
    }));

  it("draws benzene's cloud as two sheets, one each side of the ring, never crossing it", () => {
    const orbitals = assignOrbitals(BENZENE);
    const [system] = detectPiSystems(BENZENE, orbitals);
    const cloud = vertices(piCloudSurface(BENZENE, orbitals, system));
    expect(cloud.length).toBeGreaterThan(100);
    const sides = new Set(cloud.map((v) => Math.sign(v.z) * v.phase));
    expect(sides.size).toBe(1); // each sheet wholly on its own side
    expect(new Set(cloud.map((v) => v.phase)).size).toBe(2);
    expect(Math.min(...cloud.map((v) => Math.abs(v.z)))).toBeGreaterThan(0.15); // a gap at the σ plane
  });

  it("keeps benzene's hole: the textbook doughnut, not a disc", () => {
    const orbitals = assignOrbitals(BENZENE);
    const [system] = detectPiSystems(BENZENE, orbitals);
    const cloud = vertices(piCloudSurface(BENZENE, orbitals, system));
    expect(Math.min(...cloud.map((v) => Math.hypot(v.x, v.y)))).toBeGreaterThan(0.5);
  });

  let naphthalene: Molecule;
  beforeAll(async () => {
    naphthalene = (await localGeometry(parseMolBlock(NAPHTHALENE_SKETCH)))!.molecule;
  }, 120_000);

  it("spreads naphthalene's one cloud over the fusion bond", () => {
    const orbitals = assignOrbitals(naphthalene);
    const systems = detectPiSystems(naphthalene, orbitals);
    expect(systems).toHaveLength(1);
    const cloud = vertices(piCloudSurface(naphthalene, orbitals, systems[0]));
    // the fusion carbons are the sketch's atoms 4 and 9
    const [a, b] = [naphthalene.atoms[3], naphthalene.atoms[8]];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const d = systems[0].direction;
    // above (and below) the fusion bond's midpoint, along the π direction, there is cloud
    const near = cloud.filter((v) => {
      const r = [v.x - mid.x, v.y - mid.y, v.z - mid.z];
      const along = r[0] * d[0] + r[1] * d[1] + r[2] * d[2];
      const across = Math.hypot(r[0] - along * d[0], r[1] - along * d[1], r[2] - along * d[2]);
      return across < 0.3;
    });
    expect(new Set(near.map((v) => v.phase)).size).toBe(2);
  });

  it('gives two separate rings two clouds', () => {
    const twoRings = planarCarbonRings(12, [
      { atom1Index: 0, atom2Index: 1, order: 2 }, { atom1Index: 1, atom2Index: 2, order: 1 },
      { atom1Index: 2, atom2Index: 3, order: 2 }, { atom1Index: 3, atom2Index: 4, order: 1 },
      { atom1Index: 4, atom2Index: 5, order: 2 }, { atom1Index: 5, atom2Index: 0, order: 1 },
      { atom1Index: 6, atom2Index: 7, order: 2 }, { atom1Index: 7, atom2Index: 8, order: 1 },
      { atom1Index: 8, atom2Index: 9, order: 2 }, { atom1Index: 9, atom2Index: 10, order: 1 },
      { atom1Index: 10, atom2Index: 11, order: 2 }, { atom1Index: 11, atom2Index: 6, order: 1 },
    ]);
    const group = new THREE.Group();
    const systems = renderPiSystems(group, twoRings, assignOrbitals(twoRings));
    expect(systems).toHaveLength(2);
    // each cloud is drawn in two passes (the depth pre-pass, then the translucent face)
    expect(group.children).toHaveLength(2 * 2);
  });

  it("tints each system's member p lobes in its colour, translucent", () => {
    const orbitals = assignOrbitals(BENZENE);
    const lobes = new THREE.Group();
    renderHybridOrbitals(lobes, BENZENE, 'metallic', undefined, orbitals);
    const systems = renderPiSystems(new THREE.Group(), BENZENE, orbitals);
    tintPiSystemLobes(lobes, systems);
    // these fixture carbons carry no H, so each has a second p orbital, in the
    // ring plane and part of no π system: only the ring's own p lobes change
    const d = systems[0].direction;
    const pLobes = lobes.children.filter((c) => c.userData.lobeType === 'pi') as THREE.Mesh[];
    const inSystem = (lobe: THREE.Mesh) => {
      const p = lobe.userData.direction as number[];
      return Math.abs(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) > 0.9;
    };
    expect(pLobes.filter(inSystem)).toHaveLength(12);
    for (const lobe of pLobes) {
      const material = lobe.material as THREE.MeshPhongMaterial;
      if (inSystem(lobe)) {
        expect(material.color.getHex()).toBe(systems[0].color);
        expect(material.opacity).toBeLessThan(1);
      } else {
        expect(material.color.getHex()).not.toBe(systems[0].color);
      }
    }
  });
});
