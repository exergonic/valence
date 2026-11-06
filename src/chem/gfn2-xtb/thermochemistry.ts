/**
 * Thermochemistry from GFN2-xTB's vibrations: the zero-point energy, the
 * internal energy, the enthalpy, the entropy and the free energy of the
 * molecule as an ideal gas at 298.15 K and 1 atm — the ideal-gas / rigid-rotor
 * / harmonic-oscillator sums, with the soft modes' entropy taken as xtb takes
 * it (quasi-RRHO, below).
 *
 *   translation   U = 3/2 RT          S = R [ln((2πmkT/h²)^3/2 · kT/p) + 5/2]
 *   rotation      U = 3/2 RT (RT linear)
 *                 S = R [ln(√π/σ · √(T³/ΘₐΘ_bΘ_c)) + 3/2]   (R [ln(T/σΘ) + 1] linear)
 *   vibration     U = Σ hcν̃ (½ + 1/(eˣ − 1))   S_HO = R [x/(eˣ − 1) − ln(1 − e⁻ˣ)],  x = hcν̃/kT
 *   electronic    S = R ln(2S + 1)
 *   U = E + the three U's above,  H = U + RT,  G = H − TS
 *
 * σ, the rotational symmetry number, is the number of proper rotations in the
 * point group (water 2, NH₃ 3, CH₄ 12, benzene 12): it divides the rotational
 * partition function, since a rotation that maps the molecule onto itself is
 * not a new orientation.
 *
 * Quasi-RRHO (Grimme, Chem. Eur. J. 2012, 18, 9955), exactly as xtb 6.7.1
 * does it (decided with the user 2026-11-05, to compare against the oracle).
 * A harmonic oscillator's entropy grows without bound as ν̃ → 0, which
 * overstates a soft torsion's S, and a torsion that soft is more nearly a
 * free internal rotation. So each mode's entropy is a blend,
 *
 *   S = w S_HO + (1 − w) S_FR,   w = 1 / (1 + (ν̃₀/ν̃)⁴),   ν̃₀ = 50 cm⁻¹,
 *
 * the free rotor's being S_FR = R [½ + ln √(8π³ μ′ kT / h²)], for the moment
 * of inertia μ = h / (8π² c ν̃) of a rotor with that frequency, capped by the
 * molecule's own average moment: μ′ = μ I_av / (μ + I_av), I_av the mean of
 * the principal moments (xtb's choice; Grimme's paper fixes it at 10⁻⁴⁴ kg m²).
 * Only the entropy is blended: U and H stay harmonic, as in xtb. The cut-off
 * is as arbitrary as the 100 cm⁻¹ of Grimme's paper; 50 is xtb's.
 *
 * An imaginary mode above SADDLE_FREQUENCY_THRESHOLD (−20 cm⁻¹) is an artifact
 * — a methyl rotor not quite settled at its minimum, which the optimiser's
 * gate leaves and the Hessian verdict already calls a minimum — and counts as
 * real at |ν̃|, as xtb counts it. Below that, a mode has no harmonic partition
 * function and is left out: the structure is a saddle, and the result says so.
 */

import { ATOMIC_MASS } from '../assign-mass';
import { jacobiSymmetric } from '../../utils/eigen';
import { SADDLE_FREQUENCY_THRESHOLD } from './normal-modes';

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
/** Quasi-RRHO's cut-off, cm⁻¹: a mode this soft has half its entropy from the
 *  harmonic oscillator and half from the free rotor. xtb's value. */
const ROTOR_CUTOFF_CM = 50;

export interface Thermochemistry {
  temperature: number;
  /** GFN2-xTB's electronic energy E, Eh. */
  energy: number;
  /** Zero-point vibrational energy, Eh. */
  zeroPoint: number;
  /** U = E + zero-point and thermal energy, Eh. */
  internalEnergy: number;
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
  /** Imaginary modes above SADDLE_FREQUENCY_THRESHOLD, counted as real. */
  invertedImaginary: number;
  /** U − E − ZPE by motion, Eh: the energy of motion at T, above the zero point. */
  thermalParts: { translational: number; rotational: number; vibrational: number };
  /** pV = RT for a mole of ideal gas, Eh: H − U. */
  pressureVolume: number;
  /** Each counted mode's share of the ZPE (Eh) and of the vibrational
   *  entropy (Eh/K), at its index in the input frequencies; they sum to
   *  `zeroPoint` and `entropyParts.vibrational`. */
  modes: ModeShare[];
}

export interface ModeShare {
  /** Index into the input frequencies (and so into the normal modes). */
  index: number;
  /** cm⁻¹, as counted: an artifact imaginary mode at |ν̃|. */
  wavenumber: number;
  inverted: boolean;
  zeroPoint: number;
  entropy: number;
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
  const averageMoment = (moments[0] + moments[1] + moments[2]) / 3;
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

  // vibration: each real mode a harmonic oscillator, its entropy blended
  // toward a free rotor's when it is soft
  const artifact = (f: number) => f < -RIGID_MOTION_CM && f > SADDLE_FREQUENCY_THRESHOLD;
  const invertedImaginary = input.frequencies.filter(artifact).length;
  const wavenumbers = input.frequencies.map((f) => (artifact(f) ? -f : f));
  const imaginary = wavenumbers.filter((f) => f < -RIGID_MOTION_CM).length;
  let zeroPoint = 0;
  let uVib = 0;
  let sVib = 0;
  const modes: ModeShare[] = [];
  wavenumbers.forEach((wavenumber, index) => {
    if (wavenumber <= RIGID_MOTION_CM) return;
    const quantum = PLANCK * LIGHT_CM * wavenumber; // J
    const x = quantum / (BOLTZMANN * T);
    const modeZeroPoint = 0.5 * quantum * AVOGADRO;
    zeroPoint += modeZeroPoint;
    uVib += quantum * AVOGADRO * (0.5 + 1 / Math.expm1(x));
    const harmonic = x / Math.expm1(x) - Math.log(-Math.expm1(-x));
    const rotorMoment = PLANCK / (8 * Math.PI ** 2 * LIGHT_CM * wavenumber);
    const capped = (rotorMoment * averageMoment) / (rotorMoment + averageMoment);
    const freeRotor = 0.5 + Math.log(Math.sqrt((8 * Math.PI ** 3 * capped * BOLTZMANN * T) / PLANCK ** 2));
    const harmonicWeight = 1 / (1 + (ROTOR_CUTOFF_CM / wavenumber) ** 4);
    const modeEntropy = GAS_CONSTANT * (harmonicWeight * harmonic + (1 - harmonicWeight) * freeRotor);
    sVib += modeEntropy;
    modes.push({ index, wavenumber, inverted: artifact(input.frequencies[index]), zeroPoint: modeZeroPoint, entropy: modeEntropy });
  });

  const sElec = GAS_CONSTANT * Math.log(Math.max(1, input.multiplicity));

  // J/mol → Eh
  const toHartree = (joulesPerMole: number) => joulesPerMole / HARTREE_J_PER_MOL;
  const internalEnergy = input.energy + toHartree(uTrans + uRot + uVib);
  const enthalpyCorrection = toHartree(uTrans + uRot + uVib + RT);
  const entropy = toHartree(sTrans + sRot + sVib + sElec);
  const enthalpy = input.energy + enthalpyCorrection;
  return {
    temperature: T,
    energy: input.energy,
    zeroPoint: toHartree(zeroPoint),
    internalEnergy,
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
    invertedImaginary,
    thermalParts: {
      translational: toHartree(uTrans),
      rotational: toHartree(uRot),
      vibrational: toHartree(uVib - zeroPoint),
    },
    pressureVolume: toHartree(RT),
    modes: modes.map((mode) => ({ ...mode, zeroPoint: toHartree(mode.zeroPoint), entropy: toHartree(mode.entropy) })),
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
