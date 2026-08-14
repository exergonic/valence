import type { Atom, Bond } from '../mol-parser/types';

/**
 * V3000 → V2000 MOL converter.
 *
 * PubChem's CIR resolver sometimes returns V3000 SDFs, which parseMolBlock
 * cannot read (it only handles V2000). This converter translates a V3000
 * MOL block into an equivalent V2000 block so the existing parser handles
 * both formats transparently.
 *
 * V3000 format (the CTAB block):
 *   M  V30 BEGIN CTAB
 *   M  V30 COUNTS <atoms> <bonds> ...
 *   M  V30 BEGIN ATOM
 *   M  V30 <idx> <element> <x> <y> <z> ...
 *   M  V30 END ATOM
 *   M  V30 BEGIN BOND
 *   M  V30 <idx> <order> <atom1> <atom2> ...
 *   M  V30 END BOND
 *   M  V30 END CTAB
 *
 * Only the fields Valence needs are translated: element, xyz, bond order,
 * and bond atom indices. Atom maps, stereo parity, and other V3000
 * extensions are dropped — they are not used by the renderer.
 */
export function convertV3000ToV2000(v3000: string): string | null {
  const lines = v3000.split('\n');

  // Locate the CTAB block.
  const ctabStart = lines.findIndex((l) => l.trim() === 'M  V30 BEGIN CTAB');
  const ctabEnd = lines.findIndex((l) => l.trim() === 'M  V30 END CTAB');
  if (ctabStart === -1 || ctabEnd === -1) return null;

  const ctab = lines.slice(ctabStart, ctabEnd + 1);

  // Parse COUNTS line: "M  V30 COUNTS <atoms> <bonds> ..."
  const countsLine = ctab.find((l) => l.trim().startsWith('M  V30 COUNTS'));
  if (!countsLine) return null;
  const countsParts = countsLine.trim().split(/\s+/);
  const atomCount = parseInt(countsParts[3], 10) || 0;
  const bondCount = parseInt(countsParts[4], 10) || 0;

  // Parse atoms: "M  V30 <idx> <element> <x> <y> <z> ..."
  const atoms: Atom[] = [];
  const atomStart = ctab.findIndex((l) => l.trim() === 'M  V30 BEGIN ATOM');
  const atomEnd = ctab.findIndex((l) => l.trim() === 'M  V30 END ATOM');
  if (atomStart !== -1 && atomEnd !== -1) {
    for (let i = atomStart + 1; i < atomEnd; i++) {
      const parts = ctab[i].trim().split(/\s+/);
      // parts[0] = "M", parts[1] = "V30", parts[2] = idx, parts[3] = element, parts[4..6] = x y z
      if (parts.length < 7) continue;
      const element = parts[3];
      const x = parseFloat(parts[4]);
      const y = parseFloat(parts[5]);
      const z = parseFloat(parts[6]);
      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
      atoms.push({ element, x, y, z });
    }
  }

  // Parse bonds: "M  V30 <idx> <order> <atom1> <atom2> ..."
  const bonds: Bond[] = [];
  const bondStart = ctab.findIndex((l) => l.trim() === 'M  V30 BEGIN BOND');
  const bondEnd = ctab.findIndex((l) => l.trim() === 'M  V30 END BOND');
  if (bondStart !== -1 && bondEnd !== -1) {
    for (let i = bondStart + 1; i < bondEnd; i++) {
      const parts = ctab[i].trim().split(/\s+/);
      // parts[0] = "M", parts[1] = "V30", parts[2] = idx, parts[3] = order, parts[4..5] = atom1 atom2
      if (parts.length < 6) continue;
      const order = parseInt(parts[3], 10) || 1;
      const atom1 = parseInt(parts[4], 10) - 1; // V3000 is 1-based → V2000 is 0-based
      const atom2 = parseInt(parts[5], 10) - 1;
      if (isNaN(atom1) || isNaN(atom2)) continue;
      bonds.push({ atom1Index: atom1, atom2Index: atom2, order });
    }
  }

  if (atoms.length === 0) return null;

  // Build V2000 output.
  const header = 'Valence V3000 import\n  converter\n\n';
  const counts = `${String(atomCount).padStart(3)}${String(bondCount).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`;

  const atomLines = atoms.map((a) => {
    return `${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.element.padStart(3)}  0  0  0  0  0  0  0  0  0  0  0  0`;
  });

  const bondLines = bonds.map((b) => {
    return `${String(b.atom1Index + 1).padStart(3)}${String(b.atom2Index + 1).padStart(3)}${String(b.order).padStart(3)}  0  0  0  0`;
  });

  return [header.trim(), counts, ...atomLines, ...bondLines, 'M  END', ''].join('\n');
}
