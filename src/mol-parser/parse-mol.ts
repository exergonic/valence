import type { Atom, Bond, Molecule } from './types';

export function parseMolBlock(molBlock: string): Molecule {
  const lines = molBlock.split('\n');
  if (lines.length < 4) return { atoms: [], bonds: [] };

  const countsLine = lines[3];
  const atomCount = parseInt(countsLine.substring(0, 3).trim()) || 0;
  const bondCount = parseInt(countsLine.substring(3, 6).trim()) || 0;

  const atoms: Atom[] = [];
  for (let i = 0; i < atomCount; i++) {
    const line = lines[4 + i];
    if (!line || line.length < 34) break;
    atoms.push({
      index: i,
      element: line.substring(31, 34).trim(),
      x: parseFloat(line.substring(0, 10)),
      y: parseFloat(line.substring(10, 20)),
      z: parseFloat(line.substring(20, 30)),
    });
  }

  const bondStart = 4 + atomCount;
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
