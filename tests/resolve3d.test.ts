import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch3D } from '../src/geometry/resolve3d';
import {
  drawnCyclobutadiene,
  PUBCHEM_CYCLOBUTADIENE_SDF,
  PUBCHEM_CYCLOBUTANE_SDF,
} from './fixtures';

// Route the two fetch legs (PubChem then CIR) to canned SDF bodies, or 404
// when a leg is "missing"; the optional recordJson feeds PubChem's
// property endpoint. Returns the mock so tests can assert call count.
function mockFetch(pubchemBody: string | null, cirBody: string | null, recordJson: string | null = null) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/property/')) {
      return recordJson === null
        ? new Response('', { status: 404 })
        : new Response(recordJson, { status: 200 });
    }
    if (url.includes('pubchem.ncbi.nlm.nih.gov')) {
      return pubchemBody === null
        ? new Response('', { status: 404 })
        : new Response(pubchemBody, { status: 200 });
    }
    if (url.includes('cactus.nci.nih.gov')) {
      return cirBody === null
        ? new Response('', { status: 404 })
        : new Response(cirBody, { status: 200 });
    }
    return new Response('', { status: 404 });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetch3D validation guard', () => {
  it('accepts a PubChem structure that matches the drawn molecule', async () => {
    const fn = mockFetch(
      PUBCHEM_CYCLOBUTADIENE_SDF,
      null,
      '{"PropertyTable":{"Properties":[{"CID":"136879","Title":"Cyclobutadiene","MolecularFormula":"C4H4","MolecularWeight":"52.07","IUPACName":"cyclobuta-1,3-diene","SMILES":"C1=CC=C1","InChI":"InChI=1S/C4H4/c1-2-4-3-1/h1-4H","InChIKey":"HXJUTPCZVOIRPF-UHFFFAOYSA-N"}]}}',
    );
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    expect(result).not.toBeNull();
    expect(result!.info.source).toBe('pubchem');
    expect(result!.info.cid).toBe('136879');
    // The curated record comes from the property endpoint once the CID is
    // known — the 3D SDF itself carries neither the name nor these fields.
    expect(result!.info.name).toBe('Cyclobutadiene');
    expect(result!.info.pubchem).toMatchObject({
      formula: 'C4H4',
      weight: '52.07',
      iupacName: 'cyclobuta-1,3-diene',
      smiles: 'C1=CC=C1',
      inchi: 'InChI=1S/C4H4/c1-2-4-3-1/h1-4H',
      inchikey: 'HXJUTPCZVOIRPF-UHFFFAOYSA-N',
    });
    // The MMFF94 fields ride in with the 3D SDF itself.
    expect(result!.info.mmff94).toMatchObject({
      energy: '34.2918',
      partialCharges: '0.18, -0.18, 0.18, -0.18, 0.02, -0.02, 0.02, -0.02',
    });
    // One SDF request + one property request.
    expect(fn.mock.calls.length).toBe(2);
    // The returned molecule is the parsed (8-atom) diene, not the sketch.
    expect(result!.molecule.atoms).toHaveLength(8);
    expect(result!.molecule.bonds.some((b) => b.order === 2)).toBe(true);
  });

  it('accepts the structure even when the property lookup fails (record unset)', async () => {
    const fn = mockFetch(PUBCHEM_CYCLOBUTADIENE_SDF, null);
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    expect(result).not.toBeNull();
    expect(result!.info.cid).toBe('136879');
    expect(result!.info.name).toBeUndefined();
    expect(result!.info.pubchem).toBeUndefined();
    // The SDF-embedded MMFF94 data still lands even without the property call.
    expect(result!.info.mmff94?.energy).toBe('34.2918');
    expect(fn.mock.calls.length).toBe(2); // SDF + failed property attempt
  });

  it('rejects a mismatched PubChem structure and tries (then accepts) CIR', async () => {
    const fn = mockFetch(PUBCHEM_CYCLOBUTANE_SDF, PUBCHEM_CYCLOBUTADIENE_SDF);
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    // PubChem returned cyclobutane (CID 9250) for the drawn cyclobutadiene
    // — the guard must reject it and fall through to CIR, which returns the
    // correct diene.
    expect(result).not.toBeNull();
    expect(result!.info.source).toBe('cir');
    expect(result!.molecule.atoms).toHaveLength(8);
    // Both legs were attempted.
    expect(fn.mock.calls.length).toBe(2);
  });

  it('returns null when both services return a mismatched structure', async () => {
    const fn = mockFetch(PUBCHEM_CYCLOBUTANE_SDF, PUBCHEM_CYCLOBUTANE_SDF);
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    expect(result).toBeNull();
    expect(fn.mock.calls.length).toBe(2);
  });

  it('falls through to CIR when PubChem has no structure at all', async () => {
    mockFetch(null, PUBCHEM_CYCLOBUTADIENE_SDF);
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    expect(result).not.toBeNull();
    expect(result!.info.source).toBe('cir');
    expect(result!.molecule.atoms).toHaveLength(8);
  });
});
