"""Spherically averaged core density of a free atom, from an ORCA atom run.

Reads <El>/<El>.json (orca_2json of the .gbw) and builds the density of
chosen spin orbitals on a radial grid. In an atom every orbital is a sum of
contracted Gaussians R(r) Y_lm, so the spherical average of |psi|^2 is
(1/4 pi) sum over (l, m) of (sum_a C_a R_a(r))^2: ORCA's angular sign and
ordering conventions drop out, and only the radial functions and which AOs
share an (l, m) matter. The check that it is right: the core density
integrates to the core's electron count and the whole density to Z.

    python core_density.py Na/Na.json 10
"""
import json
import math
import sys

import numpy as np

L_OF = {'s': 0, 'p': 1, 'd': 2, 'f': 3, 'g': 4, 'h': 5}
# log grid for the integral checks: the integrand of 4 pi r^2 rho dr is
# 4 pi r^3 rho d(ln r), smooth from the nucleus out
CHECK_R = np.exp(np.linspace(math.log(1e-6), math.log(40.0), 6001))


def radial_function(shell, r):
    """A shell's normalized contracted radial function R(r), with
    integral R^2 r^2 dr = 1 (primitives and contraction, analytically)."""
    l = L_OF[shell['Shell']]
    a = np.array(shell['Exponents'])
    c = np.array(shell['Coefficients']) * np.sqrt(2 * (2 * a) ** (l + 1.5) / math.gamma(l + 1.5))
    overlap = math.gamma(l + 1.5) / (2 * (a[:, None] + a[None, :]) ** (l + 1.5))
    norm = float(c @ overlap @ c)
    return (c[None, :] * r[:, None] ** l * np.exp(-a[None, :] * r[:, None] ** 2)).sum(axis=1) / math.sqrt(norm)


def spherical_density(atom_json, spin_orbitals, r):
    mol = atom_json['Molecule']
    shells = mol['Atoms'][0]['Basis']
    R = [radial_function(shell, r) for shell in shells]
    # AOs in basis order: each shell's 2l + 1 components; group them by (l, m)
    groups = {}
    a = 0
    for s, shell in enumerate(shells):
        l = L_OF[shell['Shell']]
        for m in range(2 * l + 1):
            groups.setdefault((l, m), []).append((a, s))
            a += 1
    mos = mol['MolecularOrbitals']['MOs']
    C = np.array([mos[i]['MOCoefficients'] for i in spin_orbitals])  # orbitals x AOs
    assert C.shape[1] == a, (C.shape, a)
    occ = np.array([mos[i]['Occupancy'] for i in spin_orbitals])
    rho = np.zeros_like(r)
    for members in groups.values():
        aos = [m[0] for m in members]
        radial = np.array([R[m[1]] for m in members])  # AOs x points
        psi = C[:, aos] @ radial  # orbitals x points
        rho += occ @ (psi ** 2)
    return rho / (4 * math.pi)


def electrons(rho_on_check_grid):
    return float(np.trapezoid(4 * math.pi * CHECK_R ** 3 * rho_on_check_grid, np.log(CHECK_R)))


def occupied_spin_orbitals(atom_json):
    """(energy, index, electrons) of each occupied orbital, lowest first: a UHF
    run lists alpha then beta, each with occupancy 1."""
    mos = atom_json['Molecule']['MolecularOrbitals']['MOs']
    return sorted((mo['OrbitalEnergy'], i, mo['Occupancy']) for i, mo in enumerate(mos) if mo['Occupancy'] > 1e-6)


def core_of(atom_json, core_electrons):
    """The lowest-energy spin orbitals holding `core_electrons`."""
    chosen, count = [], 0.0
    for _, i, n in occupied_spin_orbitals(atom_json):
        if count >= core_electrons - 1e-6:
            break
        chosen.append(i)
        count += n
    return chosen, count


if __name__ == '__main__':
    path, core = sys.argv[1], int(sys.argv[2])
    d = json.load(open(path))
    every = [i for _, i, _ in occupied_spin_orbitals(d)]
    chosen, counted = core_of(d, core)
    print('Z check:', electrons(spherical_density(d, every, CHECK_R)))
    rho = spherical_density(d, chosen, CHECK_R)
    print('core electrons', counted, '->', electrons(rho))
    for target in (1e-2, 1e-3, 1e-4):
        print(f'core density {target:g} au reached at r = {CHECK_R[rho > target].max() * 0.529177:.3f} A')
