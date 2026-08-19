import type { Molecule } from '../mol-parser';

/**
 * Heavy-atom structural fingerprint used to guard fetched 3D structures.
 *
 * PubChem and CIR resolve the query by their own SMILES rules, and can
 * return a DIFFERENT compound than the one sketched — most notably JSME
 * emits aromatic lower-case SMILES ("c1ccc1" for a drawn cyclobutadiene),
 * and both services resolve that antiaromatic 4-ring form to the saturated
 * ring (cyclobutane, CID 9250). Without a check the app renders the wrong
 * molecule while reporting "PubChem 3D".
 *
 * The fingerprint deliberately ignores hydrogens (the sketcher leaves them
 * implicit while PubChem returns explicit H) and atom numbering (PubChem
 * reorders atoms freely). It compares the heavy-atom element multiset and
 * the heavy-heavy bond multiset (element pair + order) — enough to catch a
 * different compound without needing graph isomorphism.
 */
export function structuresMatch(a: Molecule, b: Molecule): boolean {
  return arraysEqual(heavyElements(a), heavyElements(b)) && arraysEqual(heavyBonds(a), heavyBonds(b));
}

function heavyElements(m: Molecule): string[] {
  return m.atoms.map((a) => a.element).filter((el) => el !== 'H').sort();
}

function heavyBonds(m: Molecule): string[] {
  const out: string[] = [];
  for (const bond of m.bonds) {
    const a1 = m.atoms[bond.atom1Index];
    const a2 = m.atoms[bond.atom2Index];
    if (!a1 || !a2) continue;
    if (a1.element === 'H' || a2.element === 'H') continue;
    const [lo, hi] = a1.element < a2.element ? [a1.element, a2.element] : [a2.element, a1.element];
    out.push(`${bond.order}|${lo}-${hi}`);
  }
  return out.sort();
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
