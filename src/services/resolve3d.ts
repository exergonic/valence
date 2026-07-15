const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const CIR_URL = 'https://cactus.nci.nih.gov/chemical/structure';

export async function fetch3D(smiles: string): Promise<string | null> {
  const encoded = encodeURIComponent(smiles);

  try {
    const resp = await fetch(`${PUBCHEM_URL}/${encoded}/SDF?record_type=3d`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) return text;
    }
  } catch { }

  try {
    const resp = await fetch(`${CIR_URL}/${encoded}/file?format=sdf&get3d=True`);
    if (resp.ok) {
      const text = await resp.text();
      if (text.includes('V2000') || text.includes('V3000')) return text;
    }
  } catch { }

  return null;
}
