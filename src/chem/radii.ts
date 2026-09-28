// Van der Waals radii (Å) — the chemistry data the space-filling renderer,
// the ESP surface field, and any future surface work share. Lives here (the
// chem layer) so the ESP field construction doesn't reach into render.
const VDW_RADII: Record<string, number> = {
  H: 1.20, He: 1.40,
  Li: 1.82, Be: 1.53, B: 1.92,
  C: 1.70, N: 1.55, O: 1.52, F: 1.47, Ne: 1.54,
  Na: 2.27, Mg: 1.73, Al: 1.84,
  Si: 2.10, P: 1.80, S: 1.80, Cl: 1.75, Ar: 1.88,
  K: 2.75, Ca: 2.31,
  Fe: 2.04, Cu: 2.00, Zn: 2.10, Mn: 2.05,
  Br: 1.85, I: 1.98,
};

/** Van der Waals radius — used for space-filling (CPK) and the ESP surface. */
export function getVdwRadius(element: string): number {
  return VDW_RADII[element] ?? 1.50;
}