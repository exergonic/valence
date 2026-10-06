import type { InfoNote } from './info-note';

export interface Example {
  name: string;
  mol: string;
  /**
   * The multiplicity of the reference calculation, when it is not a singlet.
   * A MOL block cannot say, so an example whose structure came from an
   * open-shell calculation says here — the MO panel then shows the ladder
   * without occupancies rather than a closed-shell filling it does not have.
   */
  multiplicity?: number;
  /** A fact the structure teaches that a student could mistake for an error,
   *  with where to read more. Shown first in the Info panel. */
  note?: InfoNote;
}

const JAHN_TELLER: InfoNote = {
  text: 'Not tetrahedral: the triplet is Jahn–Teller distorted to C3v.',
  link: {
    label: 'Jahn–Teller distortions',
    href: 'https://chem.libretexts.org/Bookshelves/Inorganic_Chemistry/Supplemental_Modules_and_Websites_(Inorganic_Chemistry)/Coordination_Chemistry/Structure_and_Nomenclature_of_Coordination_Compounds/Coordination_Numbers_and_Geometry/Jahn-Teller_Distortions',
  },
};

const HEADER = 'JME\n\n\n';

// Tetrahedral methane (sp³, 109.47°)
const METHANE = HEADER + `  5  4  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    1.0890 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.0267    0.0000   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5134    0.8890   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5134   -0.8890   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`;

const ETHENE = HEADER + `  6  5  0  0  0  0  0  0  0  0999 V2000
   -0.6675    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6675    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2244    0.9395    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2244   -0.9395    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2244    0.9395    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2244   -0.9395    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  2  5  1  0  0  0  0
  2  6  1  0  0  0  0
M  END
`;

const ETHYNE = HEADER + `  4  3  0  0  0  0  0  0  0  0999 V2000
   -0.6016    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6016    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.6616    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6616    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  3  0  0  0  0
  1  3  1  0  0  0  0
  2  4  1  0  0  0  0
M  END
`;

const WATER = HEADER + `  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.1173 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7574    0.0000   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7574    0.0000   -0.4692 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
M  END
`;

// Planar hexagonal benzene (sp², 120°)
const BENZENE = HEADER + ` 12 12  0  0  0  0  0  0  0  0999 V2000
    1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2450    2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2450    2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2450   -2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2450   -2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
  1  7  1  0  0  0  0
  2  8  1  0  0  0  0
  3  9  1  0  0  0  0
  4 10  1  0  0  0  0
  5 11  1  0  0  0  0
  6 12  1  0  0  0  0
M  END
`;

// Pyridine: same ring as benzene but C1 replaced with N, no H on N1
const PYRIDINE = HEADER + ` 11 11  0  0  0  0  0  0  0  0999 V2000
    1.4000    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2450    2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2450    2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4900    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2450   -2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2450   -2.1565    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  6  1  0  0  0  0
  6  1  2  0  0  0  0
  2  7  1  0  0  0  0
  3  8  1  0  0  0  0
  4  9  1  0  0  0  0
  5 10  1  0  0  0  0
  6 11  1  0  0  0  0
M  END
`;

// Pyrrole: 5-membered planar ring, N at top with H
const PYRROLE = HEADER + ` 10 10  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.2000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.1413    0.3708    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7053   -0.9708    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7053   -0.9708    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.1413    0.3708    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.2000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1773    0.7076    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.3462   -1.8526    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.3462   -1.8526    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1773    0.7076    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  1  1  0  0  0  0
  1  6  1  0  0  0  0
  2  7  1  0  0  0  0
  3  8  1  0  0  0  0
  4  9  1  0  0  0  0
  5 10  1  0  0  0  0
M  END
`;

// Phenol: MMFF94-optimized geometry (PubChem CID 996)
const PHENOL = HEADER + ` 13 13  0  0  0  0  0  0  0  0999 V2000
   -2.3622    0.0001   -0.0004 O   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0011    0.0000    0.0003 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.3037    1.2080    0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.3038   -1.2079    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0912    1.2080   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0911   -1.2080    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.7886    0.0000   -0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8351    2.1559    0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8415   -2.1521    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6345    2.1484   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6341   -2.1486   -0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.8747   -0.0001   -0.0004 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.6772    0.9203   -0.0005 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1 13  1  0  0  0  0
  2  3  2  0  0  0  0
  2  4  1  0  0  0  0
  3  5  1  0  0  0  0
  3  8  1  0  0  0  0
  4  6  2  0  0  0  0
  4  9  1  0  0  0  0
  5  7  2  0  0  0  0
  5 10  1  0  0  0  0
  6  7  1  0  0  0  0
  6 11  1  0  0  0  0
  7 12  1  0  0  0  0
M  END
`;

// Diatomic nitrogen — sp, triple bond, 2 orthogonal p orbital pairs
const N2 = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
   -0.5500    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.5500    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  3  0  0  0  0
M  END
`;

// Diatomic oxygen — sp², double bond
const O2 = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
   -0.6050    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.6050    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
M  END
`;

// Imidazole — 5-membered aromatic ring with two nitrogens
const IMIDAZOLE = HEADER + `  9  9  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.3000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2364    0.4019    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7644   -1.0518    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.7644   -1.0518    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2364    0.4019    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.3000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.2717    0.7379    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.4029   -1.9307    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.2717    0.7379    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  1  0  0  0  0
  4  5  2  0  0  0  0
  5  1  1  0  0  0  0
  1  6  1  0  0  0  0
  2  7  1  0  0  0  0
  4  8  1  0  0  0  0
  5  9  1  0  0  0  0
M  END
`;

// But-1-en-3-yne (H₂C=CH-C≡CH) — enyne with sp adjacent to sp² π system
// Geometry from PubChem (via Avogadro)
const BUTENYNE = HEADER + `  8  7  0  0  0  0  0  0  0  0999 V2000
    1.6406    0.4078   -0.0003 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6870   -0.5175   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6905   -0.1260    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.8198    0.1949    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.3768    1.4551   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.6794    0.1126    0.0041 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.9507   -1.5648   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.8298    0.4820    0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  3  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
  2  7  1  0  0  0  0
  4  8  1  0  0  0  0
M  END
`;

// Phosphorus pentachloride — the sp³d trigonal bipyramid: two axial
// Cl's (±z) and three equatorial Cl's at 120° in the xy plane.
// Geometry is the IDEAL TBP with the experimental bond lengths
// (axial 2.02 Å, equatorial 1.94 Å) — deliberately NOT MMFF94-
// refined: the MMFF potential has no parameters for 5-coordinate P
// and its minimum distorts the axial pairs to ~137–140° (measured
// 2026-08-12). The example exists to show the textbook geometry.
const PCL5 = HEADER + `  6  5  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 P   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    2.0200 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000   -2.0200 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    1.9400    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -0.9700    1.6801    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -0.9700   -1.6801    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
M  END
`;

// Sulfur hexafluoride — the sp³d² octahedron: six F's at ±1.561 Å
// on the three Cartesian axes (all F–S–F angles 90°/180°). The
// experimental S–F length is 1.561 Å. Like PCl₅, deliberately NOT
// MMFF94-refined (no parameters for hexacoordinate S) — the example
// exists to show the textbook geometry. PubChem has no 3D conformer
// (its generator fails on it, same as PCl₅); Cactus resolves one.
const SF6 = HEADER + `  7  6  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 S   0  0  0  0  0  0  0  0  0  0  0  0
    1.5610    0.0000    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5610    0.0000    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.5610    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.5610    0.0000 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    1.5610 F   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000   -1.5610 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
  1  7  1  0  0  0  0
M  END
`;



// Diborane, from the wB97X-D/6-31G(d,p) geometry in ~/Code/avo_ibo/examples
// (its bonds by distance). The hydrogen bridges are the 3c-2e case the
// classifier's `2e3c` gate exists for — see diborane.md in that corpus.
const DIBORANE = HEADER + `  8  8  0  0  0  0  0  0  0  0999 V2000
   -0.8810   -0.0001   -0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4605    1.0416    0.0004 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0001   -0.0002    0.9799 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4611   -1.0415   -0.0004 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0002    0.0010   -0.9798 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8810   -0.0001    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
    1.4607    1.0416    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.4609   -1.0416   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  3  6  1  0  0  0  0
  5  6  1  0  0  0  0
  6  7  1  0  0  0  0
  6  8  1  0  0  0  0
M  END`;


// Zinc chloride, from the geometry in ~/Code/avo_ibo/examples. The
// demonstration of the s+p exception: the table carries no 3d for zinc and a
// d¹⁰ shell is core-like, so it runs without d and the panel says so.
const ZNCL2 = HEADER + `  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    2.0700 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.0000 Zn  0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000   -2.0700 Cl  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END`;


// Tetrachloronickelate(II): the tetrahedral d8 complex, from the ORCA
// optimisation in ~/Code/orca_calcs/nickel-complexes/NiCl4 (wB97X-D/def2-TZVP,
// no imaginary modes). ORCA ran it as charge -2, MULTIPLICITY 3 — which is the
// right ground state for tetrahedral Ni(II), and is why the example carries a
// multiplicity: the app shows the ladder and refuses to fill it.
const NICL4 = HEADER + `  5  4  0  0  0  0  0  0  0  0999 V2000
   -0.0296   -0.0296    0.0296 Ni  0  0  0  0  0  0  0  0  0  0  0  0
    1.3539    1.3539    1.2733 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    1.3539   -1.2733   -1.3539 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -1.2733    1.3539   -1.3539 Cl  0  0  0  0  0  0  0  0  0  0  0  0
   -1.4049   -1.4049    1.4049 Cl  0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  CHG  5   1   2   2  -1   3  -1   4  -1   5  -1
M  END`;


// Tetracyanonickelate(II): the SQUARE PLANAR d8 complex, from the ORCA
// optimisation in ~/Code/orca_calcs/nickel-complexes/NiCN6 (charge -2,
// MULTIPLICITY 1 — a singlet, the diamagnetic partner of the tetrahedral
// triplet above; the pair is the ligand-field lesson). The C≡N bonds are
// written as triple: ORCA's output carries no bond orders, and as single
// bonds the hydrogen filler read each cyanide as short of bonds and put an H
// on every C and two on every N when the structure was refined.
const NICN4 = HEADER + `  9  8  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000   -0.0000 Ni  0  0  0  0  0  0  0  0  0  0  0  0
    1.9002   -0.0000   -0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0596   -0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
   -1.9002    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -3.0596   -0.0000   -0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0000    1.9002   -0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0000    3.0596    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.9002    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -3.0596   -0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  4  1  0  0  0  0
  1  6  1  0  0  0  0
  1  8  1  0  0  0  0
  2  3  3  0  0  0  0
  4  5  3  0  0  0  0
  6  7  3  0  0  0  0
  8  9  3  0  0  0  0
M  CHG  5   1   2   2  -1   4  -1   6  -1   8  -1
M  END`;

export const EXAMPLES: Example[] = [
  { name: 'Methane (CH₄)', mol: METHANE },
  { name: 'Ethene (C₂H₄)', mol: ETHENE },
  { name: 'Ethyne (C₂H₂)', mol: ETHYNE },
  { name: 'Benzene (C₆H₆)', mol: BENZENE },
  { name: 'Pyridine (C₅H₅N)', mol: PYRIDINE },
  { name: 'Pyrrole (C₄H₅N)', mol: PYRROLE },
  { name: 'Imidazole (C₃H₄N₂)', mol: IMIDAZOLE },
  { name: 'Phenol (C₆H₅OH)', mol: PHENOL },
  { name: 'Nitrogen (N₂)', mol: N2 },
  { name: 'Oxygen (O₂)', mol: O2 },
  { name: 'Water (H₂O)', mol: WATER },
  { name: 'Phosphorus pentachloride (PCl₅)', mol: PCL5 },
  { name: 'Sulfur hexafluoride (SF₆)', mol: SF6 },
  { name: 'But-1-en-3-yne (H₂C=CH-C≡CH)', mol: BUTENYNE },
  { name: 'Diborane (B₂H₆)', mol: DIBORANE },
  { name: 'Zinc chloride (ZnCl₂)', mol: ZNCL2 },
  { name: 'Tetrachloronickelate(II) ([NiCl₄]²⁻, triplet)', mol: NICL4, multiplicity: 3, note: JAHN_TELLER },
  { name: 'Tetracyanonickelate(II) ([Ni(CN)₄]²⁻, singlet)', mol: NICN4 },
];
