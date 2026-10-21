"""ORCA inputs for every free atom Li-Rn: UHF, scalar-relativistic X2C,
x2c-TZVPall (all-electron through radon), the ground-state (Hund)
multiplicity. Only the core is kept, and it barely feels the valence
configuration, so the multiplicity need only be a reasonable one."""
import os

SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr '
           'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu '
           'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn').split()
# ground-state multiplicities, Z = 1..86 (Ce a triplet, 4f1 5d1 6s2: as a
# singlet UHF settled in 5d2 6s2 with no 4f, 0.17 Eh higher)
MULT = [2, 1, 2, 1, 2, 3, 4, 3, 2, 1, 2, 1, 2, 3, 4, 3, 2, 1, 2, 1, 2, 3, 4, 7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1,
        2, 1, 2, 3, 6, 7, 6, 5, 4, 1, 2, 1, 2, 3, 4, 3, 2, 1, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 6, 5, 4, 3, 2, 1, 2,
        3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3, 4, 3, 2, 1]
assert len(SYMBOLS) == 86 and len(MULT) == 86

if __name__ == '__main__':
    for z in range(3, 87):
        el = SYMBOLS[z - 1]
        os.makedirs(el, exist_ok=True)
        with open(f'{el}/{el}.inp', 'w') as f:
            f.write('! UHF X2C x2c-TZVPall TightSCF SlowConv\n%scf MaxIter 500 end\n')
            f.write(f'* xyz 0 {MULT[z - 1]}\n{el} 0.0 0.0 0.0\n*\n')
