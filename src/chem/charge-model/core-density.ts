// The core electrons GFN2-xTB leaves out, as a density: each element's
// free-atom core (the electrons below its GFN2 valence shells), spherically
// averaged, tabulated in core-density-table.ts.
//
// GFN2's density is its valence shells only — each atom's core is part of the
// point charge at its nucleus. That changes nothing in the potential, but the
// ESP's 0.001 au surface is drawn on the density, and an atom that keeps
// little valence density lies outside it: NaOH's Na⁺ handed its 3s electron
// to O, so the surface wrapped the OH and cut through the Na sphere (reported
// 2026-10-20). With the core back, the surface is the all-electron
// convention's — Na's core alone reaches 0.001 au at 1.33 Å — and for C, N or
// O, whose 1s core reaches it within 0.3 Å, nothing visible changes.

import { CORE_GRID, CORE_LOG_DENSITY } from './core-density-table';

const GROWTH = Math.log(CORE_GRID.last / CORE_GRID.first) / (CORE_GRID.points - 1);

/** The core density (e/bohr³) of `element` at `r` bohr from its nucleus:
 *  log-linear between grid points, flat inside the first (the surface never
 *  comes that close), zero past the table's end. */
export function coreDensity(element: string, r: number): number {
  const row = CORE_LOG_DENSITY[element];
  if (!row) return 0;
  const k = Math.log(Math.max(r, CORE_GRID.first) / CORE_GRID.first) / GROWTH;
  if (k >= row.length - 1) return 0;
  const below = Math.floor(k);
  const t = k - below;
  return 10 ** (row[below] * (1 - t) + row[below + 1] * t);
}

/** How far out (bohr) an element's tabulated core reaches; zero for H and He,
 *  which GFN2 treats whole. */
export function coreReach(element: string): number {
  const row = CORE_LOG_DENSITY[element];
  return row ? CORE_GRID.first * Math.exp(GROWTH * (row.length - 1)) : 0;
}
