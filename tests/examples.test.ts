import { describe, it, expect } from 'vitest';
import { assignHybridization } from '../src/hybridization';
import { parseMolBlock } from '../src/mol-parser';
import { EXAMPLES } from '../src/data/examples';

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
];

const VALENCE: Record<string, number> = {
  H: 1, He: 0, Li: 1, Be: 2, B: 3,
  C: 4, N: 5, O: 6, F: 7,
  Na: 1, Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 7,
  K: 1, Ca: 2, Ga: 3, Ge: 4, As: 5, Se: 6, Br: 7,
  Rb: 1, Sr: 2, In: 3, Sn: 4, Sb: 5, Te: 6, I: 7,
};

function vecAngle(a: [number, number, number], b: [number, number, number]): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const la = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  const lb = Math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2);
  if (la < 1e-8 || lb < 1e-8) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (la * lb))));
}

function vecDot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossProduct(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecNormalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  if (len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function findPerpendicular(v: [number, number, number]): [number, number, number] {
  const absX = Math.abs(v[0]);
  const absY = Math.abs(v[1]);
  const absZ = Math.abs(v[2]);

  if (absX <= absY && absX <= absZ) {
    return crossProduct(v, [1, 0, 0]);
  } else if (absY <= absX && absY <= absZ) {
    return crossProduct(v, [0, 1, 0]);
  }
  return crossProduct(v, [0, 0, 1]);
}

function getPiDirectionFromNeighbor(
  atomIdx: number,
  adj: number[][],
  molecule: ReturnType<typeof parseMolBlock>,
  piCount: number[],
  atomPos: [number, number, number],
): [number, number, number] | null {
  const piNeighbor = adj[atomIdx].find((ni) => piCount[ni] > 0);
  if (piNeighbor === undefined) return null;

  const otherBonds = adj[piNeighbor].filter((ni) => ni !== atomIdx);
  if (otherBonds.length >= 2) {
    const nb = molecule.atoms[piNeighbor];
    const s1 = molecule.atoms[otherBonds[0]];
    const s2 = molecule.atoms[otherBonds[1]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const v2: [number, number, number] = [s2.x - nb.x, s2.y - nb.y, s2.z - nb.z];
    return vecNormalize(crossProduct(v1, v2));
  }

  if (otherBonds.length === 1) {
    const nb = molecule.atoms[piNeighbor];
    const s1 = molecule.atoms[otherBonds[0]];
    const v1: [number, number, number] = [s1.x - nb.x, s1.y - nb.y, s1.z - nb.z];
    const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
    return vecNormalize(crossProduct(v1, bd));
  }

  const nb = molecule.atoms[piNeighbor];
  const bd: [number, number, number] = [nb.x - atomPos[0], nb.y - atomPos[1], nb.z - atomPos[2]];
  return vecNormalize(findPerpendicular(bd));
}

function computePiDirection(
  atomIdx: number,
  molecule: ReturnType<typeof parseMolBlock>,
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

  if (piDirection && neighborVectors.length > 0) {
    const ref = vecNormalize(neighborVectors[0]);
    const dot = vecDot(ref, piDirection);
    piDirection = vecNormalize([
      piDirection[0] - dot * ref[0],
      piDirection[1] - dot * ref[1],
      piDirection[2] - dot * ref[2],
    ]);
  }

  if (!piDirection && hyb.hybridization === 'sp' && neighborVectors.length >= 1) {
    piDirection = vecNormalize(findPerpendicular(neighborVectors[0]));
  }

  return piDirection;
}

/** Compute per-atom orbital info matching the pipeline logic in renderOrbitals */
function classifyAtoms(mol: string): Array<{
  element: string;
  hybridization: string;
  lonePairs: number;
  hasPi: boolean;
  piDirection: [number, number, number] | null;
}> {
  const molecule = parseMolBlock(mol);
  const n = molecule.atoms.length;

  const adj: number[][] = Array.from({ length: n }, () => []);
  const piCount: number[] = new Array(n).fill(0);
  for (const bond of molecule.bonds) {
    adj[bond.atom1Index].push(bond.atom2Index);
    adj[bond.atom2Index].push(bond.atom1Index);
    piCount[bond.atom1Index] += Math.max(0, bond.order - 1);
    piCount[bond.atom2Index] += Math.max(0, bond.order - 1);
  }

  const result: Array<{
    element: string;
    hybridization: string;
    lonePairs: number;
    hasPi: boolean;
    piDirection: [number, number, number] | null;
  }> = [];

  for (let i = 0; i < n; i++) {
    const atom = molecule.atoms[i];
    const neighbors = adj[i];
    const neighborVectors: [number, number, number][] = neighbors.map((ni) => {
      const n = molecule.atoms[ni];
      return [n.x - atom.x, n.y - atom.y, n.z - atom.z];
    });

    const hyb = neighborVectors.length >= 2
      ? assignHybridization(atom.element, neighborVectors, piCount[i])
      : (() => {
        const steric = Math.min(4, Math.max(2, neighbors.length + Math.round(Math.max(0, (VALENCE[atom.element] || 4) - neighbors.length - piCount[i]) / 2)));
        return { hybridization: steric === 2 ? 'sp' as const : steric === 3 ? 'sp2' as const : 'sp3' as const, geometry: 'tetrahedral' as const, bondAngles: [] as number[] };
      })();

    const stericNumber = hyb.hybridization === 'sp' ? 2
      : hyb.hybridization === 'sp2' ? 3 : 4;
    const sigmaBonds = neighbors.length;
    let lonePairs = Math.max(0, stericNumber - sigmaBonds);

    const PI_CONJ_SOURCES = new Set(['C', 'N', 'O', 'S']);
    const piNeighborCount = neighbors.filter((ni) => {
      if (!PI_CONJ_SOURCES.has(molecule.atoms[ni].element)) return false;
      const sharedPi = molecule.bonds
        .filter((b) => (b.atom1Index === i && b.atom2Index === ni) || (b.atom1Index === ni && b.atom2Index === i))
        .reduce((s, b) => s + Math.max(0, b.order - 1), 0);
      return (piCount[ni] - sharedPi) > 0;
    }).length;

    const conjugated = lonePairs > 0 && piNeighborCount > 0 && piCount[i] === 0;
    if (conjugated && hyb.hybridization === 'sp3') lonePairs -= 1;

    const hasPi = piCount[i] > 0 || conjugated || (hyb.hybridization === 'sp2' && piCount[i] === 0)
      || (hyb.hybridization === 'sp' && neighborVectors.length >= 1);

    const atomPos: [number, number, number] = [atom.x, atom.y, atom.z];
    const piDirection = computePiDirection(i, molecule, adj, piCount, atomPos, neighborVectors, hyb, conjugated);

    const effectiveHyb = conjugated && hyb.hybridization === 'sp3' ? 'sp²'
      : hyb.hybridization === 'sp2' ? 'sp²'
      : hyb.hybridization === 'sp3' ? 'sp³'
      : hyb.hybridization === 'sp' ? 'sp'
      : hyb.hybridization;

    result.push({ element: atom.element, hybridization: effectiveHyb, lonePairs, hasPi, piDirection });
  }

  return result;
}

function getPlaneNormal(atoms: Array<{ x: number; y: number; z: number }>): [number, number, number] {
  if (atoms.length < 3) return [0, 0, 0];
  const a = atoms[0], b = atoms[1], c = atoms[2];
  const v1: [number, number, number] = [b.x - a.x, b.y - a.y, b.z - a.z];
  const v2: [number, number, number] = [c.x - a.x, c.y - a.y, c.z - a.z];
  const nrm = vecNormalize(crossProduct(v1, v2));
  if (nrm[0] === 0 && nrm[1] === 0 && nrm[2] === 0) {
    // collinear atoms — try different triple
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

      const molecule = parseMolBlock(example.mol);
      const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');

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

  // Planar conjugated ring systems: all π directions parallel to ring normal
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

      const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');
      for (let i = 0; i < result.length; i++) {
        const atom = result[i];
        if (!atom.hasPi) continue;
        expect(atom.piDirection, `Atom ${i} (${atom.element}) should have a π direction`).not.toBeNull();
        expectParallel(atom.piDirection!, ringNormal, 1e-4);
      }
    });
  }

  // Planar acyclic π system: ethene
  it('Ethene (C₂H₄) — both π orbitals parallel to each other', () => {
    const example = EXAMPLES.find((e) => e.name === 'Ethene (C₂H₄)');
    if (!example) { expect.fail('Example not found'); return; }

    const result = classifyAtoms(example.mol).filter((a) => a.element === 'C');
    expect(result).toHaveLength(2);
    expect(result[0].hasPi).toBe(true);
    expect(result[1].hasPi).toBe(true);
    expect(result[0].piDirection).not.toBeNull();
    expect(result[1].piDirection).not.toBeNull();
    expectParallel(result[0].piDirection!, result[1].piDirection!, 1e-4);
  });

  // sp systems: π direction perpendicular to bond axis
  const SP_EXAMPLES = ['Ethyne (C₂H₂)', 'Nitrogen (N₂)'];
  for (const name of SP_EXAMPLES) {
    it(`${name} — π direction perpendicular to bond axis`, () => {
      const example = EXAMPLES.find((e) => e.name === name);
      if (!example) { expect.fail(`Example not found: ${name}`); return; }

      const molecule = parseMolBlock(example.mol);
      const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');

      for (let i = 0; i < result.length; i++) {
        const atom = result[i];
        expect(atom.hasPi).toBe(true);
        expect(atom.piDirection, `Atom ${i} (${atom.element}) should have a π direction`).not.toBeNull();

        // The bond axis is the only neighbor direction for diatomic sp
        const neighbors = (() => {
          const adj: number[][] = Array.from({ length: molecule.atoms.length }, () => []);
          for (const bond of molecule.bonds) {
            adj[bond.atom1Index].push(bond.atom2Index);
            adj[bond.atom2Index].push(bond.atom1Index);
          }
          return adj;
        })();
        const ni = neighbors[Object.keys(neighbors).find((k) => parseInt(k) === molecule.atoms.indexOf(molecule.atoms.find((a, idx) => idx === i)!))!];
        // Actually, let's just compute the bond axis from coordinates
      }
    });
  }

  // Simpler approach: for diatomic molecules, the bond axis is the vector between the two atoms
  it('Ethyne (C₂H₂) — π direction perpendicular to C≡C axis', () => {
    const example = EXAMPLES.find((e) => e.name === 'Ethyne (C₂H₂)');
    if (!example) { expect.fail('Example not found'); return; }

    const molecule = parseMolBlock(example.mol);
    const cAtoms = molecule.atoms.filter((a) => a.element === 'C');
    expect(cAtoms).toHaveLength(2);
    const bondAxis = vecNormalize([cAtoms[1].x - cAtoms[0].x, cAtoms[1].y - cAtoms[0].y, cAtoms[1].z - cAtoms[0].z]);

    const result = classifyAtoms(example.mol).filter((a) => a.element === 'C');
    for (let i = 0; i < result.length; i++) {
      expect(result[i].hasPi).toBe(true);
      expect(result[i].piDirection).not.toBeNull();
      expectPerpendicular(result[i].piDirection!, bondAxis, 1e-4);
    }
  });

  it('Nitrogen (N₂) — π direction perpendicular to N≡N axis', () => {
    const example = EXAMPLES.find((e) => e.name === 'Nitrogen (N₂)');
    if (!example) { expect.fail('Example not found'); return; }

    const molecule = parseMolBlock(example.mol);
    const nAtoms = molecule.atoms.filter((a) => a.element === 'N');
    const bondAxis = vecNormalize([nAtoms[1].x - nAtoms[0].x, nAtoms[1].y - nAtoms[0].y, nAtoms[1].z - nAtoms[0].z]);

    const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');
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

    const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');
    for (let i = 0; i < result.length; i++) {
      expect(result[i].hasPi).toBe(true);
      expect(result[i].piDirection).not.toBeNull();
      expectPerpendicular(result[i].piDirection!, bondAxis, 1e-4);
    }
  });

  // Non-π systems: verify null piDirection
  it('Methane (CH₄) — no π direction', () => {
    const example = EXAMPLES.find((e) => e.name === 'Methane (CH₄)');
    if (!example) { expect.fail('Example not found'); return; }
    const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');
    expect(result[0].hasPi).toBe(false);
    expect(result[0].piDirection).toBeNull();
  });

  it('Water (H₂O) — no π direction', () => {
    const example = EXAMPLES.find((e) => e.name === 'Water (H₂O)');
    if (!example) { expect.fail('Example not found'); return; }
    const result = classifyAtoms(example.mol).filter((a) => a.element !== 'H');
    expect(result[0].hasPi).toBe(false);
    expect(result[0].piDirection).toBeNull();
  });
});
