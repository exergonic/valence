/**
 * The app's local geometry pipeline, run in Node: computeLocalGeometry with the
 * GFN2 engine loaded from `vendor/occ-wasm` on disk instead of through the
 * worker's `?url` assets. Everything else — embedding, the symmetry kick, the
 * optimiser ladder, the saddle escape, the wedges, the unrefined fallback — is
 * the shipped code.
 */
import { fileURLToPath } from 'node:url';
import type { Molecule } from '../../src/mol-parser';
import { parseMolBlock } from '../../src/mol-parser';
import { breakSymmetry } from '../../src/geometry/embed';
import { computeLocalGeometry, type LocalGeometry } from '../../src/geometry/local-geometry';
import { symmetrizeMolecule } from '../../src/geometry/symmetrize';
import { EXAMPLES } from '../../src/ui/examples';

// The worker module registers `self.onmessage` at import time.
const globals = globalThis as unknown as Record<string, unknown>;
if (typeof globals.self === 'undefined') globals.self = globalThis;

const vendorFile = (name: string) =>
  fileURLToPath(new URL(`../../vendor/occ-wasm/${name.split('/').pop()}`, import.meta.url));

/** computeLocalGeometry, with the engine from disk. */
export async function localGeometry(molecule: Molecule): Promise<LocalGeometry | null> {
  const { optimizeWithGfn2 } = await import('../../src/geometry/gfn2-refine.worker');
  // the same kick refineWithGfn2 applies before posting to the worker
  return computeLocalGeometry(molecule, undefined, (start, onProgress) =>
    optimizeWithGfn2(breakSymmetry(start), vendorFile, onProgress));
}

const optimised = new Map<string, Promise<Molecule>>();

/** An example from the app through the local pipeline, as optimised — before
 *  the symmetry snap. One GFN2 run per example per test file, shared. */
export function optimisedExample(name: string): Promise<Molecule> {
  let run = optimised.get(name);
  if (!run) {
    run = (async () => {
      const sketch = parseMolBlock(EXAMPLES.find((e) => e.name.startsWith(name))!.mol);
      const local = await localGeometry(sketch);
      if (!local) throw new Error(`no local geometry for ${name}`);
      return local.molecule;
    })();
    optimised.set(name, run);
  }
  return run;
}

/** An example as the app shows it: optimised, then snapped to its point
 *  group as the panel does. */
export async function exampleGeometry(name: string): Promise<Molecule> {
  const molecule = await optimisedExample(name);
  return { atoms: symmetrizeMolecule(molecule).atoms, bonds: molecule.bonds };
}

/**
 * An MMFF94 conformer, the kind PubChem's 3D records are: the embedder's start
 * minimised on the force field by mmff94-ts. The app no longer optimises with
 * MMFF94; this is for the checks that guard a FETCHED structure (the 3-ring
 * pucker report) against that force field's artifacts.
 */
export async function mmff94Conformer(molecule: Molecule): Promise<Molecule> {
  const { optimize_lbfgs } = await import('mmff94-ts');
  const { toMMFFMol } = await import('../../src/geometry/mmff94-molecule');
  const { embed3D } = await import('../../src/geometry/embed');
  const start = breakSymmetry(embed3D(molecule).separated);
  const result = optimize_lbfgs(toMMFFMol(start), { max_iterations: 200 });
  return {
    ...start,
    atoms: start.atoms.map((a, i) => ({ ...a, x: result.molecule.atoms[i].x, y: result.molecule.atoms[i].y, z: result.molecule.atoms[i].z })),
  };
}
