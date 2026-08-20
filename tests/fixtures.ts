// Shared MOL/SDF fixtures for the structure-validation guard tests.
// Drawn blocks use JSME's Kekulé style (explicit single/double bonds, no
// implicit H); "PubChem" blocks are real 3D SDF output with explicit
// hydrogens and the PUBCHEM_COMPOUND_CID property.
import { parseMolBlock } from '../src/mol-parser';
import type { Molecule } from '../src/mol-parser';

export const DRAWN_CYCLOBUTADIENE_MOL = `  4  4  0  0  0  0  0  0  0  0999 V2000
    1.3000   -0.1000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.4000    0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8000    0.4000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.5000   -0.9000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  1  1  0  0  0  0
M  END
`;

export const PUBCHEM_CYCLOBUTADIENE_SDF = `136879
   -OEChem-08192601023D

  8  8  0     0  0  0  0  0  0999 V2000
    0.7143   -0.6732    0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7148    0.6727   -0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7149   -0.6726   -0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7142    0.6732    0.0002 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.4699   -1.4498    0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.4710    1.4485   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4711   -1.4485   -0.0003 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4698    1.4496    0.0002 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  5  1  0  0  0  0
  2  4  1  0  0  0  0
  2  6  1  0  0  0  0
  3  4  2  0  0  0  0
  3  7  1  0  0  0  0
  4  8  1  0  0  0  0
M  END
> <PUBCHEM_COMPOUND_CID>
136879

> <PUBCHEM_MMFF94_PARTIAL_CHARGES>
  8
  1 0.18
  2 -0.18
  3 0.18
  4 -0.18
  5 0.02
  6 -0.02
  7 0.02
  8 -0.02

> <PUBCHEM_MMFF94_ENERGY>
  34.2918

$$$$
`;

export const PUBCHEM_CYCLOBUTANE_SDF = `9250
   -OEChem-08192601073D

 12 12  0     0  0  0  0  0  0999 V2000
    0.1277   -1.0560    0.1716 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.0561   -0.1276   -0.1716 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.0559    0.1277   -0.1717 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.1276    1.0559    0.1717 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.1638   -1.3547    1.2256 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.2351   -1.9436   -0.4564 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.3548   -0.1637   -1.2255 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.9437   -0.2349    0.4565 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.9437    0.2350    0.4563 H   0  0  0  0  0  0  0  0  0  0  0  0
    1.3546    0.1638   -1.2256 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.2349    1.9437   -0.4563 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.1636    1.3546    1.2256 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0  0  0  0
  1  3  1  0  0  0  0
  1  5  1  0  0  0  0
  1  6  1  0  0  0  0
  2  4  1  0  0  0  0
  2  7  1  0  0  0  0
  2  8  1  0  0  0  0
  3  4  1  0  0  0  0
  3  9  1  0  0  0  0
  3 10  1  0  0  0  0
  4 11  1  0  0  0  0
  4 12  1  0  0  0  0
M  END
> <PUBCHEM_COMPOUND_CID>
9250

$$$$
`;

// Benzene pair: drawn without implicit H, PubChem with explicit H and a
// different atom ordering. Heavy-atom graphs must still match (PubChem
// V2000 3D output is Kekulé, so bond orders line up).
export const DRAWN_BENZENE_MOL = `  6  6  0  0  0  0  0  0  0  0999 V2000
    1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000    1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.4000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7000   -1.2124    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  2  3  1  0  0  0  0
  3  4  2  0  0  0  0
  4  5  1  0  0  0  0
  5  6  2  0  0  0  0
  6  1  1  0  0  0  0
M  END
`;

export const PUBCHEM_BENZENE_SDF = `241
   -OEChem-08192601023D

 12 12  0     0  0  0  0  0  0999 V2000
   -1.2131   -0.6884    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2028    0.7064    0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0103   -1.3948    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0104    1.3948   -0.0001 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2028   -0.7063    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2131    0.6884    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1577   -1.2244    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -2.1393    1.2564    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
   -0.0184   -2.4809   -0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.0184    2.4808    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1394   -1.2563    0.0001 H   0  0  0  0  0  0  0  0  0  0  0  0
    2.1577    1.2245    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0  0  0  0
  1  3  1  0  0  0  0
  1  7  1  0  0  0  0
  2  4  1  0  0  0  0
  2  8  1  0  0  0  0
  3  5  2  0  0  0  0
  3  9  1  0  0  0  0
  4  6  1  0  0  0  0
  4 10  1  0  0  0  0
  5  6  2  0  0  0  0
  5 11  1  0  0  0  0
  6 12  1  0  0  0  0
M  END
> <PUBCHEM_COMPOUND_CID>
241

$$$$
`;

export const drawnCyclobutadiene: Molecule = parseMolBlock(DRAWN_CYCLOBUTADIENE_MOL);
export const pubchemCyclobutadiene: Molecule = parseMolBlock(PUBCHEM_CYCLOBUTADIENE_SDF);
export const pubchemCyclobutane: Molecule = parseMolBlock(PUBCHEM_CYCLOBUTANE_SDF);
export const drawnBenzene: Molecule = parseMolBlock(DRAWN_BENZENE_MOL);
export const pubchemBenzene: Molecule = parseMolBlock(PUBCHEM_BENZENE_SDF);
