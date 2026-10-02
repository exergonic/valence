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

Requires the Emscripten SDK, CMake ≥ 3.16 and Ninja. Pinned-commit checkouts: a
pristine reference at `C:/Users/mccan/Code/third-party/occ`, and the build
tree at `~/Code/occ` on Lenovo. Verify patches with `git diff` against
upstream before building.

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
    // register_solvent_bindings(); // COSMO-RS solvents
    // register_qm_bindings();      // register_correlation_bindings();
    // register_dft_bindings();     // register_opt_bindings();
    // register_isosurface_bindings();  // register_cube_bindings();
    // register_crystal_bindings();     // register_descriptors_bindings();
    // register_dma_bindings();         // register_mults_bindings();
    // register_volume_bindings();      // register_cg_bindings();
    function("setLogFile", &occ::log::set_log_file);
    constant("version", std::string("0.9.4"));
}
```

Only the `core` and `xtb` binding sources are compiled (the rest still link
~0.5 MB of dead glue); the `fromXyzFile`/`fromXyzString` Molecule bindings are
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

## Contents

`occjs.wasm` (the engine), `occjs.js` (the emscripten glue) and `occjs.data`
(the preloaded `share/` tree, mounted at `/`). Only the `occjs` target is
built. The engine runs single-threaded (`setNumThreads(1)`); a threaded build
needs `SharedArrayBuffer`, which needs COOP/COEP headers, which GitHub Pages
cannot serve — single-threaded is what makes this deployable as a static site
at all.

Registered bindings: `core` (Molecule, Mat3N, IVec, logging, threading) and
`xtb` (the GFN2 engine). Everything else upstream registers — QM, DFT,
solvent/COSMO-RS, crystals and the rest — stays commented out; uncomment a
line to restore that capability (rebuild required). The preloaded data is the
GFN2 parameters (`share/xtb`), the D4 tables (`share/dftd4`), COSMO/SMD data
(`share/solvent`, kept for a future solvation path) and small tables.

| file | raw | gzip |
|---|---|---|
| `occjs.wasm` | 2,203 KiB | 747 KiB |
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
water and PCl5 optimisations), and the full test suite passes.

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
