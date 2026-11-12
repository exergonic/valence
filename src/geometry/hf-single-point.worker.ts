/**
 * Hartree–Fock/def2-SVP at a structure exactly as displayed — one single
 * point, run when the user asks for it, never a geometry engine. From its
 * density: the ESP surface as the textbook draws it, the ESP-fitted and
 * CHELPG charges, and the dipole.
 *
 * Why HF, and why def2-SVP (NOTES.md, 2026-11-10 and 11-11): GFN2-xTB's
 * density gets some ESPs qualitatively wrong — Br₂'s quadrupole is reversed,
 * so its σ-holes are missing — and its dipoles fall out of experiment's order.
 * HF/def2-SVP overshoots dipoles by a similar margin each time (Hartree–Fock's
 * familiar over-polarisation), keeps experiment's order, and has the σ-holes;
 * a hybrid functional at the same basis bought little for an ESP at three
 * times the download.
 *
 * The engine is OCC's HF and nothing else (vendor/occ-hf-wasm), in its own
 * worker, loaded the first time it is asked for. def2-SVP is its only data;
 * iodine and beyond carry the def2 effective core potential, which OCC
 * handles (the potential's nuclei and the dipole count each such atom at Z
 * less its core electrons).
 */
import createOccModule from '../../vendor/occ-hf-wasm/occjs.js';
import wasmUrl from '../../vendor/occ-hf-wasm/occjs.wasm?url';
import dataUrl from '../../vendor/occ-hf-wasm/occjs.data?url';
import type { Molecule } from '../mol-parser';
import { atomicNumber, isDBlock, lowestMultiplicity } from '../chem/elements';
import { fitChargesToPotential, mkFitPoints } from '../chem/charge-model/esp-fit';
import { densitySurface, occPoints, type DensityGrid } from './esp-surface';

const ANGSTROM_PER_BOHR = 0.529177210903;
const DEBYE_PER_E_BOHR = 2.541746473;

/** The basis, by its name in OCC's data. */
export const HF_BASIS = 'def2-svp';

/** Points per call into the engine: its basis values for a block are points ×
 *  basis functions doubles, so a whole 400 000-point grid at once would ask
 *  for hundreds of megabytes. */
const POINTS_PER_BLOCK = 8192;

export interface HfEspSurface {
  positions: Float32Array;
  normals: Float32Array;
  /** The exact potential at each vertex, e/Å. */
  potentials: Float32Array;
  vertexCount: number;
}

export interface HfSinglePoint {
  /** The total energy, Eh. */
  energy: number;
  /** Closed shell (RHF) or not (UHF). */
  restricted: boolean;
  multiplicity: number;
  basisFunctions: number;
  /** The density's dipole about the coordinate origin, Debye, in the
   *  molecule's axes (GFN2's convention: p + Q·r for an ion). */
  dipole: [number, number, number];
  /** Fitted to HF's potential, as GFN2's ESP-fitted set is to GFN2's (e). */
  espFitted: number[];
  /** OCC's CHELPG: fitted on its own grid and radii (e). */
  chelpg: number[];
  surface: HfEspSurface | null;
  /** The whole run, wall clock. */
  seconds: number;
}

let modulePromise: Promise<any> | null = null;

/** The engine, instantiated once. `locateFile` is injectable so a test can
 *  point it at the vendored files on disk. */
function loadHf(
  locateFile: (path: string) => string = (path: string) =>
    path.endsWith('.wasm') ? wasmUrl : path.endsWith('.data') ? dataUrl : path,
): Promise<any> {
  if (!modulePromise) {
    modulePromise = (async () => {
      // the SCF prints its table to stdout; drop it (stderr stays)
      const module = await createOccModule({ locateFile, print: () => {} });
      module.setNumThreads?.(1);
      // the basis, and the starting guess's atomic densities, are read from /basis
      module.setDataDirectory?.('/');
      module.setLogLevelString?.('warn');
      return module;
    })().catch((err) => {
      modulePromise = null;
      throw err;
    });
  }
  return modulePromise;
}

/** The structure as the engine's Molecule and its def2-SVP basis. */
function basisFor(M: any, molecule: Molecule) {
  const positions = M.Mat3N.create(molecule.atoms.length);
  molecule.atoms.forEach((a, i) => { positions.set(0, i, a.x); positions.set(1, i, a.y); positions.set(2, i, a.z); });
  const occMolecule = new M.Molecule(M.IVec.fromArray(molecule.atoms.map((a) => atomicNumber(a.element))), positions);
  const basis = M.AOBasis.load(occMolecule.atoms(), HF_BASIS);
  // def2's d and f shells are spherical (five d, seven f); OCC loads them
  // Cartesian unless told, which is another basis — six d per shell, energies
  // millihartrees from every other program's def2-SVP
  basis.setPure(true);
  return basis;
}

/** The whole run, SCF and surface, in Coulomb-and-exchange builds of the
 *  probe below: 10–16 for every main-group molecule above 100 basis functions
 *  measured, in Node and in the browser (NOTES.md, 2026-11-11), so 14. */
const RUN_PER_PROBE = 14;
/** A transition-metal complex's SCF takes several times the iterations of a
 *  main-group molecule's: NiCl₄²⁻ (UHF) ran 114 s against 35 s estimated
 *  without this. One measurement, so a provisional factor. */
const D_BLOCK_SCF_FACTOR = 3;
/** What a small molecule costs whatever its builds: the grid and the surface. */
const RUN_OVERHEAD_SECONDS = 0.5;

/**
 * How long the single point of this structure will take on this machine, in
 * seconds — what the 15 s gate weighs. Its cost is the SCF's two-electron
 * work, so one Coulomb-and-exchange build of the molecule's own basis is timed
 * (with its overlap matrix standing in for a density) and scaled; an open
 * shell builds both spins'. Null when the engine cannot set the molecule up.
 */
export async function hfSeconds(molecule: Molecule, locateFile?: (path: string) => string): Promise<number | null> {
  const M = await (locateFile ? loadHf(locateFile) : loadHf());
  try {
    const hf = new M.HartreeFock(basisFor(M, molecule));
    const probe = new M.MolecularOrbitals();
    probe.kind = M.SpinorbitalKind.Restricted;
    probe.densityMatrix = hf.overlapMatrix();
    const started = performance.now();
    hf.coulombAndExchangeMatrices(probe).delete?.();
    const build = (performance.now() - started) / 1000;
    const spins = (molecule.multiplicity ?? lowestMultiplicity(molecule.atoms)) === 1 ? 1 : 2;
    const metal = molecule.atoms.some((a) => isDBlock(a.element)) ? D_BLOCK_SCF_FACTOR : 1;
    return RUN_PER_PROBE * spins * metal * build + RUN_OVERHEAD_SECONDS;
  } catch {
    return null;
  }
}

/** The total density at `count` points from the engine's answer: a closed
 *  shell's is one row per point; an open shell's is the α density of every
 *  point, then the β density of every point, and the ESP is drawn on the sum. */
function totalDensity(mat: any, count: number): number[] {
  const open = mat.rows() === 2 * count;
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) out[i] = mat.get(i, 0) + (open ? mat.get(count + i, 0) : 0);
  mat.delete?.();
  return out;
}

/** The density at points (flat, bohr), block by block. */
function densityAt(M: any, wfn: any, pointsBohr: number[]): number[] {
  const n = pointsBohr.length / 3;
  const out: number[] = [];
  for (let start = 0; start < n; start += POINTS_PER_BLOCK) {
    const block = pointsBohr.slice(3 * start, 3 * Math.min(n, start + POINTS_PER_BLOCK));
    const at = occPoints(M, block);
    out.push(...totalDensity(wfn.electronDensity(at, 0), block.length / 3));
    at.delete?.();
  }
  return out;
}

/** The total density's gradient at points (flat, bohr), x, y, z per point:
 *  the engine's analytic one (its columns are ρ, ∂x, ∂y, ∂z; an open shell's
 *  rows are α then β). */
function densityGradientAt(M: any, wfn: any, pointsBohr: number[]): number[] {
  const n = pointsBohr.length / 3;
  const out: number[] = [];
  for (let start = 0; start < n; start += POINTS_PER_BLOCK) {
    const block = pointsBohr.slice(3 * start, 3 * Math.min(n, start + POINTS_PER_BLOCK));
    const count = block.length / 3;
    const at = occPoints(M, block);
    const rho = wfn.electronDensity(at, 1);
    const open = rho.rows() === 2 * count;
    for (let i = 0; i < count; i++) {
      for (let c = 1; c <= 3; c++) out.push(rho.get(i, c) + (open ? rho.get(count + i, c) : 0));
    }
    rho.delete?.();
    at.delete?.();
  }
  return out;
}

/** The density on the grid, x fastest, block by block. */
function densityOnGrid(M: any, wfn: any, grid: DensityGrid): Float32Array {
  const values = new Float32Array(grid.count);
  const [nx, ny] = grid.dimensions;
  for (let start = 0; start < grid.count; start += POINTS_PER_BLOCK) {
    const end = Math.min(grid.count, start + POINTS_PER_BLOCK);
    const block: number[] = [];
    for (let index = start; index < end; index++) {
      const gx = index % nx, gy = Math.floor(index / nx) % ny, gz = Math.floor(index / (nx * ny));
      block.push(
        (grid.origin[0] + gx * grid.spacing) / ANGSTROM_PER_BOHR,
        (grid.origin[1] + gy * grid.spacing) / ANGSTROM_PER_BOHR,
        (grid.origin[2] + gz * grid.spacing) / ANGSTROM_PER_BOHR,
      );
    }
    const at = occPoints(M, block);
    totalDensity(wfn.electronDensity(at, 0), end - start).forEach((rho, k) => { values[start + k] = rho; });
    at.delete?.();
  }
  return values;
}

/** The exact potential at points (flat, bohr), Eh/e. */
function potentialAt(M: any, wfn: any, pointsBohr: number[]): number[] {
  const out: number[] = [];
  const n = pointsBohr.length / 3;
  for (let start = 0; start < n; start += POINTS_PER_BLOCK) {
    const block = pointsBohr.slice(3 * start, 3 * Math.min(n, start + POINTS_PER_BLOCK));
    const at = occPoints(M, block);
    const phi = wfn.electricPotential(at);
    for (let i = 0; i < block.length / 3; i++) out.push(phi.get(i));
    phi.delete?.();
    at.delete?.();
  }
  return out;
}

/**
 * The single point: restricted for a singlet, unrestricted otherwise, at the
 * structure's own charge and the spin the app gives it (its own, or the
 * lowest the electron count allows). Null when the SCF gives no energy.
 */
export async function hfSinglePoint(molecule: Molecule, locateFile?: (path: string) => string): Promise<HfSinglePoint | null> {
  const M = await (locateFile ? loadHf(locateFile) : loadHf());
  const started = performance.now();
  const atoms = molecule.atoms;
  const netCharge = atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0);
  const multiplicity = molecule.multiplicity ?? lowestMultiplicity(atoms);
  const restricted = multiplicity === 1;
  const basis = basisFor(M, molecule);
  const hf = new M.HartreeFock(basis);
  const scf = new M.HartreeFockSCF(hf, restricted ? M.SpinorbitalKind.Restricted : M.SpinorbitalKind.Unrestricted);
  scf.setChargeMultiplicity(netCharge, multiplicity);
  const energy = scf.run();
  if (!Number.isFinite(energy)) return null;
  const wfn = scf.wavefunction();

  const mu = wfn.dipoleMoment();
  const dipole = [0, 1, 2].map((c) => mu.get(c) * DEBYE_PER_E_BOHR) as [number, number, number];
  mu.delete?.();

  const chelpgCharges = wfn.chelpgCharges();
  const chelpg = atoms.map((_, i) => chelpgCharges.get(i) as number);
  chelpgCharges.delete?.();

  // the same Merz–Kollman points and fit as GFN2's ESP-fitted set, on HF's
  // potential: a change of density, not of method
  const fitPoints = mkFitPoints(atoms);
  const fitted = potentialAt(M, wfn, fitPoints.map((x) => x / ANGSTROM_PER_BOHR)).map((v) => v / ANGSTROM_PER_BOHR);
  const espFitted = fitChargesToPotential(atoms, fitPoints, fitted, netCharge);

  const soup = densitySurface(atoms, {
    densityOnGrid: (grid) => densityOnGrid(M, wfn, grid),
    densityAt: (points) => densityAt(M, wfn, points),
    potentialAt: (points) => potentialAt(M, wfn, points),
    densityGradientAt: (points) => densityGradientAt(M, wfn, points),
  });
  const surface = soup && {
    positions: Float32Array.from(soup.positions),
    normals: soup.normals,
    potentials: Float32Array.from(soup.potentials),
    vertexCount: soup.vertexCount,
  };

  return {
    energy,
    restricted,
    multiplicity,
    basisFunctions: basis.nbf(),
    dipole,
    espFitted,
    chelpg,
    surface,
    seconds: (performance.now() - started) / 1000,
  };
}

/** For a test: the density integrated over a box around the molecule
 *  (electrons) — every electron the SCF placed, less any ECP's core. */
export async function electronsOnGrid(molecule: Molecule, locateFile: (path: string) => string, step = 0.1, reach = 6): Promise<number> {
  const M = await loadHf(locateFile);
  const multiplicity = molecule.multiplicity ?? lowestMultiplicity(molecule.atoms);
  const basis = basisFor(M, molecule);
  const scf = new M.HartreeFockSCF(new M.HartreeFock(basis), multiplicity === 1 ? M.SpinorbitalKind.Restricted : M.SpinorbitalKind.Unrestricted);
  scf.setChargeMultiplicity(molecule.atoms.reduce((s, a) => s + (a.charge ?? 0), 0), multiplicity);
  scf.run();
  const wfn = scf.wavefunction();
  // a box `reach` bohr past the nuclei
  const lo = [0, 1, 2].map((c) => Math.min(...molecule.atoms.map((a) => [a.x, a.y, a.z][c])) / ANGSTROM_PER_BOHR - reach);
  const hi = [0, 1, 2].map((c) => Math.max(...molecule.atoms.map((a) => [a.x, a.y, a.z][c])) / ANGSTROM_PER_BOHR + reach);
  const points: number[] = [];
  for (let x = lo[0]; x <= hi[0]; x += step) for (let y = lo[1]; y <= hi[1]; y += step) for (let z = lo[2]; z <= hi[2]; z += step) points.push(x, y, z);
  return densityAt(M, wfn, points).reduce((sum, rho) => sum + rho, 0) * step ** 3;
}

type Task = 'load' | 'single-point' | 'seconds';

self.onmessage = async (e: MessageEvent<{ id: number; task: Task; molecule?: Molecule }>) => {
  const { id, task, molecule } = e.data;
  try {
    const result = task === 'load' ? (await loadHf(), true)
      : task === 'seconds' ? await hfSeconds(molecule!)
      : await hfSinglePoint(molecule!);
    // the surface's arrays move, not copy: a large molecule's are megabytes
    const transfer = result && typeof result === 'object' && result.surface
      ? [result.surface.positions.buffer, result.surface.normals.buffer, result.surface.potentials.buffer] : [];
    self.postMessage({ id, result }, { transfer });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
