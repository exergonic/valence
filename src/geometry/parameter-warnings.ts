import { parameter_gap_report } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';
import { toMMFFMol } from './mmff94-molecule';

// User-facing warnings when a locally refined molecule runs on
// generic MMFF94 parameters. The signal comes from the library's
// parameter_gap_report: atoms whose coordination EXCEEDS their
// type's crd (hypervalent centers — SF₆'s hexacoordinate S, PCl₅'s
// pentacoordinate P — the type space has no representation of the
// environment, and the empirical rules emit parameters the geometry
// cannot fit), and elements outside the MMFF94 type space entirely.
// The report is validated against the whole 761-molecule suite:
// zero false positives on any molecule whose chemistry MMFF94
// actually covers.
//
// By-design absences stay silent on purpose: a dropped out-of-plane term
// on a carbanion (methyl anion's carbon types as tetrahedral MMFF 1,
// whose table holds no planar restraint -- pyramidalization comes from
// angle bending) is normal MMFF94 operation, not a gap. Only genuinely
// degraded typing warns, so the popup informs without crying wolf.
export interface ParameterGapInfo {
  /** User-facing warnings, ready for the status popup. */
  warnings: string[];
  /** Indices of atoms whose element is outside the MMFF94 type space. */
  untyped: number[];
}

export function parameterGapInfo(molecule: Molecule): ParameterGapInfo {
  const report = parameter_gap_report(toMMFFMol(molecule));

  const warnings: string[] = [];
  for (const gap of report.atoms) {
    warnings.push(
      `${gap.coordination}-coordinate ${gap.element} has no MMFF94 type — generic parameters, refined geometry approximate`,
    );
  }
  for (const i of report.untyped) {
    warnings.push(`${molecule.atoms[i].element} has no MMFF94 type — generic fallback, geometry approximate`);
  }
  return { warnings, untyped: [...report.untyped] };
}

export function parameterGapWarnings(molecule: Molecule): string[] {
  return parameterGapInfo(molecule).warnings;
}
