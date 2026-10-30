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

### The lone-pair minima (2026-10-29)

For `tests/orient-lone-pairs.test.ts`: a molecule for each VSEPR lone-pair
arrangement and every Example that draws a lone pair. The runs, their
starting structures (generated: SMILES → Open Babel → GFN2-xTB) and the
details are in `~/orca_calcs/lone-pairs/README.md`; formaldehyde, ozone and
the nickel complexes are earlier runs in `~/orca_calcs`. Same method, except
dioxygen (a triplet), NiCl₄²⁻ (a triplet; `TightSCF SlowConv defgrid2` with
Ni(CN)₄²⁻) and XeF₄ (Cartesian coordinates, `!COpt`: in redundant internals
the optimiser oscillated about the square plane). None has an imaginary mode.

Point groups as found within 0.02 Å, except where the column says otherwise:
the loosest ones sit on the softest modes, where the default convergence
leaves a methyl or silyl group a little turned. A symmetric top (NH₃, PCl₅,
BrF₅, the nickel complexes) is listed by its shape.

| File | Point group | Lowest frequency (cm⁻¹) |
|------|-------------|-------------------------|
| water.xyz | C2v | 1622 |
| ammonia.xyz | C3v | 1015 |
| aziridine.xyz | Cs | 791 |
| disiloxane.xyz | ≈ Cs (0.2 Å), Si–O–Si 149.5° | 23 |
| pyridine.xyz | C2v | 389 |
| pyrrole.xyz | C2v | 503 |
| imidazole.xyz | Cs | 546 |
| phenol.xyz | Cs | 233 |
| methyl-isocyanate.xyz | Cs (0.1 Å), C–N=C 140.4°, N=C=O 174.1° | 36 |
| n-methylmethanimine.xyz | Cs (0.05 Å) | 215 |
| formaldehyde.xyz | C2v | 1211 |
| ozone.xyz | C2v | 789 |
| dinitrogen.xyz | D∞h | 2495 |
| dioxygen.xyz | D∞h (triplet) | 1728 |
| phosphorus-pentachloride.xyz | D3h | 93 |
| sulfur-tetrafluoride.xyz | C2v (seesaw) | 226 |
| chlorine-trifluoride.xyz | C2v (T-shape) | 339 |
| xenon-difluoride.xyz | D∞h | 219 |
| bromine-pentafluoride.xyz | C4v | 240 |
| xenon-tetrafluoride.xyz | D4h | 158 |
| zinc-chloride.xyz | D∞h | 108 |
| NiCl4.xyz | trigonally distorted tetrahedron, Cl–Ni–Cl 106.5° and 112.3° ×3 (triplet) | 46 |
| NiCN4.xyz | D4h | 57 |

### The examples' minima (2026-10-29)

The Examples in the app's dropdown are these structures, except PCl₅, SF₆ and
ZnCl₂, kept ideal on purpose (`src/ui/examples.ts` says why). Five more were
run for them, each started from the example's old geometry so its atom order
and bonds carry over; the runs are in `~/orca_calcs/examples/README.md`, same
method, no imaginary mode. Ethene's example uses `ethene.xyz` above, which a
re-run matched to 0.014 kcal/mol.

| File | Point group | Lowest frequency (cm⁻¹) |
|------|-------------|-------------------------|
| methane.xyz | Td | 1339 |
| ethyne.xyz | D∞h | 692 |
| benzene.xyz | D6h | 415 |
| butenyne.xyz | Cs | 228 |
| diborane.xyz | D2h | 347 |

### The hydrogen halides (2026-10-29)

For the "Hydrogen halides" examples and the lone-pair tests; the runs are in
`~/orca_calcs/hydrogen-halides/README.md`, same method (I with ORCA's
def2-ECP), each a minimum.

| File | Point group | Harmonic frequency (cm⁻¹) |
|------|-------------|---------------------------|
| hydrogen-fluoride.xyz | C∞v | 4156 |
| hydrogen-chloride.xyz | C∞v | 3012 |
| hydrogen-bromide.xyz | C∞v | 2699 |
| hydrogen-iodide.xyz | C∞v | 2378 |
