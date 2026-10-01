/// <reference lib="webworker" />
/// <reference types="vite/client" />
/**
 * GFN2-xTB geometry optimisation, off the main thread.
 *
 * This is the highest tier of the geometry pipeline: a real semiempirical
 * calculation (extended tight binding) rather than a force field. It is worth
 * its ~22 MB of wasm for exactly the cases the force field cannot do —
 * hypervalent centres (PCl5, SF6), elements MMFF94 has no parameters for, and
 * unusual charge states. For a well-parameterised organic (water, ethanol)
 * MMFF94 is at least as good, so this is a fallback, not a replacement.
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
import createOccModule from '../../vendor/occ-wasm/occjs.js';
import wasmUrl from '../../vendor/occ-wasm/occjs.wasm?url';
import dataUrl from '../../vendor/occ-wasm/occjs.data?url';
import type { Molecule } from '../mol-parser';

const BOHR_PER_ANGSTROM = 0.529177210903;
/** Trust region. OCC's SCF can settle on a spurious solution for a wild trial
 * geometry and report a lower energy for it; bounded steps keep the walk on
 * the physical surface. */
const MAX_MOVE_ANGSTROM = 0.1;
const MAX_ITERATIONS = 300;
const GRADIENT_TOLERANCE = 1e-4;

export interface Gfn2Result {
  /** The optimised structure, in Angstrom, same atom order as the input. */
  molecule: Molecule;
  /** Total GFN2 energy, hartree (OCC's native unit). */
  energyHartree: number;
  iterations: number;
  converged: boolean;
  milliseconds: number;
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

const readGradient = (matrix: any, count: number) => {
  const out = new Array(count * 3);
  for (let a = 0; a < count; a++) {
    for (let c = 0; c < 3; c++) out[3 * a + c] = matrix.get(c, a);
  }
  return out;
};

/**
 * Steepest descent with backtracking. L-BFGS converges faster but its history
 * degenerates when steps get small and it stalls; this always finds a downhill
 * step, and on these sizes each energy+gradient is ~15 ms.
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
  const calc = M.XtbCalculator.fromMolecule(
    new M.Molecule(M.IVec.fromArray(molecule.atoms.map((a) => elementToZ(a.element))), toMat3N(M, startAngstrom, count)),
  );
  calc.charge = totalCharge;
  calc.numUnpairedElectrons = unpaired;

  let x = startAngstrom.map((v) => v / BOHR_PER_ANGSTROM); // bohr from here on

  const evaluate = (positionsBohr: number[]) => {
    try {
      calc.updateStructure(toMat3N(M, positionsBohr, count));
      const result = calc.energyAndGradient(false, 1e-3);
      if (!Number.isFinite(result.energy)) return null;
      if (calc.lastResult()?.converged === false) return null;
      const gradient = readGradient(result.gradient, count);
      return gradient.every(Number.isFinite) ? { energy: result.energy, gradient } : null;
    } catch {
      return null;
    }
  };

  const started = performance.now();
  let current = evaluate(x);
  if (!current) return null;

  let iterations = 0;
  let converged = false;
  for (; iterations < MAX_ITERATIONS; iterations++) {
    if (Math.max(...current.gradient.map(Math.abs)) < GRADIENT_TOLERANCE) {
      converged = true;
      break;
    }
    const norm = Math.hypot(...current.gradient);
    const scale = (MAX_MOVE_ANGSTROM / BOHR_PER_ANGSTROM) / norm;
    const direction = current.gradient.map((g) => -scale * g);
    let step = 1;
    let next: { energy: number; gradient: number[] } | null = null;
    let accepted = x;
    for (let attempt = 0; attempt < 30; attempt++) {
      const trial = x.map((v, i) => v + step * direction[i]);
      const candidate = evaluate(trial);
      if (candidate && candidate.energy < current.energy) {
        next = candidate;
        accepted = trial;
        break;
      }
      step *= 0.5;
    }
    if (!next) break; // no downhill step: stop rather than stall forever
    x = accepted;
    current = next;
  }

  const optimised: Molecule = {
    ...molecule,
    atoms: molecule.atoms.map((atom, i) => ({
      ...atom,
      x: x[3 * i] * BOHR_PER_ANGSTROM,
      y: x[3 * i + 1] * BOHR_PER_ANGSTROM,
      z: x[3 * i + 2] * BOHR_PER_ANGSTROM,
    })),
  };
  try {
    calc.delete?.();
  } catch {
    /* releasing the handle is best-effort */
  }
  return {
    molecule: optimised,
    energyHartree: current.energy,
    iterations,
    converged,
    milliseconds: performance.now() - started,
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
