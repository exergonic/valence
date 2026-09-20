import type { Atom, Bond, Molecule } from './types';
import { convertV3000ToV2000 } from './v3000-convert';

export function parseMolBlock(molBlock: string): Molecule {
  // V3000 SDFs are not handled by the V2000 parser below — convert
  // them up front so every caller (examples, PubChem, CIR) gets a
  // uniform format.
  if (molBlock.includes('V3000')) {
    const converted = convertV3000ToV2000(molBlock);
    if (converted) return parseV2000(converted);
  }
  return parseV2000(molBlock);
}

function parseV2000(molBlock: string): Molecule {
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
      // Atom-line charge code, columns 37-39 (0-indexed 36-39):
      // 0 = neutral, 1 = +3, 2 = +2, 3 = +1, 4 = doublet radical
      // (not a charge — left unset), 5 = -1, 6 = -2, 7 = -3.
      // M CHG property lines parsed below override this per the spec.
      charge: parseChargeCode(line.length >= 39 ? line.substring(36, 39).trim() : ''),
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

  // Formal charges from M CHG property lines ("M  CHG  2   3   1   7  -1":
  // atoms 3 and 7 carry +1 and -1). These override the atom-line charge
  // codes above — this is also how JSME's molFile() encodes a drawn
  // carbocation, so the local geometry path can see it.
  const propStart = bondStart + bondCount;
  for (let i = propStart; i < lines.length; i++) {
    const m = /^M\s+CHG\s+(\d+)\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const nums = m[2].trim().split(/\s+/).map(Number);
    for (let k = 0; k + 1 < nums.length; k += 2) {
      const idx = nums[k] - 1; // 1-based in the file
      const charge = nums[k + 1];
      if (idx >= 0 && idx < atoms.length && Number.isFinite(charge)) {
        atoms[idx].charge = charge === 0 ? undefined : charge;
      }
    }
  }

  return { atoms, bonds };
}

/** Map a V2000 atom-line charge code to a formal charge (undefined = neutral). */
function parseChargeCode(code: string): number | undefined {
  switch (code) {
    case '1': return 3;
    case '2': return 2;
    case '3': return 1;
    case '5': return -1;
    case '6': return -2;
    case '7': return -3;
    default: return undefined; // '0', '4' (radical), '', or unparsable
  }
}
