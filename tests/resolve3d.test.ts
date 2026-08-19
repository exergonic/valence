import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch3D } from '../src/geometry/resolve3d';
import {
  drawnCyclobutadiene,
  PUBCHEM_CYCLOBUTADIENE_SDF,
  PUBCHEM_CYCLOBUTANE_SDF,
} from './fixtures';

// Route the two fetch legs (PubChem then CIR) to canned SDF bodies, or 404
// when a leg is "missing". Returns the mock so tests can assert call count.
function mockFetch(pubchemBody: string | null, cirBody: string | null) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
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
    mockFetch(PUBCHEM_CYCLOBUTADIENE_SDF, null);
    const result = await fetch3D('C1=CC=C1', drawnCyclobutadiene);

    expect(result).not.toBeNull();
    expect(result!.info.source).toBe('pubchem');
    expect(result!.info.cid).toBe('136879');
    // The returned molecule is the parsed (8-atom) diene, not the sketch.
    expect(result!.molecule.atoms).toHaveLength(8);
    expect(result!.molecule.bonds.some((b) => b.order === 2)).toBe(true);
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
