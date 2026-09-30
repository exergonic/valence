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
  /** Slater exponent ζ (bohr⁻¹). */
  zeta: number;
  /** The second exponent of a CONTRACTED orbital (the d block's d rows), and
   *  the pair's coefficients. Absent for the single-zeta orbitals. */
  zeta2?: number;
  coefficients?: [number, number];
}

export interface ElementParameters {
  s: OrbitalParameters;
  /** p is absent for hydrogen and helium, whose valence shell is 1s only. */
  p?: OrbitalParameters;
  /** The d shell: 3d for the second-row elements (ICON8's values) and for the
   *  d block, where it is contracted — see `zeta2`. */
  d?: OrbitalParameters;
}

/**
 * The d-block elements carried s+p only (see the d-block note): a d¹⁰ ion
 * whose d the table does not parameterize. The panel names them when they
 * appear, so "no d orbitals on this atom" is never a silent absence.
 */
export const SP_ONLY_METALS = new Set(['ZN', 'CD']);

/** One Slater term: an exponent and how much of it the orbital carries. */
export interface SlaterTerm {
  zeta: number;
  coefficient: number;
}

/**
 * The terms an orbital is built from: one for Alvarez's single-zeta s and p,
 * two for a contracted d. Consumers loop over these instead of reading `zeta`
 * directly, so a contraction is a matter of summing rather than of a second
 * code path.
 */
export function slaterTerms(orbital: OrbitalParameters): SlaterTerm[] {
  if (orbital.zeta2 === undefined || orbital.coefficients === undefined) {
    return [{ zeta: orbital.zeta, coefficient: 1 }];
  }
  return [
    { zeta: orbital.zeta, coefficient: orbital.coefficients[0] },
    { zeta: orbital.zeta2, coefficient: orbital.coefficients[1] },
  ];
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
  // ── The d block ──────────────────────────────────────────────────────────
  // Sc–Cu, Zr–Pd and Lu, Ta–Hg, extracted from the same shipped table. Their d
  // rows are CONTRACTED: two Slater exponents with a coefficient each, which is
  // what `zeta2`/`coefficients` carry. Two things the extraction had to decide:
  //
  //  * The table's coefficients are not all normalized. The on-site overlap of
  //    a two-zeta d is c1² + 2·c1·c2·S(ζ1,ζ2) + c2², and across the table's 31
  //    two-zeta rows that quantity ranges from 0.9955 to 1.2457 — so most rows
  //    are properly normalized, some are 10–25% out, and Fe (the fixture below)
  //    is 1.000000. We divide each pair by √(that norm), because a basis
  //    function of unit norm is what the on-site S = 1 convention this whole
  //    codebase rests on assumes. For Fe the factor is 1 to the precision the
  //    table carries, so the oracle comparison is untouched; the raw norms are
  //    recorded in NOTES.md.
  //  * Five d-block elements are refused rather than half-supported: Y, Ag and
  //    Hf carry zero-filled placeholders. An element whose d shell is a guess
  //    gets no MOs, per the rule above.
  //
  // Zn and Cd are the exception, and they are a chemical one. The table has no
  // d row for Zn at all, and only a placeholder for Cd — but both are d¹⁰
  // ions, where the closed d shell is core-like and the bonding runs on 4s/4p
  // (5s/5p). Their s and p rows are in the table, so they are carried s+p
  // only, and SP_ONLY_METALS below is what the panel reads to say so out loud.
  // Refusing them would be a rule applied past its reason.

  SC: { s: { n: 4, hii: -8.87, zeta: 1.3 }, p: { n: 4, hii: -2.75, zeta: 1.3 }, d: { n: 3, hii: -8.51, zeta: 4.35, zeta2: 1.7, coefficients: [0.4228, 0.7276] } },
  TI: { s: { n: 4, hii: -8.97, zeta: 1.075 }, p: { n: 4, hii: -5.44, zeta: 1.075 }, d: { n: 3, hii: -10.81, zeta: 4.55, zeta2: 1.4, coefficients: [0.4206, 0.7839] } },
  V: { s: { n: 4, hii: -8.81, zeta: 1.3 }, p: { n: 4, hii: -5.52, zeta: 1.3 }, d: { n: 3, hii: -11.0, zeta: 4.75, zeta2: 1.7, coefficients: [0.4755, 0.7052] } },
  CR: { s: { n: 4, hii: -8.66, zeta: 1.7 }, p: { n: 4, hii: -5.24, zeta: 1.7 }, d: { n: 3, hii: -11.22, zeta: 4.95, zeta2: 1.8, coefficients: [0.5058, 0.6747] } },
  MN: { s: { n: 4, hii: -9.75, zeta: 0.97 }, p: { n: 4, hii: -5.89, zeta: 0.97 }, d: { n: 3, hii: -11.67, zeta: 5.15, zeta2: 1.7, coefficients: [0.5139, 0.6929] } },
  FE: { s: { n: 4, hii: -9.1, zeta: 1.9 }, p: { n: 4, hii: -5.32, zeta: 1.9 }, d: { n: 3, hii: -12.6, zeta: 5.35, zeta2: 2.0, coefficients: [0.5505, 0.626] } },
  CO: { s: { n: 4, hii: -9.21, zeta: 2.0 }, p: { n: 4, hii: -5.29, zeta: 2.0 }, d: { n: 3, hii: -13.18, zeta: 5.55, zeta2: 2.1, coefficients: [0.5679, 0.6059] } },
  NI: { s: { n: 4, hii: -10.95, zeta: 2.1 }, p: { n: 4, hii: -6.27, zeta: 2.1 }, d: { n: 3, hii: -14.2, zeta: 5.75, zeta2: 2.3, coefficients: [0.5493, 0.6082] } },
  CU: { s: { n: 4, hii: -11.4, zeta: 2.2 }, p: { n: 4, hii: -6.06, zeta: 2.2 }, d: { n: 3, hii: -14.0, zeta: 5.95, zeta2: 2.3, coefficients: [0.5933, 0.5744] } },
  ZR: { s: { n: 5, hii: -9.87, zeta: 1.817 }, p: { n: 5, hii: -6.76, zeta: 1.776 }, d: { n: 4, hii: -11.18, zeta: 3.835, zeta2: 1.505, coefficients: [0.6224, 0.5782] } },
  NB: { s: { n: 5, hii: -10.1, zeta: 1.89 }, p: { n: 5, hii: -6.86, zeta: 1.85 }, d: { n: 4, hii: -12.1, zeta: 4.08, zeta2: 1.64, coefficients: [0.6401, 0.5516] } },
  MO: { s: { n: 5, hii: -8.34, zeta: 1.96 }, p: { n: 5, hii: -5.24, zeta: 1.9 }, d: { n: 4, hii: -10.5, zeta: 4.54, zeta2: 1.9, coefficients: [0.5899, 0.5899] } },
  TC: { s: { n: 5, hii: -10.07, zeta: 2.018 }, p: { n: 5, hii: -5.4, zeta: 1.984 }, d: { n: 4, hii: -12.82, zeta: 4.9, zeta2: 2.094, coefficients: [0.5715, 0.6012] } },
  RU: { s: { n: 5, hii: -10.4, zeta: 2.08 }, p: { n: 5, hii: -6.87, zeta: 2.04 }, d: { n: 4, hii: -14.9, zeta: 5.38, zeta2: 2.3, coefficients: [0.5342, 0.6368] } },
  RH: { s: { n: 5, hii: -8.09, zeta: 2.135 }, p: { n: 5, hii: -4.57, zeta: 2.1 }, d: { n: 4, hii: -12.5, zeta: 4.29, zeta2: 1.97, coefficients: [0.5807, 0.5685] } },
  PD: { s: { n: 5, hii: -7.32, zeta: 2.19 }, p: { n: 5, hii: -3.75, zeta: 2.152 }, d: { n: 4, hii: -12.02, zeta: 5.983, zeta2: 2.613, coefficients: [0.5264, 0.6373] } },
  LU: { s: { n: 6, hii: -6.05, zeta: 1.666 }, p: { n: 6, hii: -6.05, zeta: 1.666 }, d: { n: 5, hii: -5.12, zeta: 2.813, zeta2: 1.21, coefficients: [0.7044, 0.488] } },
  TA: { s: { n: 6, hii: -10.1, zeta: 2.28 }, p: { n: 6, hii: -6.86, zeta: 2.241 }, d: { n: 5, hii: -12.1, zeta: 4.762, zeta2: 1.938, coefficients: [0.6106, 0.6106] } },
  W: { s: { n: 6, hii: -8.26, zeta: 2.341 }, p: { n: 6, hii: -5.17, zeta: 2.309 }, d: { n: 5, hii: -10.37, zeta: 4.982, zeta2: 2.068, coefficients: [0.6685, 0.5424] } },
  RE: { s: { n: 6, hii: -9.36, zeta: 2.398 }, p: { n: 6, hii: -5.96, zeta: 2.372 }, d: { n: 5, hii: -12.66, zeta: 5.343, zeta2: 2.277, coefficients: [0.6378, 0.5658] } },
  OS: { s: { n: 6, hii: -8.17, zeta: 2.452 }, p: { n: 6, hii: -4.81, zeta: 2.429 }, d: { n: 5, hii: -11.84, zeta: 5.571, zeta2: 2.416, coefficients: [0.6372, 0.5598] } },
  IR: { s: { n: 6, hii: -11.36, zeta: 2.5 }, p: { n: 6, hii: -4.5, zeta: 2.2 }, d: { n: 5, hii: -12.17, zeta: 5.796, zeta2: 2.557, coefficients: [0.6351, 0.5556] } },
  PT: { s: { n: 6, hii: -9.077, zeta: 2.554 }, p: { n: 6, hii: -5.475, zeta: 2.554 }, d: { n: 5, hii: -12.59, zeta: 6.013, zeta2: 2.696, coefficients: [0.6334, 0.5513] } },
  AU: { s: { n: 6, hii: -10.92, zeta: 2.602 }, p: { n: 6, hii: -5.55, zeta: 2.584 }, d: { n: 5, hii: -15.07, zeta: 6.163, zeta2: 2.794, coefficients: [0.6442, 0.5356] } },
  HG: { s: { n: 6, hii: -13.68, zeta: 2.649 }, p: { n: 6, hii: -8.47, zeta: 2.631 }, d: { n: 5, hii: -17.5, zeta: 6.436, zeta2: 3.032, coefficients: [0.6438, 0.5215] } },
  // s+p only, deliberately — see the note above the d block
  ZN: { s: { n: 4, hii: -12.41, zeta: 2.01 }, p: { n: 4, hii: -6.53, zeta: 1.7 } },
  CD: { s: { n: 5, hii: -11.8, zeta: 1.64 }, p: { n: 5, hii: -8.2, zeta: 1.6 } },
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
