import { parseMolBlock } from './src/mol-parser/parse-mol.js';
import { fillMissingHydrogens } from './src/chem/fill-hydrogens.js';
import { place3D } from './src/geometry/place3d.js';
import { computeFormula } from './src/geometry/resolve3d.js';

function formatMol(atoms, bonds) {
  let out = '';
  const nAtoms = atoms.length;
  const nBonds = bonds.length;
  const counts = `${nAtoms}`.padStart(3) + `${nBonds}`.padStart(3) + '  0  0  0  0  0  0  0  0999 V2000\n';
  out += '  ' + counts;
  for (const a of atoms) {
    out += `    ${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.element.padEnd(3)}  0  0  0  0  0  0  0  0  0  0  0  0\n`;
  }
  for (const b of bonds) {
    out += `  ${(b.atom1Index+1).toString().padStart(3)}${(b.atom2Index+1).toString().padStart(3)}  ${b.order}  0  0  0  0\n`;
  }
  out += 'M  END\n';
  return out;
}

const examples = [
  { name: 'Methane (CH\u2084)', smiles: 'C', mol: `JME\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n` },
  { name: 'Ethene (C\u2082H\u2084)', smiles: 'C=C', mol: `JME\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.3375    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  2  0  0  0  0\nM  END\n` },
  { name: 'Ethyne (C\u2082H\u2082)', smiles: 'C#C', mol: `JME\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.2033    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  3  0  0  0  0\nM  END\n` },
  { name: 'Water (H\u2082O)', smiles: 'O', mol: `JME\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0  0  0  0\nM  END\n` },
];

for (const ex of examples) {
  const molecule = fillMissingHydrogens(parseMolBlock(ex.mol));
  const placed = place3D(molecule);
  const atoms = molecule.atoms.map((a, i) => {
    const p = placed[i];
    return { ...a, x: p[0], y: p[1], z: p[2] };
  });
  const { formula } = computeFormula(atoms.map(a => a.element));
  console.error(ex.name, formula);
  process.stdout.write(formatMol(atoms, molecule.bonds));
  console.error('---');
}
