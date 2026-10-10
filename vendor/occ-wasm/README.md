# occjs — vendored GFN2-xTB engine

The JavaScript/WebAssembly bindings (`occjs` target) of OCC's **in-tree**
GFN2-xTB implementation, used as the default geometry engine of Valence's local
pipeline.

- **Upstream:** <https://github.com/peterspackman/occ>
- **Commit:** `826d76966a14b880d6e47e367c72db1be3f26395` (tag `v0.9.4`)
- **Licence:** LGPL-3.0-or-later. OCC is dual-licensed
  `(GPL-3.0-or-later OR LGPL-3.0-or-later)`; Valence takes the **LGPL** branch.
  OCC is © Peter Spackman and contributors; the complete corresponding source is
  the upstream repository at the commit above, plus the modifications
  documented below (LGPL-3 §4 requires that a recipient be able to relink the
  library — rebuild it with these commands and drop the outputs back into this
  directory).

## Producing it

Requires the Emscripten SDK **6.0.10** (exact — same emcc + flags + sources
yields bit-identical wasm across machines; verify with `md5sum`), CMake ≥
3.16 and Ninja. Pinned-commit checkouts: a pristine reference at
`C:/Users/mccan/Code/third-party/occ` (never build in it). Agents rebuild on
this machine in `C:/Users/mccan/Code/occ-win` — a fresh clone at the pinned
commit with the patches below applied (port with `git diff`/`git apply` from
a patched tree and require the stat to match). The lenovo checkout
(`~/Code/occ`) is a cold spare; do not build there. Verify patches with `git
diff` against upstream before building.

**1. Clone and check out the pinned commit.**

```bash
git clone https://github.com/peterspackman/occ.git && cd occ
git checkout 826d76966a14b880d6e47e367c72db1be3f26395
```

**2. Prune the bindings in `src/occjs.cpp`.** Register only what the app calls:
a registered binding is *reachable code*, so the linker cannot discard what it
pulls in. The solvent registration alone anchors ~12 MB — its driver runs
HF/SCF/DFT for surface charges, pulling libxc, the integral engines and
libcint — so it stays off (the app's only geometry path is gas-phase xTB, and
upstream `XtbCalculator::set_solvent` is a stub that returns false).

```cpp
EMSCRIPTEN_BINDINGS(occ) {
    register_core_bindings();      // Molecule, Mat3N, IVec, logging, threading
    register_xtb_bindings();       // GFN2-xTB — the geometry engine
    register_opt_bindings();       // Berny optimiser (trimmed — step 3b)
    // register_solvent_bindings(); // COSMO-RS solvents
    // register_qm_bindings();      // register_correlation_bindings();
    // register_dft_bindings();
    // register_isosurface_bindings();  // register_cube_bindings();
    // register_crystal_bindings();     // register_descriptors_bindings();
    // register_dma_bindings();         // register_mults_bindings();
    // register_volume_bindings();      // register_cg_bindings();
    function("setLogFile", &occ::log::set_log_file);
    constant("version", std::string("0.9.4"));
}
```

Only the `core`, `xtb` and `opt` binding sources are compiled — `src/CMakeLists.txt`'s
`JS_BINDING_SOURCES` lists `js/core_bindings.cpp`, `js/xtb_bindings.cpp` and
`js/opt_bindings.cpp` (the rest still link ~0.5 MB of dead glue); the `fromXyzFile`/`fromXyzString` Molecule bindings are
removed (the app builds molecules from atoms); the allocator is emscripten's
default (no `MALLOC=mimalloc`, which costs size for no single-threaded gain).

Thread support is removed at the link. TBB is linked by archive path
(`$<TARGET_FILE:TBB::tbb>`, headers stay available) instead of `TBB::tbb`,
`Threads::Threads` is dropped from `occ_core`, `_subprocess` and
`occ_isosurface`, and `spdlog`'s `Threads::Threads` interface is reduced to
`fmt::fmt` — any `-pthread` on the link forces shared wasm memory, which needs
COOP/COEP headers no static host serves, so without this the module cannot
even instantiate in production browsers. The engine is single-threaded
throughout (the GFN2 path never calls into TBB), so nothing is lost.

**3. Prune `src/js/xtb_bindings.cpp`.** Drop the nine bindings that name types
from the stubbed modules: `fromDimer`, `fromCrystal`, `toCrystal`,
`toWavefunction`, `isPeriodic`, `lattice`, `setKpoints`, `kpoints`,
`updateStructureWithLattice`, plus the `dimer.h`, `crystal.h` and
`wavefunction.h` includes. This app is molecular and only calls `fromMolecule`.

**3b. Trim `src/js/opt_bindings.cpp` to Berny.** Upstream also registers
`HessianEvaluator<HartreeFock>` and `HessianEvaluator<DFT>` and the XYZ writer,
which anchor the HF/DFT/integral code: measured, they take the wasm from 2.3 to
14 MB (gzip 0.76 → 4.7 MB). Delete the `occ/qm/hessians.h`, `occ/qm/hf.h`,
`occ/dft/dft.h` and `occ/io/xyz.h` includes and the `occ::qm`/`occ::dft` using
lines, the two `HessianEvaluator` classes and the `moleculeToXYZ*` functions.
What remains is Berny (`BernyOptimizer`, `ConvergenceCriteria`,
`OptimizationState`, `OptPoint`), the internal coordinates and the core
vibrational helpers: +55 KB gzip over the build without it.

**3c. Valence's property patch (2026-10-09).** Expose what one SCC already
knows, for the app's bond orders, spin, dipole and orbital pictures:

- `xtb_result.h`: `Mat3N atomic_dipoles` and `Mat atomic_quadrupoles` — the
  CAMM atomic dipoles (e·bohr) and traceless quadrupoles (e·bohr², 6 × N,
  `[xx xy yy xz yz zz]`, Buckingham's ½(3xᵢxⱼ − r²δᵢⱼ)) at convergence, which
  `gfn2_engine.cpp` computed every cycle and dropped; the engine now stores
  them when multipoles are on.
- `xtb_calculator.h/.cpp`: `dipole_moment()` (Σ q_A R_A + Σ dipm_A — xtb's
  "full" dipole), `atomic_dipoles()`, `atomic_quadrupoles()`, `ao_atoms()` and `ao_angular_momenta()`
  (each basis function's atom and l), and `orbital_values(points_bohr,
  coefficients)` — ψ and ∇ψ (4 × N) at the points through OCC's own
  `gto::evaluate_basis`, in blocks of 4096, so no basis convention reaches
  JavaScript; `density_values(points)` (ρ = Σ P_μν φ_μ φ_ν, both spins) and
  `electrostatic_potential(points)` — the exact potential of the SCC's charge
  distribution: each atom's nucleus-plus-core at Z_A = q_A + its Mulliken
  population (so no core count is assumed), less the valence density
  integrated by the engine's `electric_potential_mmd` (fed P/2 as a closed
  shell: OCC's MolecularOrbitals holds one spin channel).
- `xtb_bindings.cpp`: `atomicDipoles`, `atomicQuadrupoles`, `dipoleMoment`, `aoAtoms`,
  `aoAngularMomenta`, `orbitalValues`, `densityValues`, `electrostaticPotential`.

The complete set of source modifications — steps 2–3c — is
`occ-valence.patch` in this directory (`git diff` of the build tree against
the pinned commit, `share/` excluded): `git apply occ-valence.patch` on a
fresh clone reproduces the tree, then steps 4–5.

**4. Move aside the unread `share/` data** (the `--preload-file share@/` link
packs the whole tree, so absent files simply don't ship): `share/basis`
(HF/DFT basis sets, 7.4 MB), `share/dftd3` (read only by the D3 loader — GFN2
uses D4) and `share/sgdata.json` (crystal space-group data).

**5. Configure and build.**

```bash
emcmake cmake . -Bwasm -DCMAKE_BUILD_TYPE=Release -DUSE_OPENMP=OFF -GNinja \
  -DENABLE_JS_BINDINGS=ON -DUSE_SYSTEM_EIGEN=OFF -DWITH_LUA_BINDINGS=OFF \
  -DCMAKE_CXX_SCAN_FOR_MODULES=OFF -DBUILD_TESTING=OFF \
  -DCMAKE_CXX_FLAGS="-msimd128 -include cstdlib" \
  -DCMAKE_C_FLAGS="-msimd128"
cmake --build wasm --target occjs
```

Two deliberate deviations from upstream's own `scripts/build_wasm.sh`, beyond the
patches above:

1. `-DWITH_LUA_BINDINGS=OFF -DBUILD_TESTING=OFF` — Valence binds neither the Lua
   interface nor OCC's test suite.
2. `-include cstdlib` on the **C++ flags only**. Current Emscripten libc++ no
   longer pulls `<cstdlib>` in transitively and fmt fails with
   `use of undeclared identifier 'free'`. It must *not* go on `CMAKE_C_FLAGS`:
   `cstdlib` is a C++ header, so C sources (gau2grid) fail to compile with it.

`-DWITH_UNITY_BUILD=ON` does **not** work: unity builds concatenate
`src/disp/d3.cpp` and `d4.cpp` into one translation unit and their file-scope
`constexpr` symbols (`MAX_REF`, `reference_data`, `CnResult`, …) collide. Leave
unity off, which is upstream's default.

**Building on Windows (BEAST_MACHINE).** emsdk lives at `C:/Users/mccan/emsdk`;
activate per-shell (`source C:/Users/mccan/emsdk/emsdk_env.sh` works in
git-bash — never `--permanent`). Invoke `emcc`/`emcmake` through that env,
never bare `gcc`: Strawberry Perl's toolchain shadows it and would compile
natively. Quote `LINK_FLAGS` strings with CMake-escaped doubles (`\"`) —
cmd.exe passes single quotes literally and configure dies. Build with `-j6`
(16 GB RAM); a full build takes ~15–20 min. `C:/Strawberry` also ships a
fallback gcc/g++/gfortran, only needed if a step ever requires a native
compiler (none does today).

## Contents

`occjs.wasm` (the engine), `occjs.js` (the emscripten glue) and `occjs.data`
(the preloaded `share/` tree, mounted at `/`). Only the `occjs` target is
built. The engine runs single-threaded (`setNumThreads(1)`); a threaded build
needs `SharedArrayBuffer`, which needs COOP/COEP headers, which GitHub Pages
cannot serve — single-threaded is what makes this deployable as a static site
at all.

Registered bindings: `core` (Molecule, Mat3N, IVec, logging, threading),
`xtb` (the GFN2 engine) and a trimmed `opt` (the Berny optimiser the app
optimises with — step 3b). Everything else upstream registers — QM, DFT,
solvent/COSMO-RS, crystals and the rest — stays commented out; uncomment a
line to restore that capability (rebuild required). The preloaded data is the
GFN2 parameters (`share/xtb`), the D4 tables (`share/dftd4`), COSMO/SMD data
(`share/solvent`, kept for a future solvation path) and small tables.

| file | raw | gzip |
|---|---|---|
| `occjs.wasm` | 3,173 KiB | 980 KiB |
| `occjs.data` | 326 KiB | 70 KiB |
| `occjs.js` | 122 KiB | 31 KiB |

About **0.5 MiB brotli** in total (estimated from the gzip ratio), lazily loaded,
single-threaded, on a static host.

## Verification

Checked against the Fortran xTB oracle (`xtb --gfn 2`) on identical geometries,
and by the app's own oracle-pinned test (`tests/gfn2.test.ts`):

| quantity | this build | oracle |
|---|---|---|
| water total energy | −5.070324844258 Eh | −5.070325081194 Eh |
| PCl5 total energy | −25.3865870766 Eh | −25.3865883312 Eh |
| PCl5 P–Cl axial (after optimisation) | 2.1557 Å | 2.1556 Å |
| PCl5 P–Cl equatorial | 2.0269 Å | 2.0271 Å |

Agreement is under 10⁻³ kcal/mol on energies and within 0.0002 Å on optimised
bond lengths. Successive trims return bit-identical numbers (16 digits on the
water and PCl5 optimisations), and the full test suite passes. A rebuild from
identical inputs is expected bit-identical too — confirm a fresh build with
`md5sum` against the vendored bytes before swapping it in.

The Berny-enabled build (2026-10-05; `occjs.wasm` md5
`f84f0dd331d69f4e3fd6ad7ca8e2a421`) adds bindings only — the GFN2 engine is
the same code, and the oracle-pinned tests pass unchanged on it.

The property build (2026-10-09, step 3c; `occjs.wasm` md5
`6f7539346123a0b8374e8e518acaab3f`), against the oracle on identical
geometries:

| | this build | oracle |
|---|---|---|
| water full dipole | 2.279 D (z −0.897 e·bohr) | 2.278 D (−0.896) |
| formaldehyde full dipole | 2.415 D | 2.411 D |
| formaldehyde Wiberg C=O / C–H | 2.012 / 0.945 | 2.012 / 0.945 |
| formaldehyde HOMO / LUMO | −11.560 / −8.056 eV | −11.572 / −8.066 eV |

`orbitalValues` of the formaldehyde HOMO integrates to 1.0000 on a 0.2-bohr
grid (216 000 points, ~40 ms), and its analytic gradient matches a finite
difference to 1e-5.

With the quadrupoles (2026-10-09; `occjs.wasm` md5
`cabaf1c2d977f26d89f7763e1a95e633`, +59 bytes gzip): the charges' quadrupole
plus the atomic dipoles' plus Σ `atomicQuadrupoles` reproduces xtb's printed
"full" molecular quadrupole (about the coordinate origin) to 0.003 e·bohr²
for water and formaldehyde — which pins the order and the ½(3xᵢxⱼ − r²δᵢⱼ)
convention.

With the density and the exact potential (2026-10-09; `occjs.wasm` md5
`2ff3708c837b5628d53a740f1c8fb5d9`, +152 KiB gzip — the potential integrals):
the density integrates to the valence electron count (water 7.999, pyridine
and benzene 30.000 on a 0.25-bohr grid), and the exact potential equals the
charges + atomic dipoles + quadrupoles sum at 8 and 15 Å (water to 4
decimals in e/Å) while parting from it near the atoms, where the clouds
overlap (pyridine 2.5 Å past the N: −108 exact against −159 kcal/mol/e from
the multipoles). 20 000 points: 35 ms for water, 0.6 s for benzene.

## API notes for callers

The bindings are raw embind, and the units are **not** uniform:

- Molecules are built with `new Molecule(IVec, Mat3N)` in **Ångström** (the
  `fromXyzString`/`fromXyzFile` bindings are removed — the app never called
  them).
- `XtbCalculator.updateStructure()` and `.positions()` use **bohr**.
- `.energyAndGradient(numerical, step)` returns a plain `{ energy, gradient }`
  object; the gradient is **Eh/bohr**, indexed `Mat3N.get(coordinate, atom)`.
- `XtbCalculator` has no accessible constructor — instances come from the static
  factory `XtbCalculator.fromMolecule(mol)`, which returns a raw pointer that the
  caller owns (`calc.delete()`). Upstream also binds `.fromDimer()` and
  `.fromCrystal()`; the xtb pruning above removes them.
- Threading is compiled out: the link carries no `-pthread`, so the module
  instantiates without COOP/COEP headers. `setNumThreads(1)` is still called,
  but TBB stays linked yet idle — the engine never spawns a thread.

`src/geometry/gfn2-refine.worker.ts` encodes all of this; read it first.
