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
        .then((mod: any) => { RDKit = mod; resolve(); })
        .catch(reject);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Generate a sanitized MOL block with explicit hydrogens and 2D coordinates via RDKit.
 * Then pass through the graph-walk embedder + torsion optimizer for 3D.
 * Returns the MOL block with 2D coords and explicit H's (embedder converts to 3D).
 */
export async function generate2D(smiles: string): Promise<string | null> {
  try {
    await loadRDKit();

    const mol = RDKit.get_mol(smiles);
    if (!mol) return null;

    try {
      const withHsBlock: string = mol.add_hs();
      // create new mol from the H-added block, generate coords
      const molWithHs = RDKit.get_mol(withHsBlock);
      if (!molWithHs) return null;

      try {
        molWithHs.get_new_coords();
        return molWithHs.get_molblock();
      } finally {
        molWithHs.delete();
      }
    } finally {
      mol.delete();
    }
  } catch {
    return null;
  }
}
