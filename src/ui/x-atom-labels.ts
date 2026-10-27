/**
 * Charges JSME cannot hold, and radicals, carried on its X atom.
 *
 * JSME works out a charge from an atom's bond count and overrides the one it
 * is given: a halogen or a sulfur past its usual valence keeps none (ICl₄⁻,
 * BrF₄⁻, SF₅⁻ read neutral), I₃⁻ and ICl₂⁻ always come out cations, SiF₆²⁻
 * comes out Si²⁺. Its charge tool refuses these centres outright ("Charge
 * change not possible on the halogen !"). But its X atom takes an atomic
 * SMILES literally, charge included: "[I-]" on ICl₄'s iodine gives
 * Cl[I-](Cl)(Cl)Cl. So where JSME refuses a charge, the toolbar writes the
 * atom in as an X atom with it (sketcher-toolbar.ts), and the build reads it
 * back here (NOTES.md, 2026-10-20).
 *
 * JSME has no radical at all, and the X atom carries that too: "[C•]" is
 * drawn as written, the dot beside the element, and a radical centre takes
 * one hydrogen fewer than its usual valence (fill-hydrogens.ts). A charge
 * goes after the dot: "C•-" is a radical anion's carbon (NOTES.md,
 * 2026-10-26).
 *
 * The X atom's charge and dot live only in its label. The V2000 MOL block
 * writes the label as the atom symbol ("I-"), with no M  CHG line, and a
 * label too long for the symbol column ("Si-2") as "Q"; the V3000 block keeps
 * it whole, so it is read from there — the two blocks list the atoms in the
 * same order. Reading any MOL block back into JSME loses it (the atom comes
 * back plain and neutral); a JME string with the label bracketed, "[I-]",
 * restores it.
 */

/** The dot of a radical centre, as the label carries it. */
export const RADICAL_DOT = '•';

/** An X atom's label: an element, a radical's dot and a signed charge, "I-",
 *  "Si-2", "Xe+", "C•", "C•-". Null for anything else — a bare element is an
 *  ordinary atom. */
export function parseXAtomLabel(label: string): { element: string; charge: number; radical: boolean } | null {
  const match = /^([A-Z][a-z]?)(•?)(?:([+-])(\d*))?$/.exec(label);
  if (!match || (!match[2] && !match[3])) return null;
  const size = match[4] ? Number(match[4]) : 1;
  const charge = !match[3] ? 0 : match[3] === '-' ? -size : size;
  return { element: match[1], charge, radical: match[2] === RADICAL_DOT };
}

/** An atom's label in a JME string for JSME to read: the X atom "[I-]",
 *  "[Si-2]", "[C•]", "[C•-]" for a charge or a radical (bracketed, it carries
 *  no implicit hydrogens in JSME's SMILES, as a hypervalent centre has none),
 *  the bare element — JSME's own atom again — for neither. */
export function jmeAtomLabel(element: string, charge: number, radical = false): string {
  if (charge === 0 && !radical) return element;
  const size = Math.abs(charge);
  const sign = charge === 0 ? '' : `${charge < 0 ? '-' : '+'}${size > 1 ? size : ''}`;
  return `[${element}${radical ? RADICAL_DOT : ''}${sign}]`;
}

/** The labelled X atoms of a V3000 MOL block — a charge or a radical: atom
 *  index (0-based) → its label, "I-", "C•". */
export function xAtomLabels(v3000: string): Map<number, string> {
  const labels = new Map<number, string>();
  let inAtoms = false;
  for (const line of v3000.split('\n')) {
    if (line.startsWith('M  V30 BEGIN ATOM')) inAtoms = true;
    else if (line.startsWith('M  V30 END ATOM')) break;
    else if (inAtoms) {
      // "M  V30 <index> <label> <x> <y> <z> <map> ..."
      const parts = line.trim().split(/\s+/);
      if (parseXAtomLabel(parts[3] ?? '')) labels.set(Number(parts[2]) - 1, parts[3]);
    }
  }
  return labels;
}
