/**
 * How a molecule is first presented (view-orientation.ts): its longest extent
 * across the screen, its broad face toward the reader, the heavier end up
 * and to the right — with the pyramid and the spherical top handled apart.
 * Structures are the app's examples, and NH₃ as a user sketches it.
 */
import { describe, expect, it } from 'vitest';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { presentingFrame } from '../src/render/view-orientation';
import { localGeometry } from './helpers/local-geometry';
import type { Vec3 } from '../src/utils/vec3';

const example = (prefix: string): Molecule => parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(prefix))!.mol);
const at = (m: Molecule, i: number): Vec3 => [m.atoms[i].x, m.atoms[i].y, m.atoms[i].z];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const indexOf = (m: Molecule, element: string) => m.atoms.findIndex((a) => a.element === element);
const allIndices = (m: Molecule, element: string) => m.atoms.flatMap((a, i) => (a.element === element ? [i] : []));

/** The smallest distance between two atoms as projected on the screen, Å. */
function closestOnScreen(m: Molecule, frame: ReturnType<typeof presentingFrame>): number {
  const onScreen = m.atoms.map((_, i) => {
    const r = sub(at(m, i), frame.centre);
    return [dot(r, frame.right), dot(r, frame.up)];
  });
  let closest = Infinity;
  onScreen.forEach((p, i) => onScreen.forEach((q, j) => {
    if (j > i) closest = Math.min(closest, Math.hypot(p[0] - q[0], p[1] - q[1]));
  }));
  return closest;
}

describe('a molecule is presented broad face on, longest across', () => {
  it('water: the H–O–H face toward the reader, H···H across, O at the top', () => {
    const water = example('Water');
    const frame = presentingFrame(water.atoms);
    const o = indexOf(water, 'O');
    const [h1, h2] = allIndices(water, 'H');
    const normal = unit(cross(sub(at(water, h1), at(water, o)), sub(at(water, h2), at(water, o))));
    expect(Math.abs(dot(frame.toward, normal))).toBeCloseTo(1, 6);
    expect(Math.abs(dot(frame.right, unit(sub(at(water, h2), at(water, h1)))))).toBeCloseTo(1, 6);
    expect(dot(sub(at(water, o), frame.centre), frame.up)).toBeGreaterThan(0);
  });

  it('benzene: the ring face toward the reader', () => {
    const benzene = example('Benzene');
    const frame = presentingFrame(benzene.atoms);
    const [c1, c2, c3] = allIndices(benzene, 'C');
    const normal = unit(cross(sub(at(benzene, c2), at(benzene, c1)), sub(at(benzene, c3), at(benzene, c1))));
    expect(Math.abs(dot(frame.toward, normal))).toBeCloseTo(1, 4);
  });

  it('N₂: along the screen', () => {
    const n2 = example('Nitrogen');
    const frame = presentingFrame(n2.atoms);
    expect(Math.abs(dot(frame.right, unit(sub(at(n2, 1), at(n2, 0)))))).toBeCloseTo(1, 6);
  });

  it('methane, a spherical top: one C–H bond up (seen from a little above), and no atom hidden behind another', () => {
    const methane = example('Methane');
    const frame = presentingFrame(methane.atoms);
    const c = indexOf(methane, 'C');
    const along = allIndices(methane, 'H').map((h) => dot(unit(sub(at(methane, h), at(methane, c))), frame.up));
    expect(Math.max(...along)).toBeGreaterThan(Math.cos((25.5 * Math.PI) / 180));
    expect(closestOnScreen(methane, frame)).toBeGreaterThan(0.6);
  });

  it('SF₆, a spherical top: no fluorine hidden behind the sulfur or another fluorine', () => {
    const sf6 = example('Sulfur hexafluoride');
    expect(closestOnScreen(sf6, presentingFrame(sf6.atoms))).toBeGreaterThan(0.6);
  });

  it('PCl₅, a prolate top: the axial bonds across, and no chlorine hidden', () => {
    const pcl5 = example('Phosphorus pentachloride');
    const frame = presentingFrame(pcl5.atoms);
    const p = indexOf(pcl5, 'P');
    const axial = allIndices(pcl5, 'Cl').map((cl) => sub(at(pcl5, cl), at(pcl5, p)))
      .sort((a, b) => Math.hypot(...b) - Math.hypot(...a))[0];
    // across the screen: turned 25° about the vertical, so it stays horizontal
    expect(Math.abs(dot(unit(axial), frame.up))).toBeLessThan(1e-6);
    expect(Math.abs(dot(unit(axial), frame.right))).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 3);
    expect(closestOnScreen(pcl5, frame)).toBeGreaterThan(0.6);
  });

  it('NH₃, a pyramid: stood on its axis with N at the top, not seen end on', async () => {
    const sketch: Molecule = { atoms: [{ element: 'N', x: 0, y: 0, z: 0 }], bonds: [] };
    const ammonia = (await localGeometry(sketch))!.molecule;
    const frame = presentingFrame(ammonia.atoms);
    const n = indexOf(ammonia, 'N');
    const hs = allIndices(ammonia, 'H');
    const hCentre: Vec3 = [0, 1, 2].map((k) => hs.reduce((s, h) => s + at(ammonia, h)[k], 0) / hs.length) as Vec3;
    const c3 = unit(sub(at(ammonia, n), hCentre));
    // stood on its axis, then seen from 25° above
    expect(dot(frame.up, c3)).toBeCloseTo(Math.cos((25 * Math.PI) / 180), 3);
    expect(closestOnScreen(ammonia, frame)).toBeGreaterThan(0.6);
  });

  it('the frame is right-handed: right × up = toward', () => {
    const frame = presentingFrame(example('Pyridine').atoms);
    const handed = cross(frame.right, frame.up);
    expect(dot(handed, frame.toward)).toBeCloseTo(1, 9);
  });
});
