/**
 * Thermochemistry from GFN2-xTB's vibrations: the zero-point energy, the
 * enthalpy, the entropy and the free energy of the molecule as an ideal gas
 * at 298.15 K and 1 atm — the textbook ideal-gas / rigid-rotor / harmonic-
 * oscillator (RRHO) sums every quantum chemistry program prints.
 *
 *   translation   U = 3/2 RT          S = R [ln((2πmkT/h²)^3/2 · kT/p) + 5/2]
 *   rotation      U = 3/2 RT (RT linear)
 *                 S = R [ln(√π/σ · √(T³/ΘₐΘ_bΘ_c)) + 3/2]   (R [ln(T/σΘ) + 1] linear)
 *   vibration     U = Σ hcν̃ (½ + 1/(eˣ − 1))   S = R Σ [x/(eˣ − 1) − ln(1 − e⁻ˣ)],  x = hcν̃/kT
 *   electronic    S = R ln(2S + 1)
 *   H = E + U + RT,  G = H − TS
 *
 * σ, the rotational symmetry number, is the number of proper rotations in the
 * point group (water 2, NH₃ 3, CH₄ 12, benzene 12): it divides the rotational
 * partition function, since a rotation that maps the molecule onto itself is
 * not a new orientation.
 *
 * Plain RRHO, not Grimme's quasi-RRHO that the Fortran xtb prints: below
 * ~100 cm⁻¹ a harmonic oscillator's entropy grows without bound, so a soft
 * torsion's S (and G) is overstated here; xtb interpolates such modes toward
 * a free rotor. For the small molecules Valence vibrates (under 16 atoms)
 * the two agree wherever no mode is that soft. An imaginary mode has no
 * harmonic partition function and is left out — the structure is then a
 * saddle, and the result says so.
 */

import { ATOMIC_MASS } from '../assign-mass';
import { jacobiSymmetric } from '../../utils/eigen';

// CODATA 2018, SI
const PLANCK = 6.62607015e-34;
const BOLTZMANN = 1.380649e-23;
const LIGHT_CM = 2.99792458e10; // cm/s, for wavenumbers
const AVOGADRO = 6.02214076e23;
const AMU = 1.6605390666e-27;
const GAS_CONSTANT = BOLTZMANN * AVOGADRO; // J/(mol K)
const HARTREE_J_PER_MOL = 4.3597447222071e-18 * AVOGADRO;
const STANDARD_PRESSURE = 101325; // 1 atm, Pa — as xtb and Gaussian report
export const STANDARD_TEMPERATURE = 298.15;

/** Modes below this many cm⁻¹ (in magnitude) are rigid motions the
 *  projection left behind, not vibrations. */
const RIGID_MOTION_CM = 1;

export interface Thermochemistry {
  temperature: number;
  /** GFN2-xTB's electronic energy E, Eh. */
  energy: number;
  /** Zero-point vibrational energy, Eh. */
  zeroPoint: number;
  /** H − E: zero-point, thermal and pV, Eh. */
  enthalpyCorrection: number;
  /** H = E + the correction, Eh. */
  enthalpy: number;
  /** S, Eh/K, and its parts. */
  entropy: number;
  entropyParts: { translational: number; rotational: number; vibrational: number; electronic: number };
  /** G = H − TS, Eh. */
  freeEnergy: number;
  symmetryNumber: number;
  linear: boolean;
  /** Imaginary modes left out: a saddle, not a minimum. */
  imaginary: number;
}

export interface ThermochemistryInput {
  atoms: Array<{ element: string; x: number; y: number; z: number }>;
  /** cm⁻¹, negative for an imaginary mode. */
  frequencies: number[];
  /** Electronic energy, Eh. */
  energy: number;
  multiplicity: number;
  symmetryNumber: number;
  temperature?: number;
}

export function thermochemistry(input: ThermochemistryInput): Thermochemistry {
  const T = input.temperature ?? STANDARD_TEMPERATURE;
  const RT = GAS_CONSTANT * T;
  const masses = input.atoms.map((a) => ATOMIC_MASS[a.element] ?? 0);
  const total = masses.reduce((s, m) => s + m, 0);

  // translation: the Sackur–Tetrode entropy of the whole mass
  const m = total * AMU;
  const qTrans = (2 * Math.PI * m * BOLTZMANN * T / PLANCK ** 2) ** 1.5 * BOLTZMANN * T / STANDARD_PRESSURE;
  const sTrans = GAS_CONSTANT * (Math.log(qTrans) + 2.5);
  const uTrans = 1.5 * RT;

  // rotation: the principal moments of inertia about the centre of mass
  const centre = [0, 1, 2].map((k) => input.atoms.reduce((s, a, i) => s + masses[i] * [a.x, a.y, a.z][k], 0) / total);
  const inertia = [0, 1, 2].map(() => [0, 0, 0]);
  input.atoms.forEach((a, i) => {
    const r = [a.x - centre[0], a.y - centre[1], a.z - centre[2]];
    const r2 = r[0] ** 2 + r[1] ** 2 + r[2] ** 2;
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) inertia[p][q] += masses[i] * ((p === q ? r2 : 0) - r[p] * r[q]);
  });
  const moments = jacobiSymmetric(inertia).values.map((I) => I * AMU * 1e-20); // amu Å² → kg m²
  const largest = moments[2];
  const linear = input.atoms.length === 2 || moments[0] < 1e-3 * largest;
  const theta = (I: number) => PLANCK ** 2 / (8 * Math.PI ** 2 * I * BOLTZMANN); // rotational temperature, K
  const sigma = Math.max(1, input.symmetryNumber);
  let sRot = 0;
  let uRot = 0;
  if (input.atoms.length > 1) {
    if (linear) {
      sRot = GAS_CONSTANT * (Math.log(T / (sigma * theta(largest))) + 1);
      uRot = RT;
    } else {
      const product = theta(moments[0]) * theta(moments[1]) * theta(moments[2]);
      sRot = GAS_CONSTANT * (Math.log((Math.sqrt(Math.PI) / sigma) * Math.sqrt(T ** 3 / product)) + 1.5);
      uRot = 1.5 * RT;
    }
  }

  // vibration: each real mode a harmonic oscillator
  const real = input.frequencies.filter((f) => f > RIGID_MOTION_CM);
  const imaginary = input.frequencies.filter((f) => f < -RIGID_MOTION_CM).length;
  let zeroPoint = 0;
  let uVib = 0;
  let sVib = 0;
  for (const wavenumber of real) {
    const quantum = PLANCK * LIGHT_CM * wavenumber; // J
    const x = quantum / (BOLTZMANN * T);
    zeroPoint += 0.5 * quantum * AVOGADRO;
    uVib += quantum * AVOGADRO * (0.5 + 1 / Math.expm1(x));
    sVib += GAS_CONSTANT * (x / Math.expm1(x) - Math.log(-Math.expm1(-x)));
  }

  const sElec = GAS_CONSTANT * Math.log(Math.max(1, input.multiplicity));

  // J/mol → Eh
  const toHartree = (joulesPerMole: number) => joulesPerMole / HARTREE_J_PER_MOL;
  const enthalpyCorrection = toHartree(uTrans + uRot + uVib + RT);
  const entropy = toHartree(sTrans + sRot + sVib + sElec);
  const enthalpy = input.energy + enthalpyCorrection;
  return {
    temperature: T,
    energy: input.energy,
    zeroPoint: toHartree(zeroPoint),
    enthalpyCorrection,
    enthalpy,
    entropy,
    entropyParts: {
      translational: toHartree(sTrans),
      rotational: toHartree(sRot),
      vibrational: toHartree(sVib),
      electronic: toHartree(sElec),
    },
    freeEnergy: enthalpy - T * entropy,
    symmetryNumber: sigma,
    linear,
    imaginary,
  };
}

/** The rotational symmetry number from a point group's operations: how many
 *  are proper rotations (determinant +1), the identity included. A linear
 *  group's operations are not listed — D∞h is 2, C∞v 1. */
export function symmetryNumber(group: { symbol: string; operations: Array<{ matrix: number[][] }> }): number {
  if (group.symbol === 'D∞h') return 2;
  if (group.symbol === 'C∞v') return 1;
  const proper = group.operations.filter(({ matrix: M }) => determinant(M) > 0).length;
  return Math.max(1, proper);
}

function determinant(M: number[][]): number {
  return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1])
    - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0])
    + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
}
