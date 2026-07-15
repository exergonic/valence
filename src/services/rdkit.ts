let RDKit: any = null;
let loading: Promise<void> | null = null;

async function loadRDKit(): Promise<void> {
  if (RDKit) return;
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/rdkit/RDKit_minimal.js';
    script.async = true;
    script.onload = () => {
      (window as any).initRDKitModule({ locateFile: () => '/rdkit/RDKit_minimal.wasm' })
        .then((mod: any) => {
          RDKit = mod;
          resolve();
        })
        .catch(reject);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return loading;
}

export async function generate3DFromSMILES(smiles: string): Promise<string | null> {
  try {
    await loadRDKit();

    const mol = RDKit.get_mol(smiles);
    if (!mol) return null;

    try {
      mol.generate_conformers();
      const sdf = mol.get_sdf();
      if (sdf && (sdf.includes('V2000') || sdf.includes('V3000'))) {
        return sdf;
      }
      return null;
    } finally {
      mol.delete();
    }
  } catch {
    return null;
  }
}
