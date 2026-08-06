import type { Atom, Bond, Molecule } from './types';

export function parseMolBlock(molBlock: string): Molecule {
  const lines = molBlock.split('\n');

  // The counts line is the one carrying the V2000 marker. Its index
  // is NOT fixed: most exporters emit a 4-line header (name, program,
  // comment, counts), but JSME's "Copy as MOL" emits only 3 (name,
  // blank, counts). Searching for the marker handles both.
  const countsIdx = lines.findIndex((l) => l.includes('V2000'));
  if (countsIdx === -1) return { atoms: [], bonds: [] };

  const countsLine = lines[countsIdx];
  const atomCount = parseInt(countsLine.substring(0, 3).trim()) || 0;
  const bondCount = parseInt(countsLine.substring(3, 6).trim()) || 0;

  const atoms: Atom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[countsIdx + 1 + i];
    if (!line || line.length < 34) break;
    atoms.push({
      element: line.substring(31, 34).trim(),
      x: parseFloat(line.substring(0, 10)),
      y: parseFloat(line.substring(10, 20)),
      z: parseFloat(line.substring(20, 30)),
    });
  }

  const bondStart = countsIdx + 1 + atomCount;
  const bonds: Bond[] = [];
  for (let i = 0; i < bondCount; i++) {
    const line = lines[bondStart + i];
    if (!line || line.length < 9) break;
    bonds.push({
      atom1Index: parseInt(line.substring(0, 3).trim()) - 1,
      atom2Index: parseInt(line.substring(3, 6).trim()) - 1,
      order: parseInt(line.substring(6, 9).trim()) || 1,
    });
  }

  return { atoms, bonds };
}
