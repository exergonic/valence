/**
 * Extended-Hückel parameters: valence-state ionization potentials (eV) and
 * Slater exponents (bohr⁻¹) per element and orbital.
 *
 * The s and p rows are the **Alvarez** parameters — S. Alvarez's tables of
 * extended-Hückel parameters, in the form YAeHMOP ships them (`eht_parms.dat`,
 * whose README names Alvarez as the source). They are the same numbers WebMO's
 * built-in extended Hückel uses, which is why our levels can be pinned against
 * the YAeHMOP oracle (see tests/references/eht).
 *
 * **The 3d rows are ICON8's, not Alvarez's** — a second parameter set, on
 * purpose, because the first one has no second-row d orbitals at all: read
 * `eht_parms.dat` and Si, P, S and Cl carry s and p only (Al's d line is
 * zero-filled; the d entries the file does have are transition metals and the
 * f block). A molecule with sulfur therefore mixes two published sets —
 * Alvarez s/p with ICON8 d — and NOTES.md records that with the citations
 * rather than letting it hide here. What it buys is the d shell the plan asked
 * for: an extended-Hückel sulfur without one cannot show the antibonding
 * structure that makes sulfuranes and SF₆ readable.
 *
 * The two ζ values marked below are genuinely disputed in the literature (the
 * ICON8 default against the Slater-rule exponent); the ICON8 default is used
 * because it is the value behind the hypervalency studies these molecules come
 * from. It is a modelling choice, not a derivation, and the alternatives are
 * named so the next reader can change it knowingly.
 *
 * Scope: main-group elements with a complete s+p set, and 3d for the second
 * row (Si, P, S, Cl). Transition metals are deliberately absent — their d
 * shell is essential and must arrive with its own two-zeta expansion, so an
 * element outside this table gets no MOs rather than wrong ones. Extracted
 * from the shipped tables rather than retyped; the fixture tests re-derive
 * every number through the overlaps and the Hamiltonian.
 */
export interface OrbitalParameters {
  /** Principal quantum number — labels the orbital (2s, 2p) and scales the
   *  radial power in the overlap integrals. */
  n: number;
  /** Valence-state ionization potential (eV), the Coulomb term Hᵢᵢ. The
   *  table stores it already negative. */
  hii: number;
  /** Slater exponent ζ (bohr⁻¹) — single zeta throughout this table. */
  zeta: number;
}

export interface ElementParameters {
  s: OrbitalParameters;
  /** p is absent for hydrogen and helium, whose valence shell is 1s only. */
  p?: OrbitalParameters;
  /** 3d, present for the second-row elements (ICON8's values — see above). */
  d?: OrbitalParameters;
}

export const EH_PARAMETERS: Record<string, ElementParameters> = {
  H: { s: { n: 1, hii: -13.6, zeta: 1.3 } },
  HE: { s: { n: 1, hii: -23.4, zeta: 1.688 } },
  LI: { s: { n: 2, hii: -5.4, zeta: 0.65 }, p: { n: 2, hii: -3.5, zeta: 0.65 } },
  BE: { s: { n: 2, hii: -10, zeta: 0.975 }, p: { n: 2, hii: -6, zeta: 0.975 } },
  B: { s: { n: 2, hii: -15.2, zeta: 1.3 }, p: { n: 2, hii: -8.5, zeta: 1.3 } },
  C: { s: { n: 2, hii: -21.4, zeta: 1.625 }, p: { n: 2, hii: -11.4, zeta: 1.625 } },
  N: { s: { n: 2, hii: -26, zeta: 1.95 }, p: { n: 2, hii: -13.4, zeta: 1.95 } },
  O: { s: { n: 2, hii: -32.3, zeta: 2.275 }, p: { n: 2, hii: -14.8, zeta: 2.275 } },
  F: { s: { n: 2, hii: -40, zeta: 2.425 }, p: { n: 2, hii: -18.1, zeta: 2.425 } },
  NE: { s: { n: 2, hii: -43.2, zeta: 2.879 }, p: { n: 2, hii: -20, zeta: 2.879 } },
  NA: { s: { n: 3, hii: -5.1, zeta: 0.733 }, p: { n: 3, hii: -3, zeta: 0.733 } },
  MG: { s: { n: 3, hii: -9, zeta: 1.1 }, p: { n: 3, hii: -4.5, zeta: 1.1 } },
  AL: { s: { n: 3, hii: -12.3, zeta: 1.167 }, p: { n: 3, hii: -6.5, zeta: 1.167 } },
  // 3d from ICON8 (QCPE 517) BLOCK DATA; the citation is the study the value
  // was chosen for, and the parenthetical is the Slater-rule alternative.
  SI: { s: { n: 3, hii: -17.3, zeta: 1.383 }, p: { n: 3, hii: -9.2, zeta: 1.383 },
    d: { n: 3, hii: -6.0, zeta: 1.383 } },                       // Mollere & Hoffmann, JACS 97, 3680 (1975)
  P: { s: { n: 3, hii: -18.6, zeta: 1.75 }, p: { n: 3, hii: -14, zeta: 1.3 },
    d: { n: 3, hii: -7.0, zeta: 1.4 } },                         // Boyd & Hoffmann, JACS 93, 1064 (1971); ζ 1.600 alternative
  S: { s: { n: 3, hii: -20, zeta: 2.122 }, p: { n: 3, hii: -11, zeta: 1.827 },
    d: { n: 3, hii: -8.0, zeta: 1.5 } },                         // Chen & Hoffmann, JACS 98, 1647 (1976); ζ 1.817 alternative
  CL: { s: { n: 3, hii: -26.3, zeta: 2.183 }, p: { n: 3, hii: -14.2, zeta: 1.733 },
    d: { n: 3, hii: -9.0, zeta: 2.033 } },                       // ICON8 BLOCK DATA
  K: { s: { n: 4, hii: -4.34, zeta: 0.874 }, p: { n: 4, hii: -2.73, zeta: 0.874 } },
  CA: { s: { n: 4, hii: -7, zeta: 1.2 }, p: { n: 4, hii: -4, zeta: 1.2 } },
  GA: { s: { n: 4, hii: -14.58, zeta: 1.77 }, p: { n: 4, hii: -6.75, zeta: 1.55 } },
  GE: { s: { n: 4, hii: -16, zeta: 2.16 }, p: { n: 4, hii: -9, zeta: 1.85 } },
  AS: { s: { n: 4, hii: -16.22, zeta: 2.23 }, p: { n: 4, hii: -12.16, zeta: 1.89 } },
  SE: { s: { n: 4, hii: -20.5, zeta: 2.44 }, p: { n: 4, hii: -14.4, zeta: 2.07 } },
  BR: { s: { n: 4, hii: -22.07, zeta: 2.588 }, p: { n: 4, hii: -13.1, zeta: 2.131 } },
  RB: { s: { n: 5, hii: -4.18, zeta: 0.997 }, p: { n: 5, hii: -2.6, zeta: 0.997 } },
  SR: { s: { n: 5, hii: -6.62, zeta: 1.214 }, p: { n: 5, hii: -3.92, zeta: 1.214 } },
  IN: { s: { n: 5, hii: -12.6, zeta: 1.903 }, p: { n: 5, hii: -6.19, zeta: 1.677 } },
  SN: { s: { n: 5, hii: -16.16, zeta: 2.12 }, p: { n: 5, hii: -8.32, zeta: 1.82 } },
  SB: { s: { n: 5, hii: -18.8, zeta: 2.323 }, p: { n: 5, hii: -11.7, zeta: 1.999 } },
  TE: { s: { n: 5, hii: -20.8, zeta: 2.51 }, p: { n: 5, hii: -14.8, zeta: 2.16 } },
  I: { s: { n: 5, hii: -18, zeta: 2.679 }, p: { n: 5, hii: -12.7, zeta: 2.322 } },
};
