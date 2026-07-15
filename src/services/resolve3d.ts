export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'fallback';
  cid?: string;
  name?: string;
  formula?: string;
  weight?: string;
}

const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const CIR_URL = 'https://cactus.nci.nih.gov/chemical/structure';

/** Parse PubChem data fields embedded after M END in the SDF */
function parsePubChemMeta(sdf: string): Partial<PubChemInfo> {
  const info: Partial<PubChemInfo> = {};
  const lines = sdf.split('\n');

  // First non-empty line is the compound name
  for (let i = 0; i < 3; i++) {
    const t = lines[i]?.trim();
    if (t && !t.startsWith('>')) { info.name = t; break; }
  }

  // Walk lines after M END, tracking index for the value on the next line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('> <PUBCHEM_COMPOUND_CID>')) {
      info.cid = lines[i + 1]?.trim();
    } else if (line.startsWith('> <PUBCHEM_MOLECULAR_FORMULA>')) {
      info.formula = lines[i + 1]?.trim();
    } else if (line.startsWith('> <PUBCHEM_MOLECULAR_WEIGHT>')) {
      info.weight = lines[i + 1]?.trim();
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
