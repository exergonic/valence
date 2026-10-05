/// <reference lib="webworker" />
/// <reference types="vite/client" />
/**
 * GFN2-xTB geometry optimisation, off the main thread.
 *
 * The app's one local geometry optimiser: a real semiempirical calculation
 * (extended tight binding) rather than a force field, structurally right where
 * a force field is not (hypervalent centres, untabled elements). When it cannot
 * deliver a minimum the pipeline shows the unrefined start and says so — there
 * is no second engine behind it. Costs ~3 MB of wasm, loaded lazily.
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
  const unpaired = Math.max(0, (molecule.multiplicity ?? 1) - 1);

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
   * ~1 mHa gap; the bindings expose no charge-only switch). Measured against
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
      return { value: values[0], mode };
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
    molecule: best.geometry,
    energyHartree: best.energy,
    iterations,
    converged: best.converged,
    milliseconds: performance.now() - started,
    charges,
    lowestHessianMode: lowest?.value ?? null,
    saddleEscapes,
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

self.onmessage = async (e: MessageEvent<{ id: number; molecule: Molecule }>) => {
  const { id, molecule } = e.data;
  try {
    const result = await optimizeWithGfn2(molecule, undefined, (progress) => self.postMessage({ id, progress }));
    self.postMessage({ id, result });
  } catch (error) {
    // Never fail silently: the caller surfaces this, and a console line keeps
    // it diagnosable in a worker's devtools too.
    const message = String((error as Error)?.message ?? error);
    console.error('[gfn2] refinement failed:', message);
    self.postMessage({ id, result: null, error: message });
  }
};
