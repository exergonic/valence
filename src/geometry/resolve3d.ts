import type { Molecule } from '../mol-parser';
import { parseMolBlock } from '../mol-parser';
import { structuresMatch, unrepresentableCharge } from './validate-structure';
import { ATOMIC_MASS } from '../chem/assign-mass';

export interface PubChemInfo {
  source: 'pubchem' | 'cir' | 'local';
  cid?: string;
  name?: string; // Title from the PubChem property record
  formula?: string; // computed from the parsed molecule (all sources)
  weight?: string;
  /** Generic-parameter warnings for the local MMFF94 path (see parameter-warnings.ts). */
  warnings?: string[];
  /** Curated PubChem record (source === 'pubchem'): the properties we pulled. */
  pubchem?: {
    formula?: string;
    weight?: string;
    iupacName?: string;
    smiles?: string;
    inchi?: string;
    inchikey?: string;
  };
  /** MMFF94 data parsed from the 3D SDF the structure came in (kcal/mol). */
  mmff94?: {
    energy?: string;
    partialCharges?: string; // comma-joined per-atom charges
  };
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

// Everything we want from PubChem's property endpoint, one request — the 3D
// SDF we download carries only the CID, so this fills in the curated record.
const PUBCHEM_PROPERTIES = 'Title,MolecularFormula,MolecularWeight,IUPACName,SMILES,InChI,InChIKey';

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

/** Parse the PubChem metadata blocks after M END in the SDF: the compound
 * CID plus the MMFF94 fields the 3D record embeds (energy and per-atom
 * partial charges). */
function parsePubChemMeta(sdf: string): Partial<PubChemInfo> {
  const info: Partial<PubChemInfo> = {};
  const lines = sdf.split('\n');
  let block: 'cid' | 'energy' | 'charges' | null = null;
  let chargeCount = 0;
  const charges: string[] = [];
  const mmff: NonNullable<PubChemInfo['mmff94']> = {};

  for (const line of lines) {
    if (line.startsWith('> <')) {
      block = line.startsWith('> <PUBCHEM_COMPOUND_CID>') ? 'cid'
        : line.startsWith('> <PUBCHEM_MMFF94_ENERGY>') ? 'energy'
        : line.startsWith('> <PUBCHEM_MMFF94_PARTIAL_CHARGES>') ? 'charges'
        : null;
      chargeCount = 0;
      continue;
    }
    const content = line.trim();
    if (block === null || content === '') continue;

    if (block === 'cid' && !info.cid) {
      info.cid = content;
    } else if (block === 'energy' && mmff.energy === undefined) {
      mmff.energy = content;
    } else if (block === 'charges') {
      if (chargeCount === 0) {
        chargeCount = parseInt(content, 10) || 0;
      } else if (charges.length < chargeCount) {
        charges.push(content.split(/\s+/)[1] ?? content);
      }
    }
  }
  if (charges.length > 0) mmff.partialCharges = charges.join(', ');
  if (mmff.energy !== undefined || mmff.partialCharges !== undefined) {
    info.mmff94 = mmff;
  }
  return info;
}

interface PubChemPropertyRow {
  Title?: string;
  MolecularFormula?: string;
  MolecularWeight?: string;
  IUPACName?: string;
  SMILES?: string;
  InChI?: string;
  InChIKey?: string;
}

/**
 * Pull the curated PubChem record for a CID — display name (Title), formula,
 * molecular weight, IUPAC name, SMILES, InChI, and InChI key. The 3D SDF we
 * download for the structure carries only the CID, so this one property
 * request fills in everything else once the CID is known. Fail-soft: a slow,
 * missing, or unparseable response just returns nothing rather than failing
 * the whole lookup.
 */
async function fetchPubChemRecord(cid: string): Promise<{ name?: string; pubchem: NonNullable<PubChemInfo['pubchem']> } | undefined> {
  try {
    const resp = await fetch(`${PUBCHEM_CID_URL}/${cid}/property/${PUBCHEM_PROPERTIES}/JSON`);
    if (!resp.ok) return undefined;
    const body = JSON.parse(await resp.text()) as
      { PropertyTable?: { Properties?: PubChemPropertyRow[] } };
    const p = body.PropertyTable?.Properties?.[0];
    if (!p) return undefined;
    return {
      name: p.Title,
      pubchem: {
        formula: p.MolecularFormula,
        weight: p.MolecularWeight,
        iupacName: p.IUPACName,
        smiles: p.SMILES,
        inchi: p.InChI,
        inchikey: p.InChIKey,
      },
    };
  } catch {
    return undefined;
  }
}

/**
 * Try one 3D structure service, then reject any structure the guard refuses:
 * identity first (heavy-atom graph + net formal charge must match the
 * sketched molecule — see validate-structure.ts; the services resolve the
 * query SMILES by their own rules: JSME emits aromatic lower-case SMILES
 * (e.g. "c1ccc1" for a drawn cyclobutadiene), and PubChem/CIR both resolve
 * that antiaromatic 4-ring form to the saturated ring (cyclobutane, CID
 * 9250)), geometry second (an ion the MMFF94 type space cannot represent
 * gets a neutral-type conformer — an artifact — and is rejected for the
 * local pipeline), and for PubChem specifically, record quality third: a
 * record without PUBCHEM_MMFF94_PARTIAL_CHARGES was never force-field-
 * relaxed — an unrelaxed template, not MMFF94 geometry. Methyl anion (CID
 * 881) ships exactly planar (D3h, the inversion transition state) at the
 * cation's energy with no charge block; CIR SDFs never carry PUBCHEM
 * blocks, so the CIR leg leaves that check off.
 */
async function fetchValidated(
  url: string,
  reference: Molecule,
  makeInfo: (sdf: string) => PubChemInfo,
  requireMmffCharges = false,
): Promise<Fetch3DResult | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text();
    // parseMolBlock handles both V2000 and V3000 (converting the latter).
    if (!text.includes('V2000') && !text.includes('V3000')) return null;
    const molecule = parseMolBlock(text);
    if (molecule.atoms.length === 0) return null;
    // Multi-stage guard. Identity: the heavy-atom graph AND the net formal
    // charge must match the sketch (structuresMatch). Geometry trust: a
    // fetched structure whose ion the MMFF94 type space cannot represent
    // (unrepresentableCharge) was built from neutral-type parameters, so its
    // shape is an artifact. Record quality (PubChem only): a record without
    // MMFF94 partial charges was never force-field-relaxed (requireMmffCharges).
    if (!structuresMatch(molecule, reference)) return null;
    const info = makeInfo(text);
    if (requireMmffCharges && info.mmff94?.partialCharges === undefined) return null;
    if (unrepresentableCharge(molecule)) return null;
    return { sdf: text, molecule, info };
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
    // PubChem's MMFF94 data rides in the SDF itself; a record without
    // partial charges was never force-field-relaxed (see fetchValidated).
    true,
  );
  if (pubchem) {
    // The structure is validated — trust the CID parsed from its own SDF and
    // fill in the curated property record (the SDF itself carries no name).
    if (pubchem.info.cid) {
      const record = await fetchPubChemRecord(pubchem.info.cid);
      if (record) {
        pubchem.info.name = record.name;
        pubchem.info.pubchem = record.pubchem;
      }
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
