// A drawn wedge or hash fixes which enantiomer a sketch means. The graph-walk
// embedder knew nothing about it, so a drawn (S)-2-bromobutane came out
// identical to the (R) drawing — both (R).
//
// The reference here is PubChem's own 3D conformer of the *same* stereoisomer
// (2D SDF with the wedge, 3D SDF of the same CID), not a hand-drawn ideal: our
// pipeline must land on the configuration PubChem publishes for that drawing.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { fillMissingHydrogens } from '../src/chem/fill-hydrogens';
import { place3D } from '../src/geometry/place3d';
import { localGeometry } from './helpers/local-geometry';

// The pipeline tests below run the real GFN2 optimisation (24 and 36 atoms).
vi.setConfig({ testTimeout: 120_000 });
import { chiralitySign, applyWedgeStereo } from '../src/geometry/stereo-wedge';
import { vecSub, vecDot, vecNormalize } from '../src/utils/vec3';

type Vec3 = [number, number, number];

const fixture = (name: string) => readFileSync(new URL(`./references/stereo/${name}`, import.meta.url), 'utf8');

/** The stereocenter, the wedged atom, and the first two plain neighbors in
 *  index order — the same choice applyWedgeStereo makes. */
function stereoParts(molecule: Molecule) {
  const bond = molecule.bonds.find((b) => b.stereo);
  expect(bond, 'fixture carries a wedge or hash bond').toBeTruthy();
  const center = bond!.atom1Index;
  const wedged = bond!.atom2Index;
  const plain = molecule.bonds
    .filter((b) => b.atom1Index === center || b.atom2Index === center)
    .map((b) => (b.atom1Index === center ? b.atom2Index : b.atom1Index))
    .filter((i) => i !== wedged)
    .sort((a, b) => a - b);
  return { center, wedged, n1: plain[0], n2: plain[1] };
}

const positions = (molecule: Molecule): Vec3[] => molecule.atoms.map((a) => [a.x, a.y, a.z]);

/** Drop explicit hydrogens and renumber — what a sketcher hands us: a heavy-atom
 *  skeleton whose hydrogens fillMissingHydrogens adds back. */
function heavyAtomsOnly(molecule: Molecule): Molecule {
  const remap = new Map<number, number>();
  const atoms: Molecule['atoms'] = [];
  molecule.atoms.forEach((atom, i) => {
    if (atom.element === 'H') return;
    remap.set(i, atoms.length);
    atoms.push(atom);
  });
  const bonds = molecule.bonds
    .filter((b) => remap.has(b.atom1Index) && remap.has(b.atom2Index))
    .map((b) => ({ ...b, atom1Index: remap.get(b.atom1Index)!, atom2Index: remap.get(b.atom2Index)! }));
  return { atoms, bonds };
}

const CASES = [
  ['(R)-2-bromobutane', 'pc-R-2bromobutane.sdf', 'pc-R-2bromobutane-3d.sdf'],
  ['(S)-2-bromobutane', 'pc-S-2bromobutane.sdf', 'pc-S-2bromobutane-3d.sdf'],
  ['L-alanine', 'pc-L-alanine.sdf', 'pc-L-alanine-3d.sdf'],
] as const;

describe('wedge and hash bonds', () => {
  it('parses the V2000 bond stereo flag, and only for real wedges', () => {
    expect(parseMolBlock(fixture('pc-R-2bromobutane.sdf')).bonds.filter((b) => b.stereo).map((b) => b.stereo)).toEqual([1]);
    expect(parseMolBlock(fixture('pc-S-2bromobutane.sdf')).bonds.filter((b) => b.stereo).map((b) => b.stereo)).toEqual([6]);
    // Plain bonds and the aromatic/either flag (4) carry no absolute
    // configuration, so nothing is recorded for them.
    const plain = parseMolBlock(`  2  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  2  1  4  0  0  0
M  END
`);
    expect(plain.bonds.map((b) => b.stereo)).toEqual([undefined, undefined]);
  });

  it('keeps the two drawings apart — the regression', () => {
    const r = stereoParts(parseMolBlock(fixture('pc-R-2bromobutane.sdf')));
    const s = stereoParts(parseMolBlock(fixture('pc-S-2bromobutane.sdf')));
    const rPos = place3D(fillMissingHydrogens(parseMolBlock(fixture('pc-R-2bromobutane.sdf'))));
    const sPos = place3D(fillMissingHydrogens(parseMolBlock(fixture('pc-S-2bromobutane.sdf'))));
    expect(chiralitySign(rPos, r.center, r.n1, r.n2, r.wedged))
      .toBe(-chiralitySign(sPos, s.center, s.n1, s.n2, s.wedged));
  });

  for (const [tag, twoD, threeD] of CASES) {
    it(`embeds ${tag} with the configuration PubChem gives that stereoisomer`, () => {
      const sketch = parseMolBlock(fixture(twoD));
      const reference = parseMolBlock(fixture(threeD));
      // The two files are the same compound from the same service, so atom i
      // means the same atom in both.
      expect(reference.atoms.map((a) => a.element)).toEqual(sketch.atoms.map((a) => a.element));

      const { center, wedged, n1, n2 } = stereoParts(sketch);
      const expected = chiralitySign(positions(reference), center, n1, n2, wedged);
      expect(chiralitySign(place3D(fillMissingHydrogens(sketch)), center, n1, n2, wedged)).toBe(expected);
    });

    it(`embeds ${tag} correctly from a heavy-atom sketch (implicit hydrogens)`, () => {
      const sketch = heavyAtomsOnly(parseMolBlock(fixture(twoD)));
      const reference = parseMolBlock(fixture(threeD));
      const { center, wedged, n1, n2 } = stereoParts(sketch);
      // Dropping the hydrogens keeps the heavy atoms' indices, so the reference
      // positions still line up.
      const expected = chiralitySign(positions(reference), center, n1, n2, wedged);
      expect(chiralitySign(place3D(fillMissingHydrogens(sketch)), center, n1, n2, wedged)).toBe(expected);
    });
  }
});

// ---- A drawn ring: six wedges, six centers, one cycle ----------------------
// The user's own file, kept verbatim. Every hydroxyl is drawn as a wedge, so
// every center is the same face — and the first version of the inversion tore
// this ring apart, because "the branch on the other side" of a ring center is
// reachable the long way round and is therefore the entire rest of the ring.
const ALL_CIS_HEXOL_MOL = `JME 2024-04-29 Wed Sep 23 22:35:39 GMT-400 2026

 12 12  0  0  0  0  0  0  0  0999 V2000
    3.6373    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.6373    3.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    4.2000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    3.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.8497    4.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    4.8497    1.4000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.4000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    4.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    5.6000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  5  1  0  0  0  0
  5  6  1  0  0  0  0
  6  1  1  0  0  0  0
  2  7  1  1  0  0  0
  1  8  1  1  0  0  0
  6  9  1  1  0  0  0
  5 10  1  1  0  0  0
  4 11  1  1  0  0  0
  3 12  1  1  0  0  0
M  END
`;

/** Every wedge bond's center must carry the configuration the drawing asks for.
 *  Returns the failures so a broken case reads as a diff, not a bare false. */
function stereoViolations(molecule: Molecule, pos: Vec3[]): string[] {
  const at = (i: number) => molecule.atoms[i];
  const failures: string[] = [];
  for (const bond of molecule.bonds) {
    if (!bond.stereo) continue;
    const center = bond.atom1Index;
    const wedged = bond.atom2Index;
    const plain = molecule.bonds
      .filter((b) => b.atom1Index === center || b.atom2Index === center)
      .map((b) => (b.atom1Index === center ? b.atom2Index : b.atom1Index))
      .filter((i) => i !== wedged)
      .sort((a, b) => a - b);
    const cross2d = (i: number, j: number) =>
      (at(i).x - at(center).x) * (at(j).y - at(center).y) - (at(i).y - at(center).y) * (at(j).x - at(center).x);
    let n1 = -1;
    let n2 = -1;
    outer: for (let i = 0; i < plain.length; i++) {
      for (let j = i + 1; j < plain.length; j++) {
        if (cross2d(plain[i], plain[j]) !== 0) {
          n1 = plain[i];
          n2 = plain[j];
          break outer;
        }
      }
    }
    if (n1 < 0) {
      failures.push(`C${center + 1}: no page-plane reference`);
      continue;
    }
    const reference = Math.sign(cross2d(n1, n2));
    const required = bond.stereo === 1 ? reference : -reference;
    const actual = chiralitySign(pos, center, n1, n2, wedged);
    if (actual !== required) failures.push(`C${center + 1}: required ${required}, got ${actual}`);
  }
  return failures;
}

/** Which face of the ring each carbon's oxygen is on, judged LOCALLY: the side
 *  of that carbon's own C₋₁–C–C₊₁ plane, the normal taken in one sense of
 *  travel around the ring. All the same sign means all-cis. (The height above
 *  the ring's MEAN plane only reads cis in an ideal chair: in a twisted ring an
 *  equatorial cis substituent can sit below it — measured on GFN2's hexol,
 *  +1.44 −0.40 +1.50 … for an all-cis ring with every wedge honoured.) */
function ohFaces(molecule: Molecule, pos: Vec3[]): number[] {
  const ring = [0, 1, 2, 3, 4, 5];
  return ring.map((c, k) => {
    const next = vecSub(pos[ring[(k + 1) % 6]], pos[c]);
    const prev = vecSub(pos[ring[(k + 5) % 6]], pos[c]);
    const normal = vecNormalize([
      next[1] * prev[2] - next[2] * prev[1],
      next[2] * prev[0] - next[0] * prev[2],
      next[0] * prev[1] - next[1] * prev[0],
    ]);
    const oxygen = molecule.bonds
      .map((b) => (b.atom1Index === c ? b.atom2Index : b.atom2Index === c ? b.atom1Index : -1))
      .find((i) => i >= 0 && molecule.atoms[i].element === 'O');
    return oxygen === undefined ? Number.NaN : vecDot(vecSub(pos[oxygen], pos[c]), normal);
  });
}

describe('a drawn ring (the all-cis hexol)', () => {
  it('places every hydroxyl on the face its wedge asks for', async () => {
    const sketch = parseMolBlock(ALL_CIS_HEXOL_MOL);
    const result = await localGeometry(fillMissingHydrogens(sketch));
    expect(result, 'the local pipeline produced a geometry').toBeTruthy();
    const pos = positions(result!.molecule);
    expect(stereoViolations(sketch, pos)).toEqual([]);
    const faces = ohFaces(result!.molecule, pos);
    expect(
      faces.every((f) => f > 0) || faces.every((f) => f < 0),
      `hydroxyl faces: ${faces.map((f) => f.toFixed(2)).join(' ')}`,
    ).toBe(true);
  });

  it('keeps the ring closed while inverting a center', async () => {
    const sketch = parseMolBlock(ALL_CIS_HEXOL_MOL);
    const result = await localGeometry(fillMissingHydrogens(sketch));
    const refined = result!.molecule;
    const pos = positions(refined);
    // The branch-swap version left C-C bonds of 5.06 Å here.
    for (const bond of refined!.bonds) {
      if (bond.atom1Index >= 6 || bond.atom2Index >= 6) continue;
      const distance = Math.hypot(...vecSub(pos[bond.atom1Index], pos[bond.atom2Index]));
      expect(distance, `ring bond ${bond.atom1Index + 1}-${bond.atom2Index + 1}`).toBeGreaterThan(1.4);
      expect(distance, `ring bond ${bond.atom1Index + 1}-${bond.atom2Index + 1}`).toBeLessThan(1.7);
    }
  });

  it('honors an alternating pattern too — the control', async () => {
    // The same ring with 1,3,5 up and 2,4,6 down (scyllo-inositol's
    // stereochemistry). A fix that forced every center onto one face — or that
    // mis-read a hash as a wedge — fails here.
    const sketch = parseMolBlock(ALL_CIS_HEXOL_MOL);
    const alternating: Molecule = {
      atoms: sketch.atoms,
      bonds: sketch.bonds.map((b) => (b.stereo && b.atom1Index % 2 === 1 ? { ...b, stereo: 6 as const } : b)),
    };
    const result = await localGeometry(fillMissingHydrogens(alternating));
    expect(result, 'the local pipeline produced a geometry').toBeTruthy();
    const pos = positions(result!.molecule);
    expect(stereoViolations(alternating, pos)).toEqual([]);
    const faces = ohFaces(result!.molecule, pos);
    for (let i = 0; i < 6; i++) {
      expect(
        Math.sign(faces[i]),
        `faces: ${faces.map((f) => f.toFixed(2)).join(' ')}`,
      ).toBe(-Math.sign(faces[(i + 1) % 6]));
    }
  });

  it('keeps every ring substituent in its own slot — the all-cis hexamethyl', async () => {
    // The same ring with methyls instead of hydroxyls, drawn the same way. This
    // one caught the inversion turning the wedged branch onto its mirror
    // direction: the mirror is chosen from geometry alone, with no idea that
    // something is already sitting there, and C1's ring hydrogen and its methyl
    // came back 6° apart — 0.46 Å — sharing one axial slot.
    const sketch = parseMolBlock(ALL_CIS_HEXAMETHYL_MOL);
    const result = await localGeometry(fillMissingHydrogens(sketch));
    expect(result, 'the local pipeline produced a geometry').toBeTruthy();
    const refined = result!.molecule;
    const pos = positions(refined);
    expect(stereoViolations(sketch, pos)).toEqual([]);
    for (const c of [0, 1, 2, 3, 4, 5]) {
      const nbrs = refined!.bonds
        .filter((b) => b.atom1Index === c || b.atom2Index === c)
        .map((b) => (b.atom1Index === c ? b.atom2Index : b.atom1Index));
      const h = nbrs.find((i) => refined!.atoms[i].element === 'H')!;
      const methyl = nbrs.find((i) => refined!.atoms[i].element === 'C' && i >= 6)!;
      const vh = vecNormalize(vecSub(pos[h], pos[c]));
      const vm = vecNormalize(vecSub(pos[methyl], pos[c]));
      const angle = (Math.acos(Math.max(-1, Math.min(1, vecDot(vh, vm)))) * 180) / Math.PI;
      expect(angle, `C${c + 1}: H and CH3 only ${angle.toFixed(1)}° apart`).toBeGreaterThan(60);
      expect(
        Math.hypot(...vecSub(pos[h], pos[methyl])),
        `C${c + 1}: H and CH3 overlap`,
      ).toBeGreaterThan(1.5);
    }
  });
});

// ---- Post-swap re-verification (2026-09-27) ------------------------------
// The invert swap flips the chirality sign exactly only while the two
// swapped ligands sit on opposite sides of the (n1, n2) plane. A badly
// distorted center can pass the rotation and come back the wrong way; the
// move must be undone and reported, never silently left.
describe('post-swap re-verification', () => {
  // A tetrahedral center whose 3D positions are deliberately distorted: the
  // swap partner (the H) sits on the SAME side of the (n1, n2) plane as the
  // wedged atom, so exchanging their directions cannot flip the sign. The 2D
  // drawing asks for the opposite configuration, so applyWedgeStereo must
  // attempt the swap, fail the re-check, and undo everything.
  //
  // 2D layout (the page-plane reference): center at the origin, two plain
  // carbons at (-1, 1) and (1, 1) — cross2d negative — so a wedge (flag 1)
  // requires sign −1. The two dangling carbons keep atoms 1 and 2
  // non-terminal so the H is the swap partner.
  const distorted = (): Molecule => ({
    atoms: [
      { element: 'C', x: 0, y: 0, z: 0 },
      { element: 'C', x: -1, y: 1, z: 0 },
      { element: 'C', x: 1, y: 1, z: 0 },
      { element: 'H', x: 0, y: -1, z: 0 },
      { element: 'Br', x: 0.6, y: 1.04, z: 0 },
      { element: 'C', x: -2, y: 1, z: 0 },
      { element: 'C', x: 2, y: 1, z: 0 },
    ],
    bonds: [
      { atom1Index: 0, atom2Index: 1, order: 1 },
      { atom1Index: 0, atom2Index: 2, order: 1 },
      { atom1Index: 0, atom2Index: 3, order: 1 },
      { atom1Index: 0, atom2Index: 4, order: 1, stereo: 1 },
      { atom1Index: 1, atom2Index: 5, order: 1 },
      { atom1Index: 2, atom2Index: 6, order: 1 },
    ],
  });

  it('undoes a swap whose sign re-check fails, and reports the center', () => {
    const mol = distorted();
    // 3D: n1 = (1,0,0), n2 = (0,1,0), so the (n1, n2) plane is z = 0; both
    // the wedged Br and the H sit above it — no exchange of directions can
    // move the wedged atom across the plane.
    const pos: Vec3[] = [
      [0, 0, 0], // center
      [1, 0, 0], // n1
      [0, 1, 0], // n2
      [0.2, 0.1, 1.5], // H — same side as the wedged atom
      [0.8, 0.2, 1], // wedged Br
      [2, 0, -1], // C1's substituent (never touched)
      [-1, 2, -1], // C2's substituent (never touched)
    ];
    const before = pos.map((p) => [...p] as Vec3);
    const warnings = applyWedgeStereo(mol, pos);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('C1');
    expect(pos).toEqual(before);
  });

  it('keeps a swap that passes the re-check, with no warning', () => {
    const mol = distorted();
    // Partner below the plane this time: the exchange moves the wedged atom
    // across it, the sign flips exactly, and the move stands.
    const pos: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0.2, 0.1, -1.5], // H — the other side
      [0.8, 0.2, 1], // wedged Br
      [2, 0, -1],
      [-1, 2, -1],
    ];
    const warnings = applyWedgeStereo(mol, pos);
    expect(warnings).toEqual([]);
    // The wedge (flag 1) with this 2D reference requires sign −1.
    expect(chiralitySign(pos, 0, 1, 2, 4)).toBe(-1);
  });
});

// All-cis hexamethylcyclohexane, as drawn in the sketcher: the same hexagon
// with six methyls, all wedged.
const ALL_CIS_HEXAMETHYL_MOL = `JME 2024-04-29 Wed Sep 23 23:10:27 GMT-400 2026

 12 12  0  0  0  0  0  0  0  0999 V2000
    3.6373    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.6373    3.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    4.2000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    3.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2124    2.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    5.6000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.8497    4.2000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    4.8497    1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4249    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    4.2000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  3  4  1  0  0  0  0
  4  5  1  0  0  0  0
  5  6  1  0  0  0  0
  6  1  1  0  0  0  0
  3  7  1  1  0  0  0
  2  8  1  1  0  0  0
  1  9  1  1  0  0  0
  6 10  1  1  0  0  0
  5 11  1  1  0  0  0
  4 12  1  1  0  0  0
M  END
`;
