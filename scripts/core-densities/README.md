# Core densities for the ESP surface

GFN2-xTB's density is its valence shells only; each atom's core electrons are
part of the point charge at its nucleus. The ESP surface is drawn where the
density falls to 0.001 e/bohr³, so the worker adds each atom's free-atom core
density back (`src/chem/charge-model/core-density.ts`). Without it the surface
missed a cation whose valence electron had gone: NaOH's Na⁺.

`src/chem/charge-model/core-density-table.ts` is generated here:

1. `python make_inputs.py` — one ORCA input per element, Li–Rn: UHF,
   scalar-relativistic X2C, x2c-TZVPall (all-electron through radon), the
   ground-state multiplicity.
2. `./run_all.sh` — runs ORCA 6.1.1 on each (four at a time; finished atoms are
   skipped) and exports the orbitals with `orca_2json`.
3. `python emit_table.py ../../src/chem/charge-model/core-density-table.ts` —
   for each element, the lowest Z − n spin orbitals, n being GFN2's valence
   electrons (the reference occupations in OCC's `share/xtb/gfn2.json`),
   spherically averaged (`core_density.py`). It stops if a core does not
   integrate to its electron count.

Run in a scratch directory. The Python is numpy only; the Psi4 pixi
environment in `~/Code/psi4_experiments` has it
(`pixi run -m ~/Code/psi4_experiments python …`). The 84 atoms take about an
hour on the desktop.
