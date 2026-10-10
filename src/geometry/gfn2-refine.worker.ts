/// <reference lib="webworker" />
/// <reference types="vite/client" />
/**
 * GFN2-xTB geometry optimisation, off the main thread.
 *
 * The app's one local geometry optimiser: a real semiempirical calculation
 * (extended tight binding) rather than a force field, structurally right where
 * a force field is not (hypervalent centres, untabled elements). When it cannot
 * deliver a minimum the pipeline shows the unrefined start and says so — there
 * is no second engine behind it. Costs ~3 MB of wasm, loaded at startup.
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
import { atomicNumber, lowestMultiplicity } from '../chem/elements';
import { normalModes, type NormalMode } from '../chem/gfn2-xtb/normal-modes';
import { alignToPrincipalAxes, type PrincipalFrame } from '../chem/extended-huckel/align-principal-axes';
import { levelForFraction } from '../chem/extended-huckel/mo-surface';
import { marchSignedField } from '../utils/march-tetrahedra';
import { jacobiSymmetric } from '../utils/eigen';
import {
  optimize_lbfgs,
  optimize_steepest_descent,
  set_parameter_warning_handler,
  type Molecule as LibraryMolecule,
  type OptimizationResult,
} from 'mmff94-ts';
import { toMMFFMol } from './mmff94-molecule';
import createOccModule from '../../vendor/occ-wasm/occjs.js';
import wasmUrl from '../../vendor/occ-wasm/occjs.wasm?url';
import dataUrl from '../../vendor/occ-wasm/occjs.data?url';
import type { Molecule } from '../mol-parser';

// The library is only the stepper here — the energy and gradient are GFN2's —
// so its report on MMFF94 parameter coverage, printed for every rung, describes
// a force field this worker never evaluates. This worker's copy only; the
// charge model's gap report is read elsewhere and is unaffected.
set_parameter_warning_handler(null);

const ANGSTROM_PER_BOHR = 0.529177210903;
/** Eh/bohr → kcal/mol/Å: the engine's gradient unit against the library's. */
const FORCE_UNIT = 627.509474 / ANGSTROM_PER_BOHR;
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
/**
 * OCC's analytic GFN2 gradient is not the exact derivative of its energy, and
 * the error grows with how polar the molecule is. Measured 2026-10-05 against
 * central differences of the engine's own energy (h = 1e-3 bohr, SCF converged
 * to ~1e-11 Eh, so the reference is good to ~1e-8): P₄ 1e-7, water 9e-6,
 * SF₆ and CHFCl₂ 6e-5, ethene 9e-5, methanol 2.2e-4, the cyclopropenyl anion
 * 4.6e-4 — and 1e-3 where its optimisation stalls, ten times the 1e-4
 * convergence gate. An optimiser steered by that gradient cannot satisfy its
 * line search near the minimum and grinds (the anion: 3 400 evaluations at a
 * flat energy). The engine's NUMERICAL gradient is exact to the step, at 6N
 * energies apiece, so it is the third rung: started from wherever the analytic
 * rungs stopped, gated on size, with its own budget.
 */
const NUMERICAL_GRADIENT_STEP_BOHR = 1e-3;
const MAX_NUMERICAL_GRADIENT_ATOMS = 24;
const MAX_NUMERICAL_CALLS = 400;
/**
 * The whole run's time budget (ms): every rung, every saddle escape. This is a
 * teaching tool, and a good-enough structure in seconds beats a perfect one in
 * minutes — measured on the app's examples, the organics and the hypervalent
 * main-group cases converge in 0.1–12 s, while a hostile start (a metal
 * complex the embedder knows nothing about) burned 15–118 s to reach nothing.
 * Past the budget the run stops and reports what it has; the call budgets
 * above still bound each rung inside it.
 */
const TIME_BUDGET_MS = 30_000;
/** Berny's steps before it hands over to the ladder — it converges the app's
 *  molecules in 6–35, so a run past this is not going to. */
const BERNY_MAX_STEPS = 100;
/** The exact gradient a Berny-converged point must meet, Eh/bohr: Berny's own
 *  default gate (Gaussian's max-force 4.5e-4), held to the true gradient. */
const BERNY_GRADIENT_MAX = 4.5e-4;
/** Above this atom count the Hessian verdict is skipped: the cost is 6N
 *  gradient evaluations (measured on the vendored engine, 2026-10-02: 45 ms at
 *  N=3, 182 ms at N=8, 653 ms at N=13, 3.1 s at N=21), and the verdict is a
 *  convenience, not the geometry. */
const MAX_HESSIAN_ATOMS = 16;
/** Finite-difference step for the numerical Hessian, in bohr. */
const HESSIAN_STEP_BOHR = 0.005;
/** Below this lowest Hessian eigenvalue (Eh/bohr²) the stationary point is a
 *  saddle: the noise floor is ±0.003, a real imaginary mode of the planar
 *  cyclopropenyl anion −0.16 (the measurements are in NOTES.md, and
 *  gfn2-refine.ts carries the same number for the display). */
const SADDLE_THRESHOLD = -0.02;
/** How far a saddle is pushed down its imaginary mode before re-optimising, in
 *  bohr (the length of the 3N displacement). Measured 2026-10-02 on the planar
 *  cyclopropenyl anion: 0.30 bohr along the mode lowers the energy by 4.15
 *  kcal/mol on both sides, enough for the optimiser to leave the saddle and
 *  small enough not to jump a basin. */
const SADDLE_ESCAPE_BOHR = 0.3;
/** Saddle escapes before the run gives up and reports what it has. A
 *  higher-order saddle can take one push per imaginary mode; past two, the
 *  start is the problem, not the curvature. */
const MAX_SADDLE_ESCAPES = 2;
/** Evaluations between progress reports — frequent enough to move a counter,
 *  rare enough that the messages cost nothing next to an SCF. */
const PROGRESS_EVERY = 10;

/** What a long run tells the page while it works. */
export interface Gfn2Progress {
  /** 'optimising' (either rung), 'curvature' (the Hessian), 'saddle' (pushed
   *  off a saddle and re-optimising). */
  stage: 'optimising' | 'curvature' | 'saddle';
  /** Energy evaluations so far, over the whole run. */
  evaluations: number;
  /** Lowest energy seen so far (hartree), or null before the first. */
  energyHartree: number | null;
}

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
   *  criterion cannot tell them apart) — which, after the escapes, means the
   *  run could not get off it. */
  lowestHessianMode: number | null;
  /** How many times the run was pushed off a saddle and re-optimised. */
  saddleEscapes: number;
  /** The spin multiplicity the run used: the molecule's own, or the lowest
   *  its electron count allows (singlet if even, doublet if odd). */
  multiplicity: number;
  /** The harmonic vibrations at the returned minimum, lowest first, indexed
   *  like `molecule.atoms`; null when the Hessian check did not run (above
   *  the size gate, not converged) or the point is a saddle. */
  vibrations: NormalMode[] | null;
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
      // The SCF prints its table for every energy evaluation straight to
      // stdout — outside OCC's logger, so no log level silences it — and an
      // optimisation makes thousands of evaluations: 409 851 console lines for
      // one cyclopropenyl-anion run (measured 2026-10-05), slower to print than
      // to compute. Emscripten routes stdout through `print`; drop it. stderr
      // (`printErr`) is left alone, so a real error still reaches the console.
      const module = await createOccModule({ locateFile, print: () => {} });
      module.setNumThreads?.(1);
      module.setDataDirectory?.('/');
      // OCC's own logger, by name: the LogLevel enum binding does not map onto
      // spdlog's levels — passing LogLevel.WARN made it four times noisier.
      module.setLogLevelString?.('warn');
      return module;
    })().catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

function elementToZ(element: string): number {
  const z = atomicNumber(element);
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
 * The optimiser is OCC's own Berny (internal coordinates — 6–35 steps on the
 * app's molecules), with the converged point checked against the exact
 * gradient because OCC's analytic one is wrong for polar species (see
 * `relax`). When Berny cannot finish, mmff94-ts's Cartesian optimisers take
 * over through the library's `EnergyGradientFn` oracle (see `ladder`).
 *
 * Then the curvature: a converged run is only a minimum if the Hessian agrees.
 * If it is a saddle, the structure is pushed down the imaginary mode both ways,
 * each push re-optimised, and the lower minimum kept — at most
 * MAX_SADDLE_ESCAPES times.
 */
export async function optimizeWithGfn2(
  input: Molecule,
  locateFile?: (path: string) => string,
  onProgress?: (progress: Gfn2Progress) => void,
): Promise<Gfn2Result | null> {
  const molecule = fillMissingHydrogens(input);
  const count = molecule.atoms.length;
  if (count === 0) return null;

  const M = await (locateFile ? loadGfn2(locateFile) : loadGfn2());
  const totalCharge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
  // A sketch carries no spin: unless one was chosen (or an example sets it),
  // run at the lowest the electron count allows — an odd count cannot be a
  // singlet, and the engine fails outright if asked for one.
  const multiplicity = molecule.multiplicity ?? lowestMultiplicity(molecule.atoms);
  const unpaired = multiplicity - 1;

  // Angstrom in, for the constructor only.
  const startAngstrom = molecule.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const toBohrMat = (flatAngstrom: number[]) =>
    toMat3N(M, flatAngstrom.map((v) => v / ANGSTROM_PER_BOHR), count);
  const buildCalculator = () => {
    const calc = M.XtbCalculator.fromMolecule(
      new M.Molecule(M.IVec.fromArray(molecule.atoms.map((a) => elementToZ(a.element))), toMat3N(M, startAngstrom, count)),
    );
    calc.charge = totalCharge;
    calc.numUnpairedElectrons = unpaired;
    return calc;
  };

  // Progress, over the whole run — every rung, every saddle escape.
  let evaluations = 0;
  const deadline = performance.now() + TIME_BUDGET_MS;
  let lowestEnergy: number | null = null;
  let stage: Gfn2Progress['stage'] = 'optimising';
  const report = () => onProgress?.({ stage, evaluations, energyHartree: lowestEnergy });

  // The engine throws on some trial geometries: a wild line-search trial can
  // fail the SCC, and the analytic gradient throws outright when the
  // multipole-on SCC does not converge (measured on PCl5: 2 of 289 calls). The
  // library has no failure channel, so a failed evaluation is reported as the
  // sentinel energy above, which the line search rejects. If nothing has
  // succeeded yet, there is no run to save: abort, and the caller shows the
  // unrefined start.
  // One oracle per optimiser attempt: each carries its own baseline for the
  // spurious-drop check and its own abort budgets, so the fallback starts
  // clean. `calc` is that attempt's engine instance.
  const makeOracle = (
    calc: ReturnType<typeof buildCalculator>,
    budgets: { engineFailures: number; spuriousDrops: number; calls: number },
    numerical = false,
  ) => {
    let hasValidEvaluation = false;
    let bestEnergy = Infinity;
    let engineFailures = 0;
    let spuriousDrops = 0;
    let calls = 0;
    const oracle = (work: LibraryMolecule) => {
      calls += 1;
      if (calls > budgets.calls) throw new Error('GFN2: aborting — too many evaluations for this start');
      if (performance.now() > deadline) throw new Error('GFN2: aborting — out of time');
      evaluations += 1;
      if (evaluations % PROGRESS_EVERY === 0) report();
      const flatAngstrom = work.atoms.flatMap((a) => [a.x, a.y, a.z]);
      try {
        calc.updateStructure(toBohrMat(flatAngstrom));
        // the second argument is the finite-difference step, read only when
        // the gradient is numerical
        const result = calc.energyAndGradient(numerical, NUMERICAL_GRADIENT_STEP_BOHR);
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
        lowestEnergy = lowestEnergy === null ? result.energy : Math.min(lowestEnergy, result.energy);
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

  const options = {
    max_iterations: MAX_ITERATIONS,
    criterion: 'max' as const,
    gradient_tolerance: GRADIENT_TOLERANCE_KCAL_MOL_A,
  };

  /** The molecule at a library result's coordinates. */
  const at = (result: OptimizationResult): Molecule => ({
    ...molecule,
    atoms: molecule.atoms.map((atom, i) => ({
      ...atom, x: result.molecule.atoms[i].x, y: result.molecule.atoms[i].y, z: result.molecule.atoms[i].z,
    })),
  });

  /**
   * The fallback when Berny cannot finish (see `relax`): a ladder of Cartesian
   * rungs from `start` (Angstrom coordinates, the molecule's atom order), each
   * run only if the one before did not converge, each on a fresh engine
   * instance (a thrashing rung leaves the SCF's warm start wherever it last
   * touched):
   *
   *   1. L-BFGS on the analytic gradient, from the start;
   *   2. steepest descent at a bounded step, from the start — the library's
   *      answer to a pathological start;
   *   3. L-BFGS on the NUMERICAL gradient, from the lowest point the first two
   *      reached — for a surface where the analytic gradient is too inexact to
   *      converge on (see NUMERICAL_GRADIENT_STEP_BOHR).
   *
   * Then one evaluation at the accepted point, so the engine's cache (the
   * charges, the Hessian) describes the geometry returned — the library's
   * last oracle call can be a rejected trial. Null when no rung produced
   * anything.
   */
  const ladder = (start: Molecule) => {
    // a holder, not a bare let: the rungs assign it from inside a closure
    const ladder: { best: OptimizationResult | null } = { best: null };
    let iterations = 0;
    let calc = buildCalculator();
    const rung = (run: (c: ReturnType<typeof buildCalculator>) => OptimizationResult) => {
      release(calc);
      calc = buildCalculator();
      try {
        const result = run(calc);
        iterations += result.iterations;
        // a converged result always wins; otherwise keep the lowest point seen
        if (result.converged || !ladder.best || result.energy.total < ladder.best.energy.total) ladder.best = result;
      } catch {
        // this rung refused the start; the next one gets its turn
      }
    };
    rung((c) => optimize_lbfgs(toMMFFMol(start), makeOracle(c, {
      engineFailures: MAX_ENGINE_FAILURES.lbfgs, spuriousDrops: MAX_SPURIOUS_DROPS, calls: MAX_CALLS.lbfgs,
    }), options));
    if (!ladder.best?.converged) {
      rung((c) => optimize_steepest_descent(toMMFFMol(start), makeOracle(c, {
        engineFailures: MAX_ENGINE_FAILURES.fallback, spuriousDrops: MAX_SPURIOUS_DROPS, calls: MAX_CALLS.fallback,
      }), { ...options, initial_step_size: FALLBACK_STEP_ANGSTROM }));
    }
    if (!ladder.best?.converged && count <= MAX_NUMERICAL_GRADIENT_ATOMS) {
      const from = ladder.best ? at(ladder.best) : start;
      rung((c) => optimize_lbfgs(toMMFFMol(from), makeOracle(c, {
        engineFailures: MAX_ENGINE_FAILURES.lbfgs, spuriousDrops: MAX_SPURIOUS_DROPS, calls: MAX_NUMERICAL_CALLS,
      }, true), options));
    }
    const result = ladder.best;
    if (!result || result.molecule.atoms.length !== count) {
      release(calc);
      return null;
    }
    const geometry = at(result);
    let energy = result.energy.total;
    let evaluates = true;
    try {
      calc.updateStructure(toBohrMat(geometry.atoms.flatMap((a) => [a.x, a.y, a.z])));
      energy = calc.energyAndGradient(false, NUMERICAL_GRADIENT_STEP_BOHR).energy;
    } catch {
      // The accepted point itself did not evaluate: the geometry and the
      // optimiser's energy stand, but nothing read from the cache would.
      evaluates = false;
    }
    return { geometry, energy, iterations, converged: result.converged, calc, evaluates };
  };
  type Relaxed = NonNullable<ReturnType<typeof ladder>>;

  /**
   * OCC's Berny optimiser from `start`: internal coordinates, a model Hessian
   * and a trust radius, driven step by step with the engine's energy and
   * gradient (analytic, or `numerical`). On the app's own starts it reaches
   * the ladder's minima to 1e-6 Eh in 6–12 steps — benzene 0.1 s against the
   * ladder's 3.5 s, PCl₅ 0.2 s against 6.8 s (NOTES.md). Converged is Berny's
   * own test, Gaussian's default gate (max 4.5e-4, rms 1.5e-4). Null when the
   * engine fails on a step; the calculator is left at the last point
   * evaluated, which on convergence is the point returned.
   */
  const berny = (start: Molecule, numerical: boolean): Relaxed | null => {
    const startAngstrom = start.atoms.flatMap((a) => [a.x, a.y, a.z]);
    const calc = buildCalculator();
    const shape = new M.Molecule(M.IVec.fromArray(start.atoms.map((a) => elementToZ(a.element))), toMat3N(M, startAngstrom, count));
    const optimiser = new M.BernyOptimizer(shape);
    let positions = startAngstrom;
    let energy = Number.NaN;
    let steps = 0;
    let converged = false;
    try {
      for (; steps < BERNY_MAX_STEPS && performance.now() < deadline; steps++) {
        calc.updateStructure(toBohrMat(positions));
        const result = calc.energyAndGradient(numerical, NUMERICAL_GRADIENT_STEP_BOHR);
        if (!Number.isFinite(result.energy) || calc.lastResult()?.converged === false) {
          throw new Error('GFN2: the SCC did not converge at a Berny step');
        }
        evaluations += numerical ? 1 + 6 * count : 1;
        energy = result.energy;
        lowestEnergy = lowestEnergy === null ? energy : Math.min(lowestEnergy, energy);
        report();
        optimiser.update(result.energy, result.gradient);
        if (optimiser.step()) {
          converged = true;
          break;
        }
        const next = optimiser.getNextGeometry().positions(); // Angstrom
        positions = Array.from({ length: 3 * count }, (_, k) => next.get(k % 3, Math.floor(k / 3)));
      }
    } catch {
      release(calc);
      return null;
    } finally {
      release(optimiser);
      release(shape);
    }
    if (!Number.isFinite(energy)) {
      release(calc);
      return null;
    }
    const geometry: Molecule = {
      ...molecule,
      atoms: molecule.atoms.map((atom, i) => ({
        ...atom, x: positions[3 * i], y: positions[3 * i + 1], z: positions[3 * i + 2],
      })),
    };
    return { geometry, energy, iterations: steps, converged, calc, evaluates: true };
  };

  /** The exact (numerical) gradient's largest component at a relaxed point,
   *  Eh/bohr — and the cache put back at that point afterwards, since the
   *  charges and the Hessian are read from it. */
  const exactGradientMax = (relaxed: Relaxed): number => {
    const flatBohr = toBohrMat(relaxed.geometry.atoms.flatMap((a) => [a.x, a.y, a.z]));
    relaxed.calc.updateStructure(flatBohr);
    const exact = relaxed.calc.energyAndGradient(true, NUMERICAL_GRADIENT_STEP_BOHR);
    evaluations += 1 + 6 * count;
    let largest = 0;
    for (let a = 0; a < count; a++) {
      for (let c = 0; c < 3; c++) largest = Math.max(largest, Math.abs(exact.gradient.get(c, a)));
    }
    relaxed.calc.updateStructure(toBohrMat(relaxed.geometry.atoms.flatMap((a) => [a.x, a.y, a.z])));
    relaxed.calc.energyAndGradient(false, NUMERICAL_GRADIENT_STEP_BOHR);
    return largest;
  };

  /**
   * One optimisation from `start`. Berny first, on the analytic gradient —
   * fast, and right for most molecules. But OCC's analytic GFN2 gradient is
   * wrong for polar species — a known upstream limitation (OCC's README: the
   * multipole-on gradient misses the AO-multipole integral derivatives, a
   * ~1 mHa gap; no binding reaches the charge-only variant — reported as
   * peterspackman/occ#58, so revisit this check when it is fixed). Measured against
   * the Fortran xTB oracle: methanol 2.2e-4, the cyclopropenyl anion 4.7e-4
   * Eh/bohr, while xTB's own analytic gradient matches OCC's finite
   * differences to 1e-6. Berny believes it: on the anion it reported convergence 4.7 kcal/mol above
   * the minimum. So a converged point is checked with the exact gradient, and
   * when they disagree Berny goes on from there on the exact gradient. Below
   * 24 atoms — above, the check costs more than it is worth and the analytic
   * answer stands. When Berny cannot finish, the Cartesian ladder runs from
   * the start, as it did before Berny.
   */
  const relax = (start: Molecule): Relaxed | null => {
    const fast = berny(start, false);
    if (fast?.converged) {
      if (count > MAX_NUMERICAL_GRADIENT_ATOMS || exactGradientMax(fast) <= BERNY_GRADIENT_MAX) return fast;
      const exact = berny(fast.geometry, true);
      if (exact?.converged) {
        release(fast.calc);
        return { ...exact, iterations: fast.iterations + exact.iterations };
      }
      if (exact) release(exact.calc);
    }
    if (fast) release(fast.calc);
    return ladder(start);
  };

  /** The lowest Hessian mode at a relaxed point — the eigenvalue (Eh/bohr²)
   *  and its eigenvector, per atom — or null when the check is skipped or
   *  fails. The raw matrix is enough for a sign verdict and a direction (mass
   *  weighting and rigid-body projection only matter for a frequency report).
   *  OCC's Hessian rows are atom-major (x₀ y₀ z₀ x₁ …), unlike its gradient —
   *  measured: a rigid translation gives |H·t| ≈ 1e-6 that way and ≈ 1 the
   *  other. */
  const curvature = (relaxed: Relaxed) => {
    if (!relaxed.converged || !relaxed.evaluates || count > MAX_HESSIAN_ATOMS) return null;
    stage = 'curvature';
    report();
    try {
      const H = relaxed.calc.hessian(HESSIAN_STEP_BOHR);
      const dim = H.rows();
      const matrix: number[][] = [];
      for (let i = 0; i < dim; i++) {
        const row: number[] = [];
        for (let j = 0; j < dim; j++) row.push(H.get(i, j));
        matrix.push(row);
      }
      const { values, vectors } = jacobiSymmetric(matrix);
      const mode = molecule.atoms.map((_, a) => [vectors[3 * a][0], vectors[3 * a + 1][0], vectors[3 * a + 2][0]]);
      return { value: values[0], mode, matrix };
    } catch {
      return null; // no verdict rather than a wrong one
    }
  };

  const started = performance.now();
  let best = relax(molecule);
  // Nothing ran at all: no geometry rather than a wrong one — the caller shows
  // the unrefined start.
  if (!best) return null;
  let iterations = best.iterations;
  let lowest = curvature(best);
  let saddleEscapes = 0;

  // A saddle has zero gradient too, so the optimiser stops on it. Push the
  // structure down the imaginary mode — both ways, because the two sides can
  // lead to different minima — re-optimise each, and keep the lower converged
  // result. Its curvature is checked again: a higher-order saddle may need
  // another push.
  while (lowest && lowest.value < SADDLE_THRESHOLD && saddleEscapes < MAX_SADDLE_ESCAPES
    && performance.now() < deadline) {
    saddleEscapes += 1;
    stage = 'saddle';
    report();
    const from: Relaxed = best;
    const push = SADDLE_ESCAPE_BOHR * ANGSTROM_PER_BOHR; // Angstrom, along a unit 3N vector
    let escaped: Relaxed | null = null;
    for (const sign of [1, -1]) {
      const start: Molecule = {
        ...from.geometry,
        atoms: from.geometry.atoms.map((atom, a) => ({
          ...atom,
          x: atom.x + sign * push * lowest!.mode[a][0],
          y: atom.y + sign * push * lowest!.mode[a][1],
          z: atom.z + sign * push * lowest!.mode[a][2],
        })),
      };
      const candidate = relax(start);
      if (!candidate) continue;
      iterations += candidate.iterations;
      if (candidate.converged && candidate.evaluates && (!escaped || candidate.energy < escaped.energy)) {
        if (escaped) release(escaped.calc);
        escaped = candidate;
      } else {
        release(candidate.calc);
      }
    }
    // Only a lower point is progress; otherwise keep the saddle and say so.
    if (!escaped || escaped.energy >= from.energy) {
      if (escaped) release(escaped.calc);
      break;
    }
    release(from.calc);
    best = escaped;
    lowest = curvature(best);
  }

  let charges: number[] | null = null;
  if (best.evaluates) {
    try {
      const q = best.calc.charges();
      if (q.size() === count) {
        charges = [];
        for (let i = 0; i < count; i++) charges.push(q.get(i));
      }
    } catch {
      // no charges rather than another geometry's
    }
  }
  release(best.calc);
  return {
    // the spin rides along, so the views that read it (the MO filling) know
    molecule: multiplicity > 1 ? { ...best.geometry, multiplicity } : best.geometry,
    multiplicity,
    energyHartree: best.energy,
    iterations,
    converged: best.converged,
    milliseconds: performance.now() - started,
    charges,
    lowestHessianMode: lowest?.value ?? null,
    saddleEscapes,
    // the vibrations come free with the curvature check: the same Hessian,
    // mass-weighted — and only mean something at a minimum
    vibrations: lowest && lowest.value >= SADDLE_THRESHOLD ? normalModes(best.geometry.atoms, lowest.matrix) : null,
  };
}

/** Releasing an engine handle is best-effort. */
function release(calc: { delete?: () => void }): void {
  try {
    calc.delete?.();
  } catch {
    /* nothing to do */
  }
}

/** Hartree to electronvolt (CODATA 2018). */
const EV_PER_HARTREE = 27.211386245988;
/** e·bohr to debye. */
const DEBYE_PER_E_BOHR = 2.541746473;
/** e·Å to debye. */
const DEBYE_PER_E_ANGSTROM = DEBYE_PER_E_BOHR / ANGSTROM_PER_BOHR;

/** One spin channel's molecular orbitals, lowest first. */
export interface Gfn2OrbitalSet {
  /** Orbital energies, eV. */
  energies: number[];
  /** Occupations: 0–2 for a closed shell, 0–1 for one spin channel. */
  occupations: number[];
  /** Each orbital's Mulliken share on each atom, [orbital][atom], summing to
   *  1 over the atoms — which atoms an orbital lives on. */
  atomShares: number[][];
}

/**
 * GFN2-xTB's electronic structure at a structure exactly as given — one single
 * point, no optimisation and no implicit hydrogens, so every array indexes the
 * displayed atoms one to one. This is how every structure on screen (a
 * PubChem conformer, an example, GFN2's own result) gets the app's default
 * charges and the rest of what one SCC knows.
 */
export interface Gfn2Properties {
  /** Mulliken SCC charges per atom, electrons. */
  charges: number[];
  /** The Wiberg bond order of each bond in `molecule.bonds`, in that order. */
  bondOrders: number[];
  /** Spin population (α − β) per atom; null for a closed shell. */
  spin: number[] | null;
  /** The spin multiplicity the single point ran at. */
  multiplicity: number;
  /** The full GFN2 dipole, debye: the point charges plus the atomic dipoles.
   *  Null from an engine build without the dipole binding. */
  dipole: [number, number, number] | null;
  /** Each atom's own dipole (CAMM), e·Å, in the molecule's axes: how far its
   *  share of the electrons sits off its nucleus. With the charges they make
   *  up the full dipole, and they belong in the ESP. Null from an engine build
   *  without the binding. */
  atomicDipoles: Array<[number, number, number]> | null;
  /** Each atom's own traceless quadrupole (CAMM), e·Å², in the molecule's
   *  axes, as [xx, xy, yy, xz, yz, zz] in Buckingham's ½(3xᵢxⱼ − r²δᵢⱼ): the
   *  next term of the same expansion — the shape of each atom's electron
   *  cloud beyond its offset (a π cloud's two lobes). For the ESP. */
  atomicQuadrupoles: Array<[number, number, number, number, number, number]> | null;
  /** The molecular orbitals: one set for a closed shell, α and β for an open
   *  one. Their shapes are drawn by `orbitalField`, which needs this run's
   *  calculator, so it is kept alive under `key` until the next run. */
  alpha: Gfn2OrbitalSet;
  beta: Gfn2OrbitalSet | null;
  key: number;
  /** The basis functions, described so the extended-Hückel machinery (irrep
   *  labels, degenerate-set canonicalization) can read them: atom, s/p/d, and
   *  a p's axis or a d's shape in the principal-axis frame the single point
   *  ran in. Each function's sign is folded into `coefficients` and
   *  `overlap`, so a p always points along +axis. Null from an engine build
   *  without the AO bindings. */
  orbitalBasis: Gfn2BasisFunction[] | null;
  /** The frame the orbitals are expressed in (see align-principal-axes). */
  frame: PrincipalFrame;
  /** MO coefficients, [orbital][AO], sign-normalised as `orbitalBasis` says. */
  coefficients: { alpha: number[][]; beta: number[][] | null };
  /** The AO overlap matrix, sign-normalised likewise. */
  overlap: number[][];
}

/** One GFN2 basis function, identified by probing its values (see
 *  `describeBasis`): OCC's real-harmonic order is its own business. */
export interface Gfn2BasisFunction {
  atomIndex: number;
  angular: 's' | 'p' | 'd';
  /** A p's axis in the frame; [0, 0, 0] for s and d. */
  axis: [number, number, number];
  /** Which real d function, in the extended-Hückel names. */
  d?: 'x2-y2' | 'z2' | 'xy' | 'xz' | 'yz';
}

// The calculator of the latest properties run, for `orbitalSurface`: its
// geometry (the frame's), and the sign each AO was flipped by. Orbital fields
// already built for it are cached by orbital, so a new level re-marches.
let kept: { key: number; calc: any; signs: number[]; frame: PrincipalFrame; fields: Map<string, OrbitalGrid> } | null = null;
let nextKey = 1;

/**
 * Which function each AO is, read off its values a bohr from its atom along
 * x, y, z and the three diagonals — so nothing depends on OCC's ordering or
 * sign conventions for the real spherical harmonics. A p is the axis where it
 * is non-zero; a d is told apart by its pattern (z² is twice as large along z
 * as along x or y, and opposite in sign; x²−y² is opposite along x and y).
 */
function describeBasis(M: any, calc: any, frameAtoms: Molecule['atoms']): { basis: Gfn2BasisFunction[]; signs: number[] } | null {
  if (typeof calc.aoAtoms !== 'function' || typeof calc.orbitalValues !== 'function') return null;
  const aoAtom = vector(calc.aoAtoms());
  const aoL = vector(calc.aoAngularMomenta());
  const n = aoAtom.length;
  const h = Math.SQRT1_2;
  const directions: Array<[number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [h, h, 0], [h, 0, h], [0, h, h]];
  const basis: Gfn2BasisFunction[] = [];
  const signs: number[] = [];
  const unit = M.Vec.create(n);
  for (let mu = 0; mu < n; mu++) {
    const atom = frameAtoms[aoAtom[mu]];
    const centre = [atom.x / ANGSTROM_PER_BOHR, atom.y / ANGSTROM_PER_BOHR, atom.z / ANGSTROM_PER_BOHR];
    const points = M.Mat3N.create(directions.length);
    directions.forEach((d, k) => { for (let c = 0; c < 3; c++) points.set(c, k, centre[c] + d[c]); });
    for (let nu = 0; nu < n; nu++) unit.set(nu, nu === mu ? 1 : 0);
    const values = calc.orbitalValues(points, unit);
    const v = directions.map((_, k) => values.get(0, k) as number);
    points.delete?.();
    values.delete?.();
    const [vx, vy, vz, vxy, vxz, vyz] = v;
    const scale = Math.max(...v.map(Math.abs)) || 1;
    const small = (x: number) => Math.abs(x) < 1e-3 * scale;
    let fn: Gfn2BasisFunction;
    let sign = 1;
    if (aoL[mu] === 0) {
      fn = { atomIndex: aoAtom[mu], angular: 's', axis: [0, 0, 0] };
    } else if (aoL[mu] === 1) {
      const magnitudes = [vx, vy, vz].map(Math.abs);
      const k = magnitudes.indexOf(Math.max(...magnitudes));
      const axis: [number, number, number] = [0, 0, 0];
      axis[k] = 1;
      sign = Math.sign([vx, vy, vz][k]) || 1;
      fn = { atomIndex: aoAtom[mu], angular: 'p', axis };
    } else if (aoL[mu] === 2) {
      let d: Gfn2BasisFunction['d'];
      if (small(vx) && small(vy) && small(vz)) {
        // xy, xz or yz: non-zero on one diagonal only
        const magnitudes = [vxy, vxz, vyz].map(Math.abs);
        const k = magnitudes.indexOf(Math.max(...magnitudes));
        d = (['xy', 'xz', 'yz'] as const)[k];
        sign = Math.sign([vxy, vxz, vyz][k]) || 1;
      } else if (small(vz)) {
        d = 'x2-y2';
        sign = Math.sign(vx) || 1;
      } else {
        d = 'z2';
        sign = Math.sign(vz) || 1;
      }
      fn = { atomIndex: aoAtom[mu], angular: 'd', axis: [0, 0, 0], d };
    } else {
      return null; // an f shell: GFN2 has none
    }
    basis.push(fn);
    signs.push(sign);
  }
  unit.delete?.();
  return { basis, signs };
}

/** A Mat (rows × cols) as nested arrays, [column][row] — one MO per column. */
function columns(mat: any): number[][] {
  const rows = mat.rows();
  const out: number[][] = [];
  for (let j = 0; j < mat.cols(); j++) {
    const column: number[] = [];
    for (let i = 0; i < rows; i++) column.push(mat.get(i, j));
    out.push(column);
  }
  return out;
}

function vector(v: any): number[] {
  return Array.from({ length: v.size() }, (_, i) => v.get(i) as number);
}

/** Each orbital's Mulliken share per atom: Σ over the atom's AOs of c_μ (S c)_μ. */
function atomShares(orbitals: number[][], overlap: any, aoAtom: number[], atomCount: number): number[][] {
  const n = aoAtom.length;
  return orbitals.map((c) => {
    const shares = new Array(atomCount).fill(0);
    for (let mu = 0; mu < n; mu++) {
      let sc = 0;
      for (let nu = 0; nu < n; nu++) sc += overlap.get(mu, nu) * c[nu];
      shares[aoAtom[mu]] += c[mu] * sc;
    }
    return shares;
  });
}

export async function propertiesAt(
  molecule: Molecule,
  locateFile?: (path: string) => string,
): Promise<Gfn2Properties | null> {
  const count = molecule.atoms.length;
  if (count === 0) return null;
  const M = await (locateFile ? loadGfn2(locateFile) : loadGfn2());
  // In the principal-axis frame — the one extended Hückel solves in — so a p
  // orbital here is the same px/py/pz as there, and the irrep labels and the
  // degenerate-set canonicalization can be shared. Energies, charges and bond
  // orders do not care; the dipole is turned back below.
  const frame = alignToPrincipalAxes(molecule);
  const angstrom = frame.atoms.flatMap((a) => [a.x, a.y, a.z]);
  const calc = M.XtbCalculator.fromMolecule(
    new M.Molecule(M.IVec.fromArray(molecule.atoms.map((a) => elementToZ(a.element))), toMat3N(M, angstrom, count)),
  );
  let keep = false;
  try {
    const multiplicity = molecule.multiplicity ?? lowestMultiplicity(molecule.atoms);
    calc.charge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
    calc.numUnpairedElectrons = multiplicity - 1;
    const energy = calc.singlePointEnergy();
    const result = calc.lastResult();
    if (!Number.isFinite(energy) || result?.converged === false) return null;
    const charges = vector(calc.charges());
    if (charges.length !== count) return null;

    const wiberg = calc.bondOrders();
    const bondOrders = molecule.bonds.map((b) => wiberg.get(b.atom1Index, b.atom2Index) as number);
    const magnetization = vector(calc.atomicMagnetization());
    const spin = magnetization.length === count ? magnetization : null;

    // The full dipole needs the Valence patch to OCC (see vendor/occ-wasm).
    let dipole: [number, number, number] | null = null;
    if (typeof calc.dipoleMoment === 'function') {
      // about the frame's origin (the centre of mass), in the frame's axes:
      // back to the molecule's axes and its coordinate origin (p + Q·r_com
      // for an ion, the same convention OCC's own dipole uses)
      const mu = calc.dipoleMoment();
      const inFrame = [mu.x(), mu.y(), mu.z()].map((v) => v * DEBYE_PER_E_BOHR);
      const [ax, ay, az] = frame.axes;
      const netCharge = molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
      dipole = [0, 1, 2].map((k) =>
        inFrame[0] * ax[k] + inFrame[1] * ay[k] + inFrame[2] * az[k]
        + netCharge * frame.origin[k] * DEBYE_PER_E_ANGSTROM,
      ) as [number, number, number];
    }

    // Per atom, the same turn back to the molecule's axes (a dipole does
    // not care about the origin), bohr to Å.
    let atomicDipoles: Array<[number, number, number]> | null = null;
    if (typeof calc.atomicDipoles === 'function') {
      const d = calc.atomicDipoles();
      if (d.cols() === count) {
        const [ax, ay, az] = frame.axes;
        atomicDipoles = molecule.atoms.map((_, a) => {
          const v = [d.get(0, a), d.get(1, a), d.get(2, a)].map((x) => x * ANGSTROM_PER_BOHR);
          return [0, 1, 2].map((k) => v[0] * ax[k] + v[1] * ay[k] + v[2] * az[k]) as [number, number, number];
        });
      }
    }

    // A rank-2 tensor turns twice: Θ_mol = R Θ R^T, R's columns the frame's
    // axes in the molecule's coordinates; bohr² to Å².
    let atomicQuadrupoles: Gfn2Properties['atomicQuadrupoles'] = null;
    if (typeof calc.atomicQuadrupoles === 'function') {
      const qp = calc.atomicQuadrupoles();
      if (qp.cols() === count) {
        const R = [0, 1, 2].map((i) => frame.axes.map((axis) => axis[i])); // R[i][k] = axes[k][i]
        const order: Array<[number, number]> = [[0, 0], [0, 1], [1, 1], [0, 2], [1, 2], [2, 2]];
        atomicQuadrupoles = molecule.atoms.map((_, a) => {
          const t = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
          order.forEach(([i, j], c) => { t[i][j] = t[j][i] = qp.get(c, a) * ANGSTROM_PER_BOHR ** 2; });
          const turned = (i: number, j: number) => {
            let sum = 0;
            for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) sum += R[i][k] * t[k][l] * R[j][l];
            return sum;
          };
          return order.map(([i, j]) => turned(i, j)) as [number, number, number, number, number, number];
        });
      }
    }

    // The AO → atom map comes from the patch too; without it the shares are
    // left empty rather than guessed.
    const aoAtom = typeof calc.aoAtoms === 'function' ? vector(calc.aoAtoms()) : null;
    const overlap = result.overlapMatrix;
    const orbitalSet = (energies: any, occupations: any, coefficients: number[][]): Gfn2OrbitalSet => ({
      energies: vector(energies).map((e) => e * EV_PER_HARTREE),
      occupations: vector(occupations),
      atomShares: aoAtom ? atomShares(coefficients, overlap, aoAtom, count) : [],
    });
    const alphaC = columns(result.orbitalCoefficients);
    const alpha = orbitalSet(result.orbitalEnergies, result.orbitalOccupations, alphaC);
    let beta: Gfn2OrbitalSet | null = null;
    let betaC: number[][] | null = null;
    if (result.unrestricted) {
      betaC = columns(result.orbitalCoefficientsBeta);
      beta = orbitalSet(result.orbitalEnergiesBeta, result.orbitalOccupationsBeta, betaC);
    }

    const described = describeBasis(M, calc, frame.atoms);
    const signs = described?.signs ?? alphaC[0]?.map(() => 1) ?? [];
    const flip = (orbitals: number[][]) => orbitals.map((c) => c.map((x, mu) => x * signs[mu]));
    const n = signs.length;
    const overlapRows: number[][] = [];
    for (let mu = 0; mu < n; mu++) {
      const row: number[] = [];
      for (let nu = 0; nu < n; nu++) row.push(overlap.get(mu, nu) * signs[mu] * signs[nu]);
      overlapRows.push(row);
    }

    if (kept) release(kept.calc);
    kept = { key: nextKey++, calc, signs, frame, fields: new Map() };
    keep = true;
    return {
      charges, bondOrders, spin, multiplicity, dipole, atomicDipoles, atomicQuadrupoles, alpha, beta, key: kept.key,
      orbitalBasis: described?.basis ?? null,
      frame,
      coefficients: { alpha: flip(alphaC), beta: betaC ? flip(betaC) : null },
      overlap: overlapRows,
    };
  } finally {
    if (!keep) release(calc);
  }
}

/** A GFN2 orbital sampled on a grid in the frame (Å), ψ in bohr^-3/2. */
interface OrbitalGrid {
  values: Float32Array;
  origin: [number, number, number];
  dimensions: [number, number, number];
  spacing: number;
  peak: number;
}

/** A request for one orbital's surface at one level. */
export interface OrbitalSurfaceRequest {
  /** The properties run whose calculator holds the orbitals. */
  key: number;
  /** Names the orbital for the field cache ("alpha:5"). */
  orbital: string;
  /** Its coefficients, sign-normalised as the properties gave them. */
  coefficients: number[];
  /** The atoms it lives on (Mulliken share above a few percent): the box. */
  atoms: number[];
  /** A percentile of the orbital's own weight, or an absolute amplitude. */
  mode: 'percentile' | 'absolute';
  value: number;
}

/** The surface, in the molecule's coordinates — what the renderer draws. */
export interface OrbitalSurface {
  positions: Float32Array;
  normals: Float32Array;
  phases: Float32Array;
  vertexCount: number;
  isovalue: number;
}

/** Grid points per field at most; 216 000 points cost ~40 ms. */
const ORBITAL_GRID_POINTS = 300_000;
/** How far past its atoms an orbital is sampled (Å): GFN2's valence STO-nG
 *  functions reach further than the Slater set's at the lowest level offered. */
const ORBITAL_PAD = 3.5;

function orbitalGrid(M: any, request: OrbitalSurfaceRequest): OrbitalGrid | null {
  if (!kept || kept.key !== request.key) return null;
  const cached = kept.fields.get(request.orbital);
  if (cached) return cached;
  const atoms = kept.frame.atoms;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const i of request.atoms.length > 0 ? request.atoms : atoms.map((_, i) => i)) {
    const p = [atoms[i].x, atoms[i].y, atoms[i].z];
    for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c] - ORBITAL_PAD); hi[c] = Math.max(hi[c], p[c] + ORBITAL_PAD); }
  }
  const volume = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  const spacing = Math.max(0.15, Math.min(0.25, Math.cbrt(volume / ORBITAL_GRID_POINTS)));
  const dims = [0, 1, 2].map((c) => Math.ceil((hi[c] - lo[c]) / spacing) + 1) as [number, number, number];
  const count = dims[0] * dims[1] * dims[2];
  const points = M.Mat3N.create(count);
  let index = 0;
  for (let gz = 0; gz < dims[2]; gz++) {
    for (let gy = 0; gy < dims[1]; gy++) {
      for (let gx = 0; gx < dims[0]; gx++) {
        points.set(0, index, (lo[0] + gx * spacing) / ANGSTROM_PER_BOHR);
        points.set(1, index, (lo[1] + gy * spacing) / ANGSTROM_PER_BOHR);
        points.set(2, index, (lo[2] + gz * spacing) / ANGSTROM_PER_BOHR);
        index++;
      }
    }
  }
  const coefficients = M.Vec.create(request.coefficients.length);
  request.coefficients.forEach((c, mu) => coefficients.set(mu, c * kept!.signs[mu]));
  const out = kept.calc.orbitalValues(points, coefficients);
  const values = new Float32Array(count);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const v = out.get(0, i) as number;
    values[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  points.delete?.();
  out.delete?.();
  coefficients.delete?.();
  const grid: OrbitalGrid = { values, origin: lo as [number, number, number], dimensions: dims, spacing, peak };
  if (kept.fields.size >= 8) kept.fields.clear();
  kept.fields.set(request.orbital, grid);
  return grid;
}

/**
 * One orbital's surface: the field (cached per orbital), the level, the march,
 * and each vertex's normal from the analytic ∇ψ — the grid is not consulted
 * for direction, for the reason given in marchMoField. Then from the frame back
 * to the molecule's coordinates.
 */
export async function orbitalSurface(request: OrbitalSurfaceRequest): Promise<OrbitalSurface | null> {
  const M = await loadGfn2();
  const grid = orbitalGrid(M, request);
  if (!grid || !kept) return null;
  const level = request.mode === 'percentile'
    ? levelForFraction(grid as unknown as Parameters<typeof levelForFraction>[0], request.value)
    : request.value;
  const sheets = marchSignedField(grid, level, () => [0, 0, 0]);
  const vertexCount = sheets.positions.length / 3;
  const normals = new Float32Array(sheets.positions.length);
  if (vertexCount > 0) {
    const points = M.Mat3N.create(vertexCount);
    for (let v = 0; v < vertexCount; v++) {
      for (let c = 0; c < 3; c++) points.set(c, v, sheets.positions[3 * v + c] / ANGSTROM_PER_BOHR);
    }
    const coefficients = M.Vec.create(request.coefficients.length);
    request.coefficients.forEach((c, mu) => coefficients.set(mu, c * kept!.signs[mu]));
    const out = kept.calc.orbitalValues(points, coefficients);
    for (let v = 0; v < vertexCount; v++) {
      const g = [out.get(1, v), out.get(2, v), out.get(3, v)] as number[];
      const length = Math.hypot(g[0], g[1], g[2]) || 1;
      // outward: down the gradient on the positive sheet, up it on the negative
      const outward = -sheets.phases[v];
      for (let c = 0; c < 3; c++) normals[3 * v + c] = (outward * g[c]) / length;
    }
    points.delete?.();
    out.delete?.();
    coefficients.delete?.();
    // The marcher winds each triangle by the normal it is handed, and it was
    // handed none (the gradient comes in one batch, afterwards): wind each
    // triangle now so its face points the way its vertices' normals do.
    const p = sheets.positions;
    for (let t = 0; t < vertexCount; t += 3) {
      const i = 3 * t, j = i + 3, k = i + 6;
      const ux = p[j] - p[i], uy = p[j + 1] - p[i + 1], uz = p[j + 2] - p[i + 2];
      const vx = p[k] - p[i], vy = p[k + 1] - p[i + 1], vz = p[k + 2] - p[i + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const nx = normals[i] + normals[j] + normals[k];
      const ny = normals[i + 1] + normals[j + 1] + normals[k + 1];
      const nz = normals[i + 2] + normals[j + 2] + normals[k + 2];
      if (fx * nx + fy * ny + fz * nz < 0) {
        for (let c = 0; c < 3; c++) {
          [p[j + c], p[k + c]] = [p[k + c], p[j + c]];
          [normals[j + c], normals[k + c]] = [normals[k + c], normals[j + c]];
        }
        [sheets.phases[t + 1], sheets.phases[t + 2]] = [sheets.phases[t + 2], sheets.phases[t + 1]];
      }
    }
  }
  const { axes: [ax, ay, az], origin } = kept.frame;
  const positions = new Float32Array(sheets.positions.length);
  const worldNormals = new Float32Array(normals.length);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [sheets.positions[i], sheets.positions[i + 1], sheets.positions[i + 2]];
    const [nx, ny, nz] = [normals[i], normals[i + 1], normals[i + 2]];
    for (let c = 0; c < 3; c++) {
      positions[i + c] = origin[c] + x * ax[c] + y * ay[c] + z * az[c];
      worldNormals[i + c] = nx * ax[c] + ny * ay[c] + nz * az[c];
    }
  }
  return { positions, normals: worldNormals, phases: new Float32Array(sheets.phases), vertexCount, isovalue: level };
}

self.onmessage = async (e: MessageEvent<{ id: number; molecule?: Molecule; task?: 'optimise' | 'properties' | 'surface' | 'load'; surface?: OrbitalSurfaceRequest }>) => {
  const { id, molecule, task, surface } = e.data;
  try {
    // 'load' instantiates the engine and nothing else — the page asks for it
    // at startup, so the first optimisation does not wait on the download
    const result = task === 'load'
      ? (await loadGfn2(), true)
      : task === 'properties'
        ? await propertiesAt(molecule!)
        : task === 'surface'
          ? await orbitalSurface(surface!)
        : await optimizeWithGfn2(molecule!, undefined, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, result });
  } catch (error) {
    // Never fail silently: the caller surfaces this, and a console line keeps
    // it diagnosable in a worker's devtools too.
    const message = String((error as Error)?.message ?? error);
    console.error('[gfn2] refinement failed:', message);
    self.postMessage({ id, result: null, error: message });
  }
};
