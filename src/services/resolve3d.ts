export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'rdkit' | 'fallback';
  cid?: string;
  name?: string;
  formula?: string;
  weight?: string;
}

const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const CIR_URL = 'https://cactus.nci.nih.gov/chemical/structure';

export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.003,
  Li: 6.941, Be: 9.012, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180,
  Na: 22.990, Mg: 24.305, Al: 26.982, Si: 28.086, P: 30.974, S: 32.065, Cl: 35.453, Ar: 39.948,
  K: 39.098, Ca: 40.078,
  Fe: 55.845, Cu: 63.546, Zn: 65.38, Mn: 54.938,
  Br: 79.904, I: 126.904,
};

export function computeFormula(atoms: string[]): { formula: string; weight: number } {
  const counts: Record<string, number> = {};
  for (const el of atoms) counts[el] = (counts[el] || 0) + 1;

  // Hill order: C first, H second, then rest alphabetically
  let formula = '';
  const rest = Object.keys(counts).filter(e => e !== 'C' && e !== 'H').sort();
  if (counts['C']) formula += `C${counts['C'] > 1 ? counts['C'] : ''}`;
  if (counts['H']) formula += `H${counts['H'] > 1 ? counts['H'] : ''}`;
  for (const el of rest) formula += `${el}${counts[el] > 1 ? counts[el] : ''}`;

  let weight = 0;
  for (const [el, n] of Object.entries(counts)) {
    weight += (ATOMIC_MASS[el] || 0) * n;
  }

  return { formula, weight: Math.round(weight * 100) / 100 };
}

/** Parse PubChem data fields embedded after M END in the SDF */
function parsePubChemMeta(sdf: string): Partial<PubChemInfo> {
  const info: Partial<PubChemInfo> = {};
  const lines = sdf.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('> <PUBCHEM_COMPOUND_CID>')) {
      info.cid = lines[i + 1]?.trim();
    }
  }
  return info;
}

export async function fetch3D(smiles: string): Promise<{ sdf: string; info: PubChemInfo } | null> {
  const encoded = encodeURIComponent(smiles);

  try {
    const resp = await fetch(`${PUBCHEM_URL}/${encoded}/SDF?record_type=3d`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) {
        const meta = parsePubChemMeta(text);
        return { sdf: text, info: { source: 'pubchem', ...meta } };
      }
    }
  } catch { }

  try {
    const resp = await fetch(`${CIR_URL}/${encoded}/file?format=sdf&get3d=True`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) {
        return { sdf: text, info: { source: 'cir' } };
      }
    }
  } catch { }

  return null;
}
