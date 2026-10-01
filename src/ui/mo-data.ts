/**
 * The MO data as text: the LCAO printout a chemist compares against another
 * program's output.
 *
 * Everything needed to reproduce the numbers is in the header — the model,
 * the basis order, and the calculation frame — because the same MO looks
 * different in another program's frame, and a coefficient vector is only
 * comparable when both sides agree on what "pz" means. The AO order is the
 * same one YAeHMOP prints (per atom: s, px, py, pz), so the vectors line up
 * with an oracle's wavefunction block line for line.
 */
import type { Molecule } from '../mol-parser';
import type { ExtendedHuckelResult } from '../chem/extended-huckel/solve';
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
  lines.push('calculation frame: the molecule\'s principal axes; the unit vectors below are');
  lines.push('       given in the molecule\'s own coordinates, and "2pz" means this frame\'s z');
  const axisName = ['x', 'y', 'z'];
  result.frame.forEach((axis, i) => {
    lines.push(`  ${axisName[i]} = (${axis.map((v) => v.toFixed(6)).join(', ')})`);
  });
  lines.push('');
  lines.push('basis (index, orbital):');
  result.basis.forEach((orbital, i) => {
    lines.push(`  ${String(i + 1).padStart(3)}  ${orbital.label}`);
  });
  lines.push('');
  lines.push(`orbitals — energy (${ENERGY_UNIT}, ${KCAL_PER_EV} per eV), occupation, then coefficients with |c| >= ${PRINT_THRESHOLD}:`);
  result.energies.forEach((energy, mo) => {
    const occupation = occupations ? occupations[mo] : null;
    lines.push(`MO ${String(mo + 1).padStart(3)}  ${(energy * KCAL_PER_EV).toFixed(4).padStart(11)}  ${occupation === null ? 'open shell' : occupation.toFixed(2)}`);
    const coefficients = result.coefficients[mo];
    const largest = Math.max(...coefficients.map(Math.abs));
    coefficients.forEach((c, ao) => {
      if (Math.abs(c) < PRINT_THRESHOLD) return;
      const marker = Math.abs(c) / largest >= MO_SIGNIFICANT ? ' *' : '  ';
      lines.push(`     ${String(ao + 1).padStart(3)} ${result.basis[ao].label.padEnd(14)} ${(c >= 0 ? '+' : '−') + Math.abs(c).toFixed(5)}${marker}`);
    });
  });
  lines.push('');
  lines.push(`(* marks the coefficients the app draws lobes for — |c| >= ${MO_SIGNIFICANT} of the MO's largest)`);
  return lines.join('\n') + '\n';
}
