/**
 * The MO data as text: the LCAO printout a chemist compares against another
 * program's output — GFN2-xTB's orbitals (`gfn2MoDataText`), or extended
 * Hückel's when GFN2 has none to give (`moDataText`).
 *
 * Everything needed to reproduce the numbers is in the header — the model,
 * the basis order, and the calculation frame — because the same MO looks
 * different in another program's frame, and a coefficient vector is only
 * comparable when both sides agree on what "pz" means. The AO order is the
 * same one YAeHMOP prints (per atom: s, px, py, pz), so the vectors line up
 * with an oracle's wavefunction block line for line.
 */
import type { Molecule } from '../mol-parser';
import type { BasisFunction } from '../chem/extended-huckel/assign-basis';
import type { ExtendedHuckelResult } from '../chem/extended-huckel/solve';
import type { Gfn2Ladder } from '../chem/gfn2-xtb/orbital-ladder';
import type { Gfn2Properties } from '../geometry/gfn2-refine';
import { closedShellOccupations } from '../chem/extended-huckel/solve';
import { MO_SIGNIFICANT } from '../render/mo-lobes';
import { ENERGY_UNIT, KCAL_PER_EV } from './units';

/** Coefficients below this are left out of the printout (they are rounding
 *  noise, not chemistry) — the same threshold the picture is drawn with. */
const PRINT_THRESHOLD = 0.001;

export function moDataText(molecule: Molecule, result: ExtendedHuckelResult): string {
  const occupations = closedShellOccupations(
    result.electronCount, result.energies.length, result.energies, molecule.multiplicity ?? 1,
  );
  const lines: string[] = [];
  lines.push('Valence — extended-Hückel MO data');
  lines.push('model: semiempirical — Alvarez parameters (YAeHMOP\'s eht_parms.dat) for most');
  lines.push('       elements, ICON8 (QCPE 517) in full — s, p and d — for Si, P, S and Cl');
  lines.push('       (the Alvarez table has no second-row d);');
  lines.push('       the d block\'s d is contracted: two exponents with a coefficient each,');
  lines.push('       Wolfsberg–Helmholz K = 1.75 (plain form, not ABTH-weighted), no self-consistency');
  lines.push(`molecule: ${molecule.atoms.length} atoms, ${result.basis.length} basis functions, ${result.electronCount} electrons`);
  frameAndBasis(lines, result.frame, result.basis);
  lines.push(`orbitals — energy (${ENERGY_UNIT}, ${KCAL_PER_EV} per eV), occupation, then coefficients with |c| >= ${PRINT_THRESHOLD}:`);
  orbitalBlock(lines, result.energies, occupations, result.coefficients, result.basis);
  lines.push('');
  lines.push(`(* marks the coefficients the app draws lobes for — |c| >= ${MO_SIGNIFICANT} of the MO's largest)`);
  return lines.join('\n') + '\n';
}

/**
 * GFN2-xTB's orbitals, as the Delocalized ladder shows them: one set for a
 * closed shell, the α and the β set for an open one. Its basis is its own —
 * contracted Gaussians fitted to Slater functions, a d on the heavier main
 * group — so the coefficients compare with another GFN2 program's (xtb's
 * molden output), not with a Gaussian basis set's.
 */
export function gfn2MoDataText(
  molecule: Molecule,
  properties: Gfn2Properties,
  ladders: { alpha: Gfn2Ladder; beta: Gfn2Ladder | null },
): string {
  const { alpha, beta } = ladders;
  const electrons = (ladder: Gfn2Ladder) => ladder.occupations.reduce((sum, o) => sum + o, 0);
  const lines: string[] = [];
  lines.push('Valence — GFN2-xTB MO data');
  lines.push('model: semiempirical, self-consistent — GFN2-xTB (Bannwarth, Ehlert & Grimme,');
  lines.push('       J. Chem. Theory Comput. 2019), one single point at this geometry, as built');
  lines.push('       in OCC (vendored wasm); a minimal valence basis of contracted Gaussians');
  lines.push('       (Slater fits), with d polarization on the heavier main group');
  lines.push(`molecule: ${molecule.atoms.length} atoms, ${alpha.basis.length} basis functions, `
    + `${Math.round(electrons(alpha) + (beta ? electrons(beta) : 0))} valence electrons, `
    + `charge ${molecule.atoms.reduce((sum, a) => sum + (a.charge ?? 0), 0)}, multiplicity ${properties.multiplicity}`);
  lines.push('orbitals: each p and d function\'s sign is normalized to point along +axis of');
  lines.push('       the frame; within a degenerate set the partners are symmetry-adapted, as');
  lines.push('       the app draws them. Occupations are GFN2\'s Fermi filling, a level within');
  lines.push('       5 % of empty or full snapped to it');
  frameAndBasis(lines, properties.frame.axes, alpha.basis);
  for (const ladder of beta ? [alpha, beta] : [alpha]) {
    const channel = ladder.spin === 'alpha' ? 'α (spin-up) ' : ladder.spin === 'beta' ? 'β (spin-down) ' : '';
    lines.push(`${channel}orbitals — energy (${ENERGY_UNIT}, ${KCAL_PER_EV} per eV), occupation, then coefficients with |c| >= ${PRINT_THRESHOLD}:`);
    orbitalBlock(lines, ladder.energies, ladder.occupations, ladder.coefficients, ladder.basis);
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

/** The calculation frame and the basis order — what a coefficient means. */
function frameAndBasis(lines: string[], frame: number[][], basis: BasisFunction[]): void {
  lines.push('calculation frame: the molecule\'s principal axes; the unit vectors below are');
  lines.push('       given in the molecule\'s own coordinates, and "pz" means this frame\'s z');
  const axisName = ['x', 'y', 'z'];
  frame.forEach((axis, i) => {
    lines.push(`  ${axisName[i]} = (${axis.map((v) => v.toFixed(6)).join(', ')})`);
  });
  lines.push('');
  lines.push('basis (index, orbital):');
  basis.forEach((orbital, i) => {
    lines.push(`  ${String(i + 1).padStart(3)}  ${orbital.label}`);
  });
  lines.push('');
}

/** One orbital per header line, its coefficients beneath. */
function orbitalBlock(
  lines: string[],
  energies: number[],
  occupations: number[] | null,
  coefficients: number[][],
  basis: BasisFunction[],
): void {
  energies.forEach((energy, mo) => {
    const occupation = occupations ? occupations[mo] : null;
    lines.push(`MO ${String(mo + 1).padStart(3)}  ${(energy * KCAL_PER_EV).toFixed(4).padStart(11)}  ${occupation === null ? 'open shell' : occupation.toFixed(2)}`);
    const row = coefficients[mo];
    const largest = Math.max(...row.map(Math.abs));
    row.forEach((c, ao) => {
      if (Math.abs(c) < PRINT_THRESHOLD) return;
      const marker = Math.abs(c) / largest >= MO_SIGNIFICANT ? ' *' : '  ';
      lines.push(`     ${String(ao + 1).padStart(3)} ${basis[ao].label.padEnd(14)} ${(c >= 0 ? '+' : '−') + Math.abs(c).toFixed(5)}${marker}`);
    });
  });
}
