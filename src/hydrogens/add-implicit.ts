import type { Molecule } from '../mol-parser';

const VALENCES: Record<string, number> = {
  C: 4,
  Si: 4,
  N: 3,
  P: 3,
  O: 2,
  S: 2,
};

const BOND_LENGTH = 1.0;

export function addImplicitHydrogens(molecule: Molecule): Molecule {
  const atoms = [...molecule.atoms];
  const bonds = [...molecule.bonds];
  let nextIndex = atoms.length;
  let hAdded = 0;

  const bondOrderSum: number[] = new Array(atoms.length).fill(0);
  for (const bond of bonds) {
    bondOrderSum[bond.atom1Index] += bond.order;
    bondOrderSum[bond.atom2Index] += bond.order;
  }

  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    const valence = VALENCES[atom.element];
    if (!valence) continue;

    const missing = Math.max(0, valence - bondOrderSum[i]);
    if (missing === 0) continue;

    const neighborAngles: number[] = [];
    for (const bond of bonds) {
      const ni = bond.atom1Index === i ? bond.atom2Index :
                 bond.atom2Index === i ? bond.atom1Index : -1;
      if (ni >= 0) {
        const n = atoms[ni];
        neighborAngles.push(Math.atan2(n.y - atom.y, n.x - atom.x));
      }
    }

    // Place hydrogens using ideal bond angles based on total coordination
    const totalCoordination = neighborAngles.length + missing;
    for (let j = 0; j < missing; j++) {
      let angle: number;

      if (neighborAngles.length > 0) {
        const avgAngle = neighborAngles.reduce((s, a) => s + a, 0) / neighborAngles.length;

        if (totalCoordination === 2) {
          angle = avgAngle + Math.PI;
        } else if (totalCoordination === 3) {
          const offset = (2 * Math.PI / 3) * (j + 1);
          angle = avgAngle + offset;
        } else {
          const offset = (2 * Math.PI / 3) * (j - 1);
          angle = avgAngle + Math.PI + offset;
        }
      } else {
        angle = (2 * Math.PI * j) / missing;
      }

      const hx = atom.x + BOND_LENGTH * Math.cos(angle);
      const hy = atom.y + BOND_LENGTH * Math.sin(angle);

      atoms.push({
        index: nextIndex + hAdded,
        element: 'H',
        x: hx,
        y: hy,
        z: atom.z,
      });

      bonds.push({
        atom1Index: i,
        atom2Index: nextIndex + hAdded,
        order: 1,
      });

      hAdded++;
    }
  }

  return { atoms, bonds };
}
