/**
 * The on-demand Hartree–Fock single point (hf-single-point.worker.ts) against
 * ORCA's HF/def2-SVP on the same geometries (tests/references/orca-hf.json):
 * energies to a microhartree and dipoles to 10⁻³ e·bohr — the same method and
 * basis, so they must agree, an ECP (HI) and an open shell (triplet O₂)
 * included. Then what the app draws from it: the density holds every electron
 * the SCF placed, Br₂'s surface has the σ-holes GFN2's lacks, and the charge
 * sets add up to the molecule's charge.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Molecule } from '../src/mol-parser';

beforeAll(() => {
  // The worker module registers `self.onmessage` at import time.
  const globals = globalThis as unknown as Record<string, unknown>;
  if (typeof globals.self === 'undefined') globals.self = globalThis;
});

const vendorFile = (name: string) => fileURLToPath(new URL(`../vendor/occ-hf-wasm/${name}`, import.meta.url));
const oracle = JSON.parse(readFileSync(fileURLToPath(new URL('./references/orca-hf.json', import.meta.url)), 'utf-8')) as {
  molecules: Record<string, { geometry: string | null; charge: number; multiplicity: number; energy: number; dipole: number[] }>;
};
const DEBYE_PER_E_BOHR = 2.541746473;

function reference(name: string): Molecule {
  const entry = oracle.molecules[name];
  if (!entry.geometry) {
    // Br₂ as the app builds it (CIR), the geometry of the GFN2 test too
    return { atoms: [{ element: 'Br', x: -1.13, y: 0, z: 0 }, { element: 'Br', x: 1.13, y: 0, z: 0 }], bonds: [], multiplicity: 1 };
  }
  const lines = readFileSync(fileURLToPath(new URL(`./references/dft/${entry.geometry}`, import.meta.url)), 'utf-8').trim().split('\n').slice(2);
  const atoms = lines.map((line) => {
    const [element, x, y, z] = line.trim().split(/\s+/);
    return { element, x: Number(x), y: Number(y), z: Number(z) };
  });
  return { atoms, bonds: [], multiplicity: entry.multiplicity };
}

describe('HF/def2-SVP against ORCA', () => {
  for (const name of Object.keys(oracle.molecules)) {
    it(`${name}: the energy and the dipole`, async () => {
      const { hfSinglePoint } = await import('../src/geometry/hf-single-point.worker');
      const result = (await hfSinglePoint(reference(name), vendorFile))!;
      const entry = oracle.molecules[name];
      expect(result.restricted).toBe(entry.multiplicity === 1);
      expect(Math.abs(result.energy - entry.energy)).toBeLessThan(1e-6);
      result.dipole.forEach((debye, c) => expect(Math.abs(debye / DEBYE_PER_E_BOHR - entry.dipole[c])).toBeLessThan(1e-3));
    }, 180_000);
  }
});

describe('what the app draws from the HF density', () => {
  it('the density holds every electron the SCF placed: all of water’s, O₂’s triplet, HI less iodine’s ECP core', async () => {
    const { electronsOnGrid } = await import('../src/geometry/hf-single-point.worker');
    // a uniform 0.1-bohr grid over-counts a little at each nuclear cusp (O₂:
    // 16.10); a reading of one spin alone would give 7 or 9
    const within = async (name: string, electrons: number) =>
      expect(Math.abs((await electronsOnGrid(reference(name), vendorFile)) - electrons)).toBeLessThan(0.2);
    await within('water', 10);
    await within('dioxygen', 16);
    // 54 electrons, 28 of them iodine's core in the def2 ECP
    await within('hydrogen-iodide', 26);
  }, 300_000);

  it('Br₂’s surface has its σ-holes: positive at the tips, negative around the belt', async () => {
    const { hfSinglePoint } = await import('../src/geometry/hf-single-point.worker');
    const { surface } = (await hfSinglePoint(reference('br2'), vendorFile))!;
    let tip = 0, belt = 0;
    for (let v = 0; v < surface!.vertexCount; v++) {
      const [x, y, z] = [0, 1, 2].map((c) => surface!.positions[3 * v + c]);
      if (Math.abs(x) > Math.abs(surface!.positions[3 * tip])) tip = v;
      // beside an atom, out across the bond
      if (Math.abs(Math.abs(x) - 1.13) < 0.1 && Math.hypot(y, z) > Math.hypot(surface!.positions[3 * belt + 1], surface!.positions[3 * belt + 2])) belt = v;
    }
    expect(surface!.potentials[tip]).toBeGreaterThan(0);
    expect(surface!.potentials[belt]).toBeLessThan(0);
  }, 180_000);

  it('both charge sets add up to the molecule’s charge, and agree on water’s oxygen', async () => {
    const { hfSinglePoint } = await import('../src/geometry/hf-single-point.worker');
    const result = (await hfSinglePoint(reference('water'), vendorFile))!;
    for (const charges of [result.espFitted, result.chelpg]) expect(charges.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
    expect(result.espFitted[0]).toBeLessThan(-0.6);
    expect(Math.abs(result.espFitted[0] - result.chelpg[0])).toBeLessThan(0.1);
  }, 180_000);
});
