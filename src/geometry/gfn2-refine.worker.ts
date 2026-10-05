/// <reference lib="webworker" />
/// <reference types="vite/client" />
/**
 * GFN2-xTB geometry optimisation, off the main thread.
 *
 * The default tier of the geometry pipeline: a real semiempirical
 * calculation (extended tight binding) rather than a force field. It runs
 * first because it is structurally right where MMFF94 is not (hypervalent
 * centres, untabled elements) — for a well-parameterised organic MMFF94 is
 * often the better number, and it stays as the fallback when this engine
 * cannot run. Costs ~3 MB of wasm, loaded lazily.
 *
 * Everything below the API boundary is OCC's, and OCC is not consistent about
 * units or conventions. The traps, all verified against the Fortran xTB
 * oracle before this was written:
 *
 *   - the Molecule constructor and XYZ text take ANGSTROM; updateStructure()
 *     and positions() take and return BOHR. Mixing them inflates a structure
 *     by 0.529^-1 and the optimiser walks off to garbage.
 *   - the gradient is Eh/bohr, coordinate-major: Mat3N.get(coordinate, atom).
 *   - setNumThreads(1) is load-bearing, not an optimisation. The wasm is built
 *     with pthreads, and a threaded build needs SharedArrayBuffer, which needs
 *     COOP/COEP headers, which GitHub Pages cannot set. Single-threaded is what
 *     makes this deployable at all.
 *   - the preloaded share/ tree is mounted at '/'.
 */
import { fillMissingHydrogens } from '../chem/fill-hydrogens';
import { jacobiSymmetric } from '../utils/eigen';
import {
  optimize_lbfgs,
  optimize_steepest_descent,
  type Molecule as LibraryMolecule,
  type OptimizationResult,
} from 'mmff94-ts';
import { toMMFFMol } from './mmff-refine';
import createOccModule from '../../vendor/occ-wasm/occjs.js';
import wasmUrl from '../../vendor/occ-wasm/occjs.wasm?url';
import dataUrl from '../../vendor/occ-wasm/occjs.data?url';
import type { Molecule } from '../mol-parser';

const BOHR_PER_ANGSTROM = 0.529177210903;
/** Eh/bohr → kcal/mol/Å: the engine's gradient unit against the library's. */
const FORCE_UNIT = 627.509474 / BOHR_PER_ANGSTROM;
/** The optimiser's stop, in the library's unit — the app's long-standing
 *  max|g| < 1e-4 Eh/bohr, so the convergence claim does not change. */
const GRADIENT_TOLERANCE_KCAL_MOL_A = 1e-4 * FORCE_UNIT;
const MAX_ITERATIONS = 300;

/** An evaluation this far below the best seen so far (hartree) is a spurious
 *  SCF solution, not a real step downhill: reject it as a failed evaluation.
 *  Measured 2026-10-02 on a far-off PCl5 start: the library's L-BFGS followed
 *  such a drop to E −29.19 (3.8 Eh below the true minimum, max|g| 1242
 *  kcal/mol/Å) and called it an improvement. A real step in a
 *  connectivity-preserving optimisation never drops this far — 1 Eh is
 *  ~627 kcal/mol. */
const SPURIOUS_DROP_LIMIT_HARTREE = 1.0;
/** A failed evaluation reports this energy (hartree) with a zero gradient, so
 *  the line search rejects the trial and backtracks. A large constant, not the
 *  last valid energy: an α-independent wall poisons the zoom's interpolation
 *  (measured: PCl5 wandered for its full 300 iterations and missed the minimum
 *  with a soft wall, and converged in 30 with this sentinel). The zero gradient
 *  is deliberate — it satisfies the curvature half of the Wolfe conditions but
 *  can never satisfy Armijo while the energy stands. */
const REJECTED_EVALUATION_ENERGY = 1e9;
/** Abort budgets, per rung. A start the engine cannot handle makes the line
 *  search thrash on rejected trials (the measured PCl5 fixture: 317 engine
 *  failures and 19 spurious drops in 12 223 oracle calls, ≈3 min; a
 *  cyclopropenyl-anion start cost 68 s the same way). Aborting early hands the
 *  rung over cheaply. The app's real starts show 0–6 engine failures and zero
 *  spurious drops, so these budgets are well clear of normal operation. */
const MAX_ENGINE_FAILURES = { lbfgs: 15, fallback: 30 };
const MAX_SPURIOUS_DROPS = 5;
/** Oracle-call budget per rung — the bound that actually holds, because a
 *  hostile start wastes time in *valid* evaluations, not rejected ones: the
 *  measured cyclopropenyl-anion start spent 10 017 calls (24 s) in the L-BFGS
 *  rung to reach the same unconverged energy the fallback reached in 408 calls
 *  (1 s). Legitimate rungs measure 185–1 946 calls, so 2 500/1 500 clears them
 *  and cuts the thrash. */
const MAX_CALLS = { lbfgs: 2500, fallback: 1500 };
/** The fallback's step length (Å): bounded steps keep the walk on the physical
 *  surface, which is what the library's own docs recommend steepest descent
 *  for ("a pathological starting geometry"). 0.1 Å is the trust region the
 *  removed hand-rolled loop enforced. */
const FALLBACK_STEP_ANGSTROM = 0.1;
/** Above this atom count the Hessian verdict is skipped: the cost is 6N
 *  gradient evaluations (measured on the vendored engine, 2026-10-02: 45 ms at
 *  N=3, 182 ms at N=8, 653 ms at N=13, 3.1 s at N=21), and the verdict is a
 *  convenience, not the geometry. */
const MAX_HESSIAN_ATOMS = 16;
/** Finite-difference step for the numerical Hessian, in bohr. */
const HESSIAN_STEP_BOHR = 0.005;

export interface Gfn2Result {
  /** The optimised structure, in Angstrom, same atom order as the input. */
  molecule: Molecule;
  /** Total GFN2 energy, hartree (OCC's native unit). */
  energyHartree: number;
  iterations: number;
  converged: boolean;
  milliseconds: number;
  /** Per-atom GFN2 charges (the SCC shell charges summed per atom, in
   *  electrons) at the returned geometry, indexed like `molecule.atoms`.
   *  Null when the engine's cached SCF does not describe the returned point
   *  — a wrong-geometry charge array is worse than none. */
  charges: number[] | null;
  /** Lowest eigenvalue of the numerical Hessian at the returned geometry
   *  (Eh/bohr²), or null when the check was skipped — the run did not
   *  converge, the molecule is above the size gate, or the Hessian failed.
   *  Negative beyond the numerical noise floor means the geometry is a
   *  saddle, not a minimum (a saddle has zero gradient too, so the stop
   *  criterion cannot tell them apart). */
  lowestHessianMode: number | null;
}

let modulePromise: Promise<any> | null = null;

/**
 * Load the wasm once per worker. Vite emits the wasm and its preloaded data as
 * hashed assets (`?url`), so both paths are known at build time. There is no
 * public/ copy: exactly one of each ships, and nothing needs locating at
 * runtime.
 *
 * `locateFile` is injectable so a test can point the engine at the vendored
 * files on disk (under Node the glue reads them from the filesystem).
 */
function loadGfn2(
  locateFile: (path: string) => string = (path: string) =>
    path.endsWith('.wasm') ? wasmUrl : path.endsWith('.data') ? dataUrl : path,
): Promise<any> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const module = await createOccModule({ locateFile });
      module.setNumThreads?.(1);
      module.setDataDirectory?.('/');
      // OCC logs every SCF cycle at info level; a worker's console is not the place.
      if (module.LogLevel && module.setLogLevel) {
        module.setLogLevel(module.LogLevel.WARN ?? 3);
      }
      return module;
    })().catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

/** Element symbol → atomic number, the whole periodic table: the engine's
 * parameter table decides what it can actually treat, so this must not be the
 * narrower of the two or a supported element gets refused. */
const ELEMENTS = [
  'H','He','Li','Be','B','C','N','O','F','Ne',
  'Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca',
  'Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn',
  'Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr',
  'Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn',
  'Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd',
  'Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb',
  'Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg',
  'Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th',
  'Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm',
  'Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds',
  'Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og',
];

function elementToZ(element: string): number {
  const z = ELEMENTS.indexOf(element) + 1;
  if (!z) throw new Error(`GFN2: no atomic number for element ${element}`);
  return z;
}

const toMat3N = (M: any, flatBohr: number[], count: number) => {
  const m = M.Mat3N.create(count);
  for (let a = 0; a < count; a++) {
    for (let c = 0; c < 3; c++) m.set(c, a, flatBohr[3 * a + c]);
  }
  return m;
};

/** The library's energy container. Only `total` is meaningful here: OCC's
 *  decomposition (SCC, repulsion, dispersion) does not map onto MMFF94's
 *  terms, and the optimiser reads only `total`. Hartree, not kcal/mol. */
const energyComponents = (totalHartree: number) => ({
  total: totalHartree,
  bond_stretch: 0,
  angle_bend: 0,
  stretch_bend: 0,
  torsion: 0,
  van_der_waals: 0,
  electrostatic: 0,
  out_of_plane: 0,
});

/**
 * GFN2-xTB geometry optimisation.
 *
 * The optimiser is mmff94-ts's, driving OCC's energy and gradient through the
 * library's `EnergyGradientFn` oracle — the arrangement chosen for this app and
 * recorded in NOTES.md. It is the library's *steepest descent* (Armijo line
 * search) at the 0.1 Å step the old hand-rolled loop used, not the library's
 * L-BFGS: measured on OCC's surface, L-BFGS converges from the pipeline's start
 * (30 iterations) but walks off a far-off one (12 223 oracle calls, unconverged,
 * after following a spurious SCF solution 3.8 Eh below the true PCl5 minimum),
 * where the bounded-step method converges from both — water 26 iterations, PCl5
 * 34, cyclopropenyl cation 55, cyclopropene 140, cyclopropyl cation 218 — and
 * reaches the same minima. The hand-rolled loop this replaces (energy
 * backtracking, no Armijo condition) stalled on the strained cases the tier
 * exists for; the library's does not.
 */
export async function optimizeWithGfn2(
  input: Molecule,
  locateFile?: (path: string) => string,
): Promise<Gfn2Result | null> {
  const molecule = fillMissingHydrogens(input);
  const count = molecule.atoms.length;
  if (count === 0) return null;

  const M = await (locateFile ? loadGfn2(locateFile) : loadGfn2());
  const totalCharge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
  const unpaired = Math.max(0, (molecule.multiplicity ?? 1) - 1);

  // Angstrom in, for the constructor only.
  const startAngstrom = molecule.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const toBohrMat = (flatAngstrom: number[]) =>
    toMat3N(M, flatAngstrom.map((v) => v / BOHR_PER_ANGSTROM), count);
  const buildCalculator = () => {
    const calc = M.XtbCalculator.fromMolecule(
      new M.Molecule(M.IVec.fromArray(molecule.atoms.map((a) => elementToZ(a.element))), toMat3N(M, startAngstrom, count)),
    );
    calc.charge = totalCharge;
    calc.numUnpairedElectrons = unpaired;
    return calc;
  };

  // The engine throws on some trial geometries: a wild line-search trial can
  // fail the SCC, and the analytic gradient throws outright when the
  // multipole-on SCC does not converge (measured on PCl5: 2 of 289 calls). The
  // library has no failure channel, so a failed evaluation is reported as the
  // sentinel energy above, which the line search rejects. If nothing has
  // succeeded yet, there is no run to save: abort, and the caller falls back
  // to MMFF94.
  // One oracle per optimiser attempt: each carries its own baseline for the
  // spurious-drop check and its own abort budgets, so the fallback starts
  // clean. `calc` is that attempt's engine instance.
  const makeOracle = (
    calc: ReturnType<typeof buildCalculator>,
    budgets: { engineFailures: number; spuriousDrops: number; calls: number },
  ) => {
    let hasValidEvaluation = false;
    let bestEnergy = Infinity;
    let engineFailures = 0;
    let spuriousDrops = 0;
    let calls = 0;
    const oracle = (work: LibraryMolecule) => {
      calls += 1;
      if (calls > budgets.calls) throw new Error('GFN2: aborting — too many evaluations for this start');
      const flatAngstrom = work.atoms.flatMap((a) => [a.x, a.y, a.z]);
      try {
        calc.updateStructure(toBohrMat(flatAngstrom));
        const result = calc.energyAndGradient(false, 1e-3);
        if (!Number.isFinite(result.energy) || calc.lastResult()?.converged === false) {
          throw new Error('GFN2: the SCC did not converge at a trial geometry');
        }
        if (Number.isFinite(bestEnergy) && result.energy < bestEnergy - SPURIOUS_DROP_LIMIT_HARTREE) {
          if (++spuriousDrops > budgets.spuriousDrops) throw new Error('GFN2: aborting on spurious SCF solutions');
          throw new Error('GFN2: spurious SCF solution (implausible energy drop)');
        }
        const gradient: number[][] = [];
        for (let a = 0; a < count; a++) {
          const row = [
            result.gradient.get(0, a) * FORCE_UNIT,
            result.gradient.get(1, a) * FORCE_UNIT,
            result.gradient.get(2, a) * FORCE_UNIT,
          ];
          if (!row.every(Number.isFinite)) throw new Error('GFN2: non-finite gradient');
          gradient.push(row);
        }
        hasValidEvaluation = true;
        bestEnergy = Math.min(bestEnergy, result.energy);
        return { energy: energyComponents(result.energy), gradient };
      } catch (error) {
        if (!hasValidEvaluation) throw error;
        // Past a budget this surface is not one for this optimiser: abort the
        // run so the next rung can take it (the exception leaves the library,
        // which has no failure channel of its own).
        if (++engineFailures > budgets.engineFailures) throw error;
        return {
          energy: energyComponents(REJECTED_EVALUATION_ENERGY),
          gradient: work.atoms.map(() => [0, 0, 0]),
        };
      }
    };
    return oracle;
  };

  // The optimiser ladder, both rungs the library's own: L-BFGS (fast, and what
  // the app's real starts converge to), then steepest descent at a bounded step
  // (the library's documented answer to a pathological starting geometry).
  const started = performance.now();
  const options = {
    max_iterations: MAX_ITERATIONS,
    criterion: 'max' as const,
    gradient_tolerance: GRADIENT_TOLERANCE_KCAL_MOL_A,
  };
  let libraryResult: OptimizationResult | null = null;
  let calc = buildCalculator();
  try {
    libraryResult = optimize_lbfgs(toMMFFMol(molecule), makeOracle(calc, {
      engineFailures: MAX_ENGINE_FAILURES.lbfgs,
      spuriousDrops: MAX_SPURIOUS_DROPS,
      calls: MAX_CALLS.lbfgs,
    }), options);
  } catch {
    libraryResult = null;
  }
  if (!libraryResult?.converged) {
    // A fresh engine instance: the first rung's thrash leaves the SCF warm
    // start on whatever it last touched, and the fallback must begin from the
    // molecule, not from that state.
    calc = buildCalculator();
    try {
      libraryResult = optimize_steepest_descent(toMMFFMol(molecule), makeOracle(calc, {
        engineFailures: MAX_ENGINE_FAILURES.fallback,
        spuriousDrops: MAX_SPURIOUS_DROPS,
        calls: MAX_CALLS.fallback,
      }), {
        ...options,
        initial_step_size: FALLBACK_STEP_ANGSTROM,
      });
    } catch {
      // The fallback refused this start too; keep whatever the first rung
      // managed, or nothing.
    }
  }
  // Nothing ran at all: no geometry rather than a wrong one — the caller falls
  // back to MMFF94.
  if (!libraryResult) return null;

  const { molecule: optimised, iterations, converged } = libraryResult;
  let energyHartree = libraryResult.energy.total;
  if (optimised.atoms.length !== count) return null;

  // Charges and the verdict must describe the geometry we return: the
  // library's last oracle call can be a rejected trial. One evaluation at the
  // accepted point puts the engine's cache there (one SCF out of hundreds).
  const finalAngstrom = optimised.atoms.flatMap((a) => [a.x, a.y, a.z]);
  let charges: number[] | null = null;
  try {
    calc.updateStructure(toBohrMat(finalAngstrom));
    energyHartree = calc.energyAndGradient(false, 1e-3).energy;
    const q = calc.charges();
    if (q.size() === count) {
      charges = [];
      for (let i = 0; i < count; i++) charges.push(q.get(i));
    }
  } catch {
    // The accepted point itself did not evaluate: no charges (the geometry
    // and the optimiser's own energy are still returned), and no verdict.
  }

  // Minimum or saddle? A gradient-based stop cannot tell them apart — a
  // saddle has zero gradient too — so a converged run is only called a
  // minimum when the curvature agrees. One numerical Hessian at the returned
  // geometry; the raw matrix is enough for a sign verdict (mass weighting and
  // rigid-body projection only matter for a frequency report).
  let lowestHessianMode: number | null = null;
  if (converged && count <= MAX_HESSIAN_ATOMS) {
    try {
      const H = calc.hessian(HESSIAN_STEP_BOHR);
      const dim = H.rows();
      const matrix: number[][] = [];
      for (let i = 0; i < dim; i++) {
        const row: number[] = [];
        for (let j = 0; j < dim; j++) row.push(H.get(i, j));
        matrix.push(row);
      }
      lowestHessianMode = jacobiSymmetric(matrix).values[0] ?? null;
    } catch {
      // No verdict rather than a wrong one.
    }
  }

  const refined: Molecule = {
    ...molecule,
    atoms: molecule.atoms.map((atom, i) => ({
      ...atom,
      x: optimised.atoms[i].x,
      y: optimised.atoms[i].y,
      z: optimised.atoms[i].z,
    })),
  };
  try {
    calc.delete?.();
  } catch {
    /* releasing the handle is best-effort */
  }
  return {
    molecule: refined,
    energyHartree,
    iterations,
    converged,
    milliseconds: performance.now() - started,
    charges,
    lowestHessianMode,
  };
}

self.onmessage = async (e: MessageEvent<{ id: number; molecule: Molecule }>) => {
  const { id, molecule } = e.data;
  try {
    self.postMessage({ id, result: await optimizeWithGfn2(molecule) });
  } catch (error) {
    // Never fail silently: the caller surfaces this, and a console line keeps
    // it diagnosable in a worker's devtools too.
    const message = String((error as Error)?.message ?? error);
    console.error('[gfn2] refinement failed:', message);
    self.postMessage({ id, result: null, error: message });
  }
};
