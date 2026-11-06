/**
 * Thermochemistry from GFN2's vibrations (gfn2-xtb/thermochemistry.ts), held
 * to the Fortran xtb oracle: its own optimised geometries and frequencies go
 * in, and its printed ZPE, entropy (by part), enthalpy and free energy must
 * come out (tests/references/xtb-thermochemistry.json). Hexane is the one
 * with modes soft enough (68 and 94 cm⁻¹) for xtb's quasi-RRHO entropy to
 * differ from the plain RRHO's — by 0.29 cal/(mol K), six times the test's
 * margin. Argon pins the translational part alone.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { symmetryNumber, thermochemistry } from '../src/chem/gfn2-xtb/thermochemistry';
import { detectPointGroup } from '../src/geometry/symmetrize';

interface OracleMolecule {
  rotationalNumber: number;
  energy: number;
  zeroPoint: number;
  enthalpy: number;
  freeEnergy: number;
  entropyCalPerMolK: { total: number; rotational: number; translational: number };
  atoms: Array<{ element: string; x: number; y: number; z: number }>;
  frequencies: number[];
}
const oracle = JSON.parse(readFileSync(fileURLToPath(new URL('./references/xtb-thermochemistry.json', import.meta.url)), 'utf-8')) as {
  molecules: Record<string, OracleMolecule>;
};
/** Eh/K → cal/(mol K) */
const CAL_PER_MOL_K = (4.3597447222071e-18 * 6.02214076e23) / 4.184;

describe('the translational entropy: Sackur–Tetrode', () => {
  it('argon at 298.15 K and 1 atm: 154.74 J/(mol K)', () => {
    const argon = thermochemistry({ atoms: [{ element: 'Ar', x: 0, y: 0, z: 0 }], frequencies: [], energy: 0, multiplicity: 1, symmetryNumber: 1 });
    // 154.846 J/(mol K) at 1 bar, less R ln(1.01325) for 1 atm
    expect(argon.entropy * CAL_PER_MOL_K * 4.184).toBeCloseTo(154.737, 1);
  });
});

describe('against the xtb oracle, on its own geometry and frequencies', () => {
  for (const [name, reference] of Object.entries(oracle.molecules)) {
    it(`${name}: σ, ZPE, S by part, H and G`, () => {
      const molecule = { atoms: reference.atoms, bonds: [] };
      const sigma = symmetryNumber(detectPointGroup(molecule));
      expect(sigma).toBe(reference.rotationalNumber);
      const result = thermochemistry({
        atoms: reference.atoms, frequencies: reference.frequencies, energy: reference.energy, multiplicity: 1, symmetryNumber: sigma,
      });
      expect(result.imaginary).toBe(0);
      expect(result.zeroPoint).toBeCloseTo(reference.zeroPoint, 6);
      // 0.015–0.018 cal/(mol K) above xtb's for all four: argon pins this
      // Sackur–Tetrode to CODATA 2018, so the difference is xtb's constants
      expect(Math.abs(result.entropyParts.translational * CAL_PER_MOL_K - reference.entropyCalPerMolK.translational)).toBeLessThan(0.03);
      expect(result.entropyParts.rotational * CAL_PER_MOL_K).toBeCloseTo(reference.entropyCalPerMolK.rotational, 2);
      expect(result.entropy * CAL_PER_MOL_K).toBeCloseTo(reference.entropyCalPerMolK.total, 1);
      expect(result.enthalpy).toBeCloseTo(reference.enthalpy, 5);
      // xtb prints no U; for an ideal gas it is H less pV = RT
      const RT = (8.314462618 * 298.15) / (4.3597447222071e-18 * 6.02214076e23);
      expect(result.internalEnergy).toBeCloseTo(result.enthalpy - RT, 9);
      // G carries T times that translational offset: 7.5e-6 Eh, 0.005 kcal/mol
      expect(Math.abs(result.freeEnergy - reference.freeEnergy)).toBeLessThan(1e-5);
    });
  }
});

describe('the parts that are not vibrational', () => {
  it('a triplet adds R ln 3 of electronic entropy', () => {
    const atoms = oracle.molecules.water.atoms;
    const singlet = thermochemistry({ atoms, frequencies: [], energy: 0, multiplicity: 1, symmetryNumber: 2 });
    const triplet = thermochemistry({ atoms, frequencies: [], energy: 0, multiplicity: 3, symmetryNumber: 2 });
    expect((triplet.entropy - singlet.entropy) * CAL_PER_MOL_K).toBeCloseTo(1.98720 * Math.log(3), 4);
  });

  it('an imaginary mode is counted and left out', () => {
    const { atoms, frequencies, energy } = oracle.molecules.water;
    const result = thermochemistry({ atoms, frequencies: [-166, ...frequencies], energy, multiplicity: 1, symmetryNumber: 2 });
    expect(result.imaginary).toBe(1);
  });
});

describe('xtb’s rules for soft and nearly-zero modes', () => {
  const hexane = oracle.molecules.hexane;
  const run = (frequencies: number[]) => thermochemistry({
    atoms: hexane.atoms, frequencies, energy: hexane.energy, multiplicity: 1, symmetryNumber: 2,
  });

  it('a soft mode’s entropy is blended toward a free rotor’s: hexane’s 68 cm⁻¹ torsion', () => {
    // xtb's own table for this mode: T·S 1.25214 kcal/mol as an oscillator,
    // 0.96361 as a free rotor, 1.18797 blended (77.76 % oscillator)
    const T = 298.15;
    const without = hexane.frequencies.map((f, i) => (i === 6 ? 0 : f));
    const share = (run(hexane.frequencies).entropy - run(without).entropy) * T * 627.5094740631;
    expect(share).toBeCloseTo(1.18797, 3);
  });

  it('an imaginary mode above −20 cm⁻¹ is a methyl rotor’s artifact, counted as real', () => {
    const real = run(hexane.frequencies);
    const flipped = run(hexane.frequencies.map((f, i) => (i === 6 ? -f : f)));
    expect(hexane.frequencies[6]).toBeGreaterThan(20); // so its flip is a saddle's
    expect(flipped.imaginary).toBe(1);

    const settled = run(hexane.frequencies.map((f, i) => (i === 6 ? 15 : f)));
    const artifact = run(hexane.frequencies.map((f, i) => (i === 6 ? -15 : f)));
    expect(artifact.imaginary).toBe(0);
    expect(artifact.invertedImaginary).toBe(1);
    expect(artifact.freeEnergy).toBe(settled.freeEnergy);
    expect(real.invertedImaginary).toBe(0);
  });
});
