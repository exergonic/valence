# DFT minima

Final geometries of ORCA optimizations, copied verbatim from the run's `.xyz`:

    ! Opt Freq wb97x-d3 def2-TZVP

Each run converged and its frequency calculation has no imaginary mode, so
every structure here is a true minimum. Used where a test needs the molecule's
real geometry (the irrep labels, the σ/π typing of P₄'s off-axis bonds): an
embedder's geometry is only approximately symmetric, a hand-typed one carries
silent errors, and PubChem's 3D conformers are not minima at any stated level.

| File | Point group | Lowest frequency (cm⁻¹) |
|------|-------------|-------------------------|
| ethene.xyz | D2h | 833 |
| allene.xyz | D2d | 376 |
| SF6.xyz | Oh | 343 |
| methanol.xyz | Cs (staggered) | 293 |
| cubane.xyz | Oh | 624 |
| naphthalene.xyz | D2h | 170 |
| dichlorofluoromethane.xyz | Cs | 280 |
| tetraphosphorus.xyz | Td | 415 |
