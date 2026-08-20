import type { Molecule } from '../mol-parser';
import { parseMolBlock } from '../mol-parser';
import { structuresMatch } from './validate-structure';

export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'local';
  cid?: string;
  name?: string;
  formula?: string;
  weight?: string;
  /** Generic-parameter warnings for the local MMFF94 path (see parameter-warnings.ts). */
  warnings?: string[];
}

/** A successfully fetched and validated 3D structure. */
export interface Fetch3DResult {
  /** Raw SDF text as returned by the service. */
  sdf: string;
  /** The parsed molecule (guaranteed to match the drawn reference). */
  molecule: Molecule;
  info: PubChemInfo;
}

const PUBCHEM_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles';
const PUBCHEM_CID_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid';
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

/** Parse the PubChem compound CID embedded after M END in the SDF */
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

/**
 * PubChem display name (Title) for a CID. The 3D SDF response carries the
 * CID but never a name, so we ask for the title separately once the CID is
 * known. Fail-soft: a slow, missing, or unparseable property response just
 * leaves the name unset rather than failing the whole lookup.
 */
async function fetchPubChemTitle(cid: string): Promise<string | undefined> {
  try {
    const resp = await fetch(`${PUBCHEM_CID_URL}/${cid}/property/Title/JSON`);
    if (!resp.ok) return undefined;
    const body = JSON.parse(await resp.text()) as
      { PropertyTable?: { Properties?: { Title?: string }[] } };
    return body.PropertyTable?.Properties?.[0]?.Title || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Try one 3D structure service, then reject any structure whose heavy-atom
 * graph doesn't match the sketched molecule (see validate-structure.ts).
 * The guard exists because the services resolve the query SMILES by their
 * own rules: JSME emits aromatic lower-case SMILES (e.g. "c1ccc1" for a
 * drawn cyclobutadiene), and PubChem/CIR both resolve that antiaromatic
 * 4-ring form to the saturated ring (cyclobutane, CID 9250) — without the
 * check the app would render the wrong compound while reporting "PubChem 3D".
 */
async function fetchValidated(
  url: string,
  reference: Molecule,
  makeInfo: (sdf: string) => PubChemInfo,
): Promise<Fetch3DResult | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text();
    // parseMolBlock handles both V2000 and V3000 (converting the latter).
    if (!text.includes('V2000') && !text.includes('V3000')) return null;
    const molecule = parseMolBlock(text);
    if (molecule.atoms.length === 0) return null;
    if (!structuresMatch(molecule, reference)) return null;
    return { sdf: text, molecule, info: makeInfo(text) };
  } catch {
    return null;
  }
}

export async function fetch3D(smiles: string, reference: Molecule): Promise<Fetch3DResult | null> {
  const encoded = encodeURIComponent(smiles);

  const pubchem = await fetchValidated(
    `${PUBCHEM_URL}/${encoded}/SDF?record_type=3d`,
    reference,
    (sdf) => ({ source: 'pubchem' as const, ...parsePubChemMeta(sdf) }),
  );
  if (pubchem) {
    // The structure is validated — trust the CID parsed from its own SDF and
    // fill in the display name (the SDF has no name field).
    if (pubchem.info.cid) {
      pubchem.info.name = await fetchPubChemTitle(pubchem.info.cid);
    }
    return pubchem;
  }

  const cir = await fetchValidated(
    `${CIR_URL}/${encoded}/file?format=sdf&get3d=True`,
    reference,
    () => ({ source: 'cir' as const }),
  );
  if (cir) return cir;

  return null;
}
