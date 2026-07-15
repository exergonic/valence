export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'fallback';
  cid?: number;
  name?: string;
  formula?: string;
  weight?: number;
}

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const CIR_URL = 'https://cactus.nci.nih.gov/chemical/structure';

async function fetchProps(smiles: string): Promise<Partial<PubChemInfo>> {
  const encoded = encodeURIComponent(smiles);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(
      `${PUBCHEM_BASE}/${encoded}/property/IUPACName,MolecularFormula,MolecularWeight/JSON`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!resp.ok) return {};
    const data = await resp.json();
    const p = data?.PropertyTable?.Properties?.[0];
    return {
      cid: p?.CID,
      name: p?.IUPACName,
      formula: p?.MolecularFormula,
      weight: p?.MolecularWeight,
    };
  } catch {
    return {};
  }
}

export async function fetch3D(smiles: string): Promise<{ sdf: string; info: PubChemInfo } | null> {
  const encoded = encodeURIComponent(smiles);

  // Try PubChem PUG REST for 3D SDF
  try {
    const resp = await fetch(`${PUBCHEM_BASE}/${encoded}/SDF?record_type=3d`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) {
        const props = await fetchProps(smiles);
        return { sdf: text, info: { source: 'pubchem', ...props } };
      }
    }
  } catch { }

  // Try CIR fallback
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
