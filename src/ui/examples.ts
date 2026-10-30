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

// GFN2-xTB bends ZnCl₂: its minimum is at 134°, 0.72 kcal/mol below linear,
// and the Fortran xTB oracle agrees (NOTES.md, 2026-10-20). Experiment finds
// the vapour's molecule linear, so the example keeps the linear structure and
// says why a GFN2 refinement will not.
const ZNCL2_LINEAR: InfoNote = {
  text: 'Linear, as experiment finds gas-phase ZnCl₂ — the geometry shown is that shape. '
    + 'GFN2-xTB bends it to about 134° (0.7 kcal/mol lower), an error of the semiempirical model, '
    + 'so "Refine with GFN2-xTB" will show it bent.',
  link: {
    label: 'Group 12 dihalides, from gas to solid',
    href: 'https://doi.org/10.1002/chem.200801035',
  },
};

const HEADER = 'JME\n\n\n';

// Every structure is a wB97X-D3/def2-TZVP minimum from ORCA (a minimum: no
// imaginary mode), unless its comment says otherwise: the coordinates moved
// onto the atom order and frame of the drawing each replaced (2026-10-29).
// The runs are in ~/orca_calcs (lone-pairs/, examples/), the structures in
// tests/references/dft with their README. PCl5, SF6 and ZnCl2 are kept ideal
// on purpose, as their comments say.

// Tetrahedral methane (sp³, 109.47°)
const METHANE = HEADER + `  5  4  0  0  0  0  0  0  0  0999 V2000
   -0.0001    0.0000    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0001    0.0000    1.0890 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.0264    0.0000   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5133    0.8891   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5133   -0.8891   -0.3630 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
M  END
`;

const ETHENE = HEADER + `  6  5  0  0  0  0  0  0  0  0999 V2000
   -0.6609    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6609    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2298    0.9228    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2298   -0.9228    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2298    0.9228    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2298   -0.9228    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  2  5  1  0  0  0  0
  2  6  1  0  0  0  0
M  END
`;

const ETHYNE = HEADER + `  4  3  0  0  0  0  0  0  0  0999 V2000
   -0.5974    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.5974    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.6621    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6621    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  3  0  0  0  0
  1  3  1  0  0  0  0
  2  4  1  0  0  0  0
M  END
`;

const WATER = HEADER + `  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.1132 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7622    0.0000   -0.4671 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7622    0.0000   -0.4671 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
M  END
`;

// Planar hexagonal benzene (sp², 120°)
const BENZENE = HEADER + ` 12 12  0  0  0  0  0  0  0  0999 V2000
    1.3874    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6936    1.2013    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6936    1.2013    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.3874    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6936   -1.2013    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6936   -1.2013    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4709    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2355    2.1397    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2355    2.1397    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4709    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2355   -2.1397    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2355   -2.1397    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
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

// Pyridine: no H on N1
const PYRIDINE = HEADER + ` 11 11  0  0  0  0  0  0  0  0999 V2000
    1.3709    0.0001    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.6797    1.1352    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7059    1.1904    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4133    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7056   -1.1902    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6799   -1.1351    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2650    2.0499   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2143    2.1462    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.4968   -0.0003    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2140   -2.1460    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2645   -2.0503    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
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
    0.0000    1.1277    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    1.1169    0.3425    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7099   -0.9641   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7098   -0.9641    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.1169    0.3425    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    2.1297    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1040    0.7748    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.3565   -1.8268   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.3565   -1.8268    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1040    0.7747   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
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

// Phenol
const PHENOL = HEADER + ` 13 13  0  0  0  0  0  0  0  0999 V2000
   -2.3466   -0.0313    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -0.9880    0.0176    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2855    1.2160   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.3025   -1.1909    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.1012    1.2014   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0812   -1.1916   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.7927    0.0009   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8230    2.1592   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8679   -2.1142   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6419    2.1403   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.6108   -2.1369   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.8752   -0.0071   -0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.6999    0.8605   -0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
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
   -0.5441    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.5441    0.0000    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  3  0  0  0  0
M  END
`;

// Diatomic oxygen — sp², double bond
const O2 = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
   -0.5967    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.5967    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
M  END
`;

// Imidazole — 5-membered aromatic ring with two nitrogens
const IMIDAZOLE = HEADER + `  9  9  0  0  0  0  0  0  0  0999 V2000
    0.0190    1.1595    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0536    0.3297    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6938   -0.9245    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    0.6772   -0.9096    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.1409    0.3712    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0035    2.1622    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.0690    0.6961    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2504   -1.8230    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1354    0.7836    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
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
const BUTENYNE = HEADER + `  8  7  0  0  0  0  0  0  0  0999 V2000
    1.6768    0.4105    0.0009 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.6841   -0.4720    0.0006 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6984   -0.1114    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.8641    0.1700   -0.0003 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.4862    1.4765    0.0009 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.7086    0.0836    0.0013 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8991   -1.5357    0.0007 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.8979    0.4224   -0.0006 H   0  0  0  0  0  0  0  0  0  0  0  0
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



// Diborane, its bonds as ~/Code/avo_ibo/examples draws them (by distance,
// eight B–H, no B–B). The hydrogen bridges are the 3c-2e case the
// classifier's `2e3c` gate exists for — see diborane.md in that corpus.
const DIBORANE = HEADER + `  8  8  0  0  0  0  0  0  0  0999 V2000
   -0.8769    0.0000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4553    1.0410    0.0004 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -0.0001    0.9815 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4554   -1.0409   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0001    0.0008   -0.9816 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.8769    0.0000    0.0000 B   0  0  0  0  0  0  0  0  0  0  0  0
    1.4553    1.0409    0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.4553   -1.0410   -0.0004 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  3  6  1  0  0  0  0
  5  6  1  0  0  0  0
  6  7  1  0  0  0  0
  6  8  1  0  0  0  0
M  END`;


// Zinc chloride, from the geometry in ~/Code/avo_ibo/examples (GFN1-xTB,
// linear, 2.07 Å — linear as the vapour's molecule is; GFN2 would bend it, see
// ZNCL2_LINEAR). The demonstration of the s+p exception: the table carries no
// 3d for zinc and a d¹⁰ shell is core-like, so it runs without d and the panel
// says so.
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

// From the wB97X-D3/def2-TZVP minima in tests/references/dft (ORCA; each a
// minimum, see its README): the coordinates as ORCA left them, the bonds and
// charges the Lewis structure's. The lone-pair tests run on the same files.
const AMMONIA = HEADER + `  4  3  0  0  0  0  0  0  0  0999 V2000
    1.0144    0.0377   -0.0997 N   0  0  0  0  0  0  0  0  0  0  0  0
    2.0247    0.0571   -0.0742 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.6926    0.9919   -0.1888 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.6925   -0.3110    0.7928 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
M  END
`;

const AZIRIDINE = HEADER + `  8  8  0  0  0  0  0  0  0  0999 V2000
   -0.0274    0.8407   -0.0553 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7660   -0.3961    0.0826 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6865   -0.4602   -0.0335 N   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0645    1.3566   -1.0071 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.1166    1.4828    0.8141 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.2202   -0.5995    1.0462 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.3098   -0.7880   -0.7683 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.1102   -0.6305    0.8695 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
  1  5  1  0  0  0  0
  2  3  1  0  0  0  0
  2  6  1  0  0  0  0
  2  7  1  0  0  0  0
  3  8  1  0  0  0  0
M  END
`;

const FORMALDEHYDE = HEADER + `  4  3  0  0  0  0  0  0  0  0999 V2000
    0.5815    0.0000    0.0007 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.6144   -0.0000   -0.0003 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.1671    0.9393    0.0012 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.1671   -0.9393    0.0012 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  4  1  0  0  0  0
M  END
`;

const METHYL_ISOCYANATE = HEADER + `  7  6  0  0  0  0  0  0  0  0999 V2000
    1.0177   -0.0731    0.0906 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.4220   -0.3641    0.1242 N   0  0  0  0  0  0  0  0  0  0  0  0
    3.1668   -1.2843    0.2755 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.9854   -2.1065    0.4095 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.8808    0.9952   -0.0644 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.5402   -0.3512    1.0314 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.5297   -0.6063   -0.7267 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
  1  7  1  0  0  0  0
  2  3  2  0  0  0  0
  3  4  2  0  0  0  0
M  END
`;

const OZONE = HEADER + `  3  2  0  0  0  0  0  0  0  0999 V2000
   -1.0592    0.2122    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0000   -0.4243    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.0592    0.2122    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
M  CHG  2   2   1   3  -1
M  END
`;

const SF4 = HEADER + `  5  4  0  0  0  0  0  0  0  0999 V2000
    1.1637   -0.2482    0.6385 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.4472    0.0329   -0.3568 S   0  0  0  0  0  0  0  0  0  0  0  0
    3.8535    0.2668   -1.1839 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.0146    0.9674    0.7444 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.0109   -1.3427    0.0873 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  2  4  1  0  0  0  0
  2  5  1  0  0  0  0
M  END
`;

const CLF3 = HEADER + `  4  3  0  0  0  0  0  0  0  0999 V2000
    0.9444   -0.1631    0.5543 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.2820    0.0404   -0.4581 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    3.7088    0.2165   -1.3456 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.1959   -0.2317    0.8182 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  2  4  1  0  0  0  0
M  END
`;

const XEF2 = HEADER + `  3  2  0  0  0  0  0  0  0  0999 V2000
    0.9651    0.0644    0.0706 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.9407    0.0644    0.0706 Xe  0  0  0  0  0  0  0  0  0  0  0  0
    4.9163    0.0644    0.0706 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
M  END
`;

const BRF5 = HEADER + `  6  5  0  0  0  0  0  0  0  0999 V2000
    1.8853   -1.1272   -1.1521 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.3156    0.0492    0.0898 Br  0  0  0  0  0  0  0  0  0  0  0  0
    3.0702    1.1453    1.2479 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.4759   -1.2647    1.2559 F   0  0  0  0  0  0  0  0  0  0  0  0
    2.4812    1.2837   -1.1594 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.9195   -0.3483   -0.3260 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  2  4  1  0  0  0  0
  2  5  1  0  0  0  0
  2  6  1  0  0  0  0
M  END
`;

const XEF4 = HEADER + `  5  4  0  0  0  0  0  0  0  0999 V2000
    1.5590   -0.3006    1.3032 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.0300   -0.0194    0.0773 Xe  0  0  0  0  0  0  0  0  0  0  0  0
    2.7708    1.8950    0.2062 F   0  0  0  0  0  0  0  0  0  0  0  0
    3.2809   -1.9345   -0.0463 F   0  0  0  0  0  0  0  0  0  0  0  0
    4.5034    0.2532   -1.1493 F   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  2  3  1  0  0  0  0
  2  4  1  0  0  0  0
  2  5  1  0  0  0  0
M  END
`;

// The hydrogen halides, for the trend down group 17 (2026-10-29).
const HF = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
    0.9895    0.0442    0.0815 F   0  0  0  0  0  0  0  0  0  0  0  0
    1.9085    0.0442    0.0815 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const HCL = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
    0.9910   -0.0859    0.0489 Cl  0  0  0  0  0  0  0  0  0  0  0  0
    2.2673   -0.0859    0.0489 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const HBR = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
    1.0495   -0.0664    0.0404 Br  0  0  0  0  0  0  0  0  0  0  0  0
    2.4664   -0.0664    0.0404 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

const HI = HEADER + `  2  1  0  0  0  0  0  0  0  0999 V2000
    1.0243   -0.0532    0.0705 I   0  0  0  0  0  0  0  0  0  0  0  0
    2.6305   -0.0532    0.0705 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
M  END
`;

// The sp carbon of an isocyanate is drawn linear, and a student who measures
// 174° will think the structure wrong (2026-10-29: so did the user, until the
// DFT minimum agreed with GFN2's bend).
const ISOCYANATE_BENT: InfoNote = {
  text: 'Bent at both ends: the N\'s lone pair bends C–N=C to about 140°, and even the sp carbon '
    + 'is not quite linear — N=C=O 174° at this ωB97X-D3 minimum, bent away from the methyl.',
  link: {
    label: 'CH₃NCO\'s quasi-linear C–N=C bend (arXiv:1509.09305)',
    href: 'https://arxiv.org/abs/1509.09305',
  },
};

// GFN2-xTB's full dipole does not fall down group 17 as experiment's does
// (2.52, 1.05, 2.51, 2.37 D for HF to HI; xtb 6.7.1 agrees — NOTES.md,
// 2026-10-29), and neither do the ESP-fitted charges, fitted to the same
// potential (X −0.57, −0.20, −0.38, −0.32). Mulliken's (−0.39, −0.33, −0.27,
// −0.19) and CM5's (−0.36, −0.27, −0.26, −0.21) do. The lesson is read from
// those (the user's call, 2026-10-30); the note gives experiment's dipoles.
const HALIDE_DIPOLES: InfoNote = {
  text: 'Experiment\'s dipoles fall down the group: HF 1.83, HCl 1.09, HBr 0.83, HI 0.45 D. '
    + 'GFN2-xTB\'s computed dipole does not follow them for HBr and HI, nor do its ESP-fitted '
    + 'charges, fitted to the same potential. Read the trend from the Mulliken or CM5 charges '
    + '(Charge Model, "Charges from"), which do.',
  link: {
    label: 'NIST CCCBDB, experimental dipoles',
    href: 'https://cccbdb.nist.gov/diplistx.asp',
  },
};

/**
 * The dropdown's sections, in the order a bonding course meets them: the
 * electron-domain count is the model's own organising idea (hybridization is
 * read from it), and each domain section runs from no lone pairs to the
 * most — CH₄, NH₃, H₂O; PCl₅, SF₄, ClF₃, XeF₂; SF₆, BrF₅, XeF₄. Molecules
 * whose lesson is not one centre's domains (a family down a group, π bonds,
 * rings, three-centre bonds, metals) have sections of their own.
 */
export const EXAMPLE_GROUPS: { label: string; examples: Example[] }[] = [
  {
    label: 'Four electron domains',
    examples: [
      { name: 'Methane (CH₄)', mol: METHANE },
      { name: 'Ammonia (NH₃)', mol: AMMONIA },
      { name: 'Water (H₂O)', mol: WATER },
      { name: 'Aziridine (C₂H₅N)', mol: AZIRIDINE },
    ],
  },
  {
    label: 'Hydrogen halides',
    examples: [
      { name: 'Hydrogen fluoride (HF)', mol: HF, note: HALIDE_DIPOLES },
      { name: 'Hydrogen chloride (HCl)', mol: HCL, note: HALIDE_DIPOLES },
      { name: 'Hydrogen bromide (HBr)', mol: HBR, note: HALIDE_DIPOLES },
      { name: 'Hydrogen iodide (HI)', mol: HI, note: HALIDE_DIPOLES },
    ],
  },
  {
    label: 'Double and triple bonds',
    examples: [
      { name: 'Ethene (C₂H₄)', mol: ETHENE },
      { name: 'Ethyne (C₂H₂)', mol: ETHYNE },
      { name: 'But-1-en-3-yne (H₂C=CH-C≡CH)', mol: BUTENYNE },
      { name: 'Formaldehyde (H₂CO)', mol: FORMALDEHYDE },
      { name: 'Methyl isocyanate (CH₃NCO)', mol: METHYL_ISOCYANATE, note: ISOCYANATE_BENT },
      { name: 'Nitrogen (N₂)', mol: N2 },
      { name: 'Oxygen (O₂)', mol: O2 },
      { name: 'Ozone (O₃)', mol: OZONE },
    ],
  },
  {
    label: 'Aromatic rings',
    examples: [
      { name: 'Benzene (C₆H₆)', mol: BENZENE },
      { name: 'Pyridine (C₅H₅N)', mol: PYRIDINE },
      { name: 'Pyrrole (C₄H₅N)', mol: PYRROLE },
      { name: 'Imidazole (C₃H₄N₂)', mol: IMIDAZOLE },
      { name: 'Phenol (C₆H₅OH)', mol: PHENOL },
    ],
  },
  {
    label: 'Five electron domains',
    examples: [
      { name: 'Phosphorus pentachloride (PCl₅)', mol: PCL5 },
      { name: 'Sulfur tetrafluoride (SF₄)', mol: SF4 },
      { name: 'Chlorine trifluoride (ClF₃)', mol: CLF3 },
      { name: 'Xenon difluoride (XeF₂)', mol: XEF2 },
    ],
  },
  {
    label: 'Six electron domains',
    examples: [
      { name: 'Sulfur hexafluoride (SF₆)', mol: SF6 },
      { name: 'Bromine pentafluoride (BrF₅)', mol: BRF5 },
      { name: 'Xenon tetrafluoride (XeF₄)', mol: XEF4 },
    ],
  },
  {
    label: 'Three-centre bonds',
    examples: [
      { name: 'Diborane (B₂H₆)', mol: DIBORANE },
    ],
  },
  {
    label: 'Metal centres',
    examples: [
      { name: 'Zinc chloride (ZnCl₂)', mol: ZNCL2, note: ZNCL2_LINEAR },
      { name: 'Tetrachloronickelate(II) ([NiCl₄]²⁻, triplet)', mol: NICL4, multiplicity: 3, note: JAHN_TELLER },
      { name: 'Tetracyanonickelate(II) ([Ni(CN)₄]²⁻, singlet)', mol: NICN4 },
    ],
  },
];

/** Every example, in the dropdown's order — the number keys 1–9 load the first nine. */
export const EXAMPLES: Example[] = EXAMPLE_GROUPS.flatMap((group) => group.examples);
