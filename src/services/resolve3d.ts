export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'fallback';
  cid?: number;
  name?: string;
  formula?: string;
  weight?: number;
}

const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const CIR_URL = 'https://cactus.nci.nih.gov/chemical/structure';

export async function fetch3D(smiles: string): Promise<{ sdf: string; info: PubChemInfo } | null> {
  const encoded = encodeURIComponent(smiles);

  // Try PubChem PUG REST for 3D SDF
  try {
    const resp = await fetch(`${PUBCHEM_BASE}/${encoded}/SDF?record_type=3d`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) {
        // Fetch properties in parallel
        const propPromise = fetch(`${PUBCHEM_BASE}/${encoded}/property/IUPACName,MolecularFormula,MolecularWeight,Title/JSON`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);

        const props = await propPromise;
        const p = props?.PropertyTable?.Properties?.[0];
        const info: PubChemInfo = {
          source: 'pubchem',
          cid: p?.CID,
          name: p?.Title || p?.IUPACName,
          formula: p?.MolecularFormula,
          weight: p?.MolecularWeight,
        };
        return { sdf: text, info };
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
