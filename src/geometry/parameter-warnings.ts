import { parameter_gap_report } from 'mmff94-ts';
import type { Molecule } from '../mol-parser';

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
export function parameterGapWarnings(molecule: Molecule): string[] {
  const mmff = {
    atoms: molecule.atoms.map((a, i) => ({ index: i, element: a.element, x: a.x, y: a.y, z: a.z })),
    bonds: molecule.bonds.map((b) => ({ atom1: b.atom1Index, atom2: b.atom2Index, bond_order: b.order })),
  };
  const report = parameter_gap_report(mmff);

  const warnings: string[] = [];
  for (const gap of report.atoms) {
    warnings.push(
      `${gap.coordination}-coordinate ${gap.element} has no MMFF94 type — generic parameters, refined geometry approximate`,
    );
  }
  for (const i of report.untyped) {
    warnings.push(`${molecule.atoms[i].element} has no MMFF94 type — generic fallback, geometry approximate`);
  }
  return warnings;
}
