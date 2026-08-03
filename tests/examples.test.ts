import { describe, it, expect } from 'vitest';
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { vecNormalize, vecDot, crossProduct, findPerpendicular } from '../src/utils/vec3';
import { classifyMolecule } from '../src/chem/classify';

interface AtomExpectation {
  element: string;
  hybridization: string;
  lonePairs: number;
  hasPi: boolean;
}

interface ExampleExpectations {
  name: string;
  atoms: AtomExpectation[];
}

const EXPECTATIONS: ExampleExpectations[] = [
  {
    name: 'Methane (CH₄)',
    atoms: [
      { element: 'C', hybridization: 'sp³', lonePairs: 0, hasPi: false },
    ],
  },
  {
    name: 'Ethene (C₂H₄)',
    atoms: [
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Ethyne (C₂H₂)',
    atoms: [
      { element: 'C', hybridization: 'sp', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Benzene (C₆H₆)',
    atoms: [
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Pyridine (C₅H₅N)',
    atoms: [
      { element: 'N', hybridization: 'sp²', lonePairs: 1, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Pyrrole (C₄H₅N)',
    atoms: [
      { element: 'N', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Imidazole (C₃H₄N₂)',
    atoms: [
      { element: 'N', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'N', hybridization: 'sp²', lonePairs: 1, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'Nitrogen (N₂)',
    atoms: [
      { element: 'N', hybridization: 'sp', lonePairs: 1, hasPi: true },
      { element: 'N', hybridization: 'sp', lonePairs: 1, hasPi: true },
    ],
  },
  {
    name: 'Oxygen (O₂)',
    atoms: [
      { element: 'O', hybridization: 'sp²', lonePairs: 2, hasPi: true },
      { element: 'O', hybridization: 'sp²', lonePairs: 2, hasPi: true },
    ],
  },
  {
    name: 'Water (H₂O)',
    atoms: [
      { element: 'O', hybridization: 'sp³', lonePairs: 2, hasPi: false },
    ],
  },
  {
    name: 'Phenol (C₆H₅OH)',
    atoms: [
      { element: 'O', hybridization: 'sp²', lonePairs: 1, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
    ],
  },
  {
    name: 'But-1-en-3-yne (H₂C=CH-C≡CH)',
    atoms: [
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp²', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp', lonePairs: 0, hasPi: true },
      { element: 'C', hybridization: 'sp', lonePairs: 0, hasPi: true },
    ],
  },
];

function getPlaneNormal(atoms: Array<{ x: number; y: number; z: number }>): [number, number, number] {
  if (atoms.length < 3) return [0, 0, 0];
  const a = atoms[0], b = atoms[1], c = atoms[2];
  const v1: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z];
  const v2: [number, number, number] = [c.x - a.x, c.y - a.y, c.z - a.z];
  const nrm = vecNormalize(crossProduct(v1, v2));
  if (nrm[0] === 0 && nrm[1] === 0 && nrm[2] === 0) {
    for (let i = 2; i < atoms.length; i++) {
      const v: [number, number, number] = [atoms[i].x - a.x, atoms[i].y - a.y, atoms[i].z - a.z];
      const n = vecNormalize(crossProduct(v1, v));
      if (n[0] !== 0 || n[1] !== 0 || n[2] !== 0) return n;
    }
  }
  return nrm;
}

describe('Example orbital classifications', () => {
  for (const ex of EXPECTATIONS) {
    it(ex.name, () => {
      const example = EXAMPLES.find((e) => e.name === ex.name);
      if (!example) { expect.fail(`Example not found: ${ex.name}`); return; }

      const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');

      for (let i = 0; i < ex.atoms.length; i++) {
        const expected = ex.atoms[i];
        const actual = result[i];
        if (!actual) { expect.fail(`Atom ${i} not found in result`); return; }

        expect(actual.element).toBe(expected.element);
        expect(actual.hybridization).toBe(expected.hybridization);
        expect(actual.lonePairs).toBe(expected.lonePairs);
        expect(actual.hasPi).toBe(expected.hasPi);
      }
    });
  }
});

describe('p-AO directionality', () => {
  function expectParallel(a: [number, number, number], b: [number, number, number], tolerance = 1e-6): void {
    const dot = Math.abs(vecDot(a, b));
    expect(dot).toBeGreaterThan(1 - tolerance);
  }

  function expectPerpendicular(a: [number, number, number], b: [number, number, number], tolerance = 1e-6): void {
    const dot = Math.abs(vecDot(a, b));
    expect(dot).toBeLessThan(tolerance);
  }

  const RING_EXAMPLES = ['Benzene (C₆H₆)', 'Pyridine (C₅H₅N)', 'Pyrrole (C₄H₅N)', 'Imidazole (C₃H₄N₂)', 'Phenol (C₆H₅OH)'];

  for (const name of RING_EXAMPLES) {
    it(`${name} — all π orbitals parallel to ring normal`, () => {
      const example = EXAMPLES.find((e) => e.name === name);
      if (!example) { expect.fail(`Example not found: ${name}`); return; }

      const molecule = parseMolBlock(example.mol);
      const piIndices: number[] = [];
      for (let i = 0; i < molecule.atoms.length; i++) {
        if (molecule.atoms[i].element !== 'H') piIndices.push(i);
      }
      const piAtomPositions = piIndices.map((i) => molecule.atoms[i]);
      const ringNormal = getPlaneNormal(piAtomPositions);
      if (ringNormal[0] === 0 && ringNormal[1] === 0 && ringNormal[2] === 0) {
        expect.fail('Could not compute ring normal');
        return;
      }

      const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
      for (let i = 0; i < result.length; i++) {
        const atom = result[i];
        if (!atom.hasPi) continue;
        expect(atom.piDirection, `Atom ${i} (${atom.element}) should have a π direction`).not.toBeNull();
        expectParallel(atom.piDirection!, ringNormal, 1e-4);
      }
    });
  }

  it('Ethene (C₂H₄) — both π orbitals parallel to each other', () => {
    const example = EXAMPLES.find((e) => e.name === 'Ethene (C₂H₄)');
    if (!example) { expect.fail('Example not found'); return; }

    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element === 'C');
    expect(result).toHaveLength(2);
    expect(result[0].hasPi).toBe(true);
    expect(result[1].hasPi).toBe(true);
    expect(result[0].piDirection).not.toBeNull();
    expect(result[1].piDirection).not.toBeNull();
    expectParallel(result[0].piDirection!, result[1].piDirection!, 1e-4);
  });

  it('Ethyne (C₂H₂) — π directions perpendicular to C≡C axis', () => {
    const example = EXAMPLES.find((e) => e.name === 'Ethyne (C₂H₂)');
    if (!example) { expect.fail('Example not found'); return; }

    const molecule = parseMolBlock(example.mol);
    const cAtoms = molecule.atoms.filter((a) => a.element === 'C');
    expect(cAtoms).toHaveLength(2);
    const bondAxis = vecNormalize([cAtoms[1].x - cAtoms[0].x, cAtoms[1].y - cAtoms[0].y, cAtoms[1].z - cAtoms[0].z]);

    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element === 'C');
    for (let i = 0; i < result.length; i++) {
      expect(result[i].hasPi).toBe(true);
      // sp atoms in a triple bond now inherit a deterministic piDirection
      // from their partner so both sets of p orbitals align
      expect(result[i].piDirection).not.toBeNull();
      expectPerpendicular(result[i].piDirection!, bondAxis, 1e-4);
    }
  });

  it('Nitrogen (N₂) — π directions perpendicular to N≡N axis', () => {
    const example = EXAMPLES.find((e) => e.name === 'Nitrogen (N₂)');
    if (!example) { expect.fail('Example not found'); return; }

    const molecule = parseMolBlock(example.mol);
    const nAtoms = molecule.atoms.filter((a) => a.element === 'N');
    const bondAxis = vecNormalize([nAtoms[1].x - nAtoms[0].x, nAtoms[1].y - nAtoms[0].y, nAtoms[1].z - nAtoms[0].z]);

    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
    for (let i = 0; i < result.length; i++) {
      expect(result[i].hasPi).toBe(true);
      expect(result[i].piDirection).not.toBeNull();
      expectPerpendicular(result[i].piDirection!, bondAxis, 1e-4);
    }
  });

  it('Oxygen (O₂) — π direction perpendicular to O=O axis', () => {
    const example = EXAMPLES.find((e) => e.name === 'Oxygen (O₂)');
    if (!example) { expect.fail('Example not found'); return; }

    const molecule = parseMolBlock(example.mol);
    const oAtoms = molecule.atoms.filter((a) => a.element === 'O');
    const bondAxis = vecNormalize([oAtoms[1].x - oAtoms[0].x, oAtoms[1].y - oAtoms[0].y, oAtoms[1].z - oAtoms[0].z]);

    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
    for (let i = 0; i < result.length; i++) {
      expect(result[i].hasPi).toBe(true);
      expect(result[i].piDirection).not.toBeNull();
      expectPerpendicular(result[i].piDirection!, bondAxis, 1e-4);
    }
  });

  it('But-1-en-3-yne (H₂C=CH-C≡CH) — sp π direction parallel to adjacent sp² π', () => {
    const example = EXAMPLES.find((e) => e.name === 'But-1-en-3-yne (H₂C=CH-C≡CH)');
    if (!example) { expect.fail('Example not found'); return; }

    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
    // C1: sp² (CH₂), C2: sp² (CH), C3: sp (middle alkyne), C4: sp (terminal alkyne)
    expect(result).toHaveLength(4);

    // C1 and C2 (sp²) have piDirection from cross product of their σ bonds → z-axis
    expect(result[0].piDirection).not.toBeNull();
    expect(result[1].piDirection).not.toBeNull();
    expectParallel(result[0].piDirection!, result[1].piDirection!, 1e-4);

    // C3 (sp, middle alkyne) aligns one p orbital parallel to C2's π direction
    expect(result[2].piDirection).not.toBeNull();
    expectParallel(result[2].piDirection!, result[1].piDirection!, 1e-4);

    // C4 (sp, terminal alkyne) inherits piDirection from C3 (triple-bond partner)
    // so both sets of p orbitals align for proper π overlap
    expect(result[3].piDirection).not.toBeNull();
    expectParallel(result[3].piDirection!, result[2].piDirection!, 1e-4);
  });

  it('Methane (CH₄) — no π direction', () => {
    const example = EXAMPLES.find((e) => e.name === 'Methane (CH₄)');
    if (!example) { expect.fail('Example not found'); return; }
    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
    expect(result[0].hasPi).toBe(false);
    expect(result[0].piDirection).toBeNull();
  });

  it('Water (H₂O) — no π direction', () => {
    const example = EXAMPLES.find((e) => e.name === 'Water (H₂O)');
    if (!example) { expect.fail('Example not found'); return; }
    const result = classifyMolecule(parseMolBlock(example.mol)).filter((a) => a.element !== 'H');
    expect(result[0].hasPi).toBe(false);
    expect(result[0].piDirection).toBeNull();
  });
});

describe('Lone-pair promotion geometry gate', () => {
  // Real PubChem MMFF94 heavy-atom geometry of thioanisole: the C–S–C
  // plane is twisted ~60° from the ring plane (methyl sticks out of it),
  // so a p orbital parallel to the ring p's would not be perpendicular to
  // the sulfur's own σ plane.
  const TWISTED_THIOANISOLE: Molecule = {
    atoms: [
      { element: 'S', x: 2.2144, y: -0.5267, z: -0.5730 },
      { element: 'C', x: 0.4849, y: -0.2243, z: -0.2671 }, // ipso
      { element: 'C', x: -0.0151, y: 1.0769, z: -0.3173 }, // ortho (double bond)
      { element: 'C', x: -0.3686, y: -1.2887, z: 0.0225 }, // ortho
      { element: 'C', x: 2.9980, y: 0.4520, z: 0.7390 },   // methyl
    ],
    bonds: [
      { atom1Index: 0, atom2Index: 4, order: 1 }, // S–CH₃
      { atom1Index: 0, atom2Index: 1, order: 1 }, // S–C(ipso)
      { atom1Index: 1, atom2Index: 2, order: 2 }, // ring double bond
      { atom1Index: 1, atom2Index: 3, order: 1 },
    ],
  };

  // Same connectivity, methyl rotated into the ring plane (z = 0): the
  // C–S–C plane now coincides with the ring plane, so the promotion is
  // geometrically valid and must still happen.
  const PLANAR_THIOANISOLE: Molecule = {
    atoms: [
      { element: 'S', x: 0, y: 0, z: 0 },
      { element: 'C', x: 1.75, y: 0, z: 0 },
      { element: 'C', x: 2.40, y: 1.28, z: 0 },
      { element: 'C', x: 2.40, y: -1.28, z: 0 },
      { element: 'C', x: -0.4355, y: 1.7465, z: 0 },
    ],
    bonds: [
      { atom1Index: 0, atom2Index: 4, order: 1 },
      { atom1Index: 0, atom2Index: 1, order: 1 },
      { atom1Index: 1, atom2Index: 2, order: 2 },
      { atom1Index: 1, atom2Index: 3, order: 1 },
    ],
  };

  it('twisted thioether (thioanisole) keeps its σ lone pairs — no fake p lobe', () => {
    const s = classifyMolecule(TWISTED_THIOANISOLE)[0];
    expect(s.element).toBe('S');
    expect(s.hybridization).toBe('sp³');
    expect(s.lonePairs).toBe(2);
    expect(s.hasPi).toBe(false);
    expect(s.piDirection).toBeNull();
  });

  it('planar thioether still promotes the lone pair to a p parallel to the ring', () => {
    const s = classifyMolecule(PLANAR_THIOANISOLE)[0];
    expect(s.element).toBe('S');
    expect(s.hybridization).toBe('sp²');
    expect(s.lonePairs).toBe(1);
    expect(s.hasPi).toBe(true);
    expect(s.piDirection).not.toBeNull();
    // promoted p must be perpendicular to the (planar) σ framework → ±z here
    expect(Math.abs(s.piDirection![2])).toBeGreaterThan(0.999);
  });
});
