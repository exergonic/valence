# occjs — vendored GFN2-xTB engine

The JavaScript/WebAssembly bindings (`occjs` target) of OCC's **in-tree**
GFN2-xTB implementation, used as the default geometry engine of Valence's local
pipeline.

- **Upstream:** <https://github.com/peterspackman/occ>
- **Commit:** `826d76966a14b880d6e47e367c72db1be3f26395` (tag `v0.9.4`)
- **Licence:** LGPL-3.0-or-later. OCC is dual-licensed
  `(GPL-3.0-or-later OR LGPL-3.0-or-later)`; Valence takes the **LGPL** branch.
  OCC is © Peter Spackman and contributors; the complete corresponding source is
  the upstream repository at the commit above, plus the three modifications
  documented below (LGPL-3 §4 requires that a recipient be able to relink the
  library — rebuild it with these commands and drop the outputs back into this
  directory).

## What was built

`occjs.wasm`, `occjs.js` (the emscripten glue) and `occjs.data` (the preloaded
`share/` tree, mounted at `/`). Only the `occjs` target is built — the `occ` CLI
is a separate artifact linked with `PROXY_TO_PTHREAD` and oneTBB, and a threaded
build needs `SharedArrayBuffer`, which needs COOP/COEP headers, which GitHub
Pages cannot serve. The engine is driven single-threaded (`setNumThreads(1)`),
which is why this deploys as a static site at all.

## Rebuild

Requires the Emscripten SDK, CMake ≥ 3.16 and Ninja.

Two checkouts of the pinned commit exist: a pristine reference at
`C:/Users/mccan/Code/third-party/occ`, and the build tree at `~/Code/occ` on
Lenovo, because emsdk, CMake and Ninja live there. Patch the pristine copy and
`scp` the files across — `edit` handles only local paths, so a remote file
otherwise has to be rewritten wholesale with `write`. Verify every patch with
`git diff` against upstream before building.

**1. Clone and check out the pinned commit.**

```bash
git clone https://github.com/peterspackman/occ.git && cd occ
git checkout 826d76966a14b880d6e47e367c72db1be3f26395
```

**2. Patch `src/occjs.cpp`** — drop the unused binding registrations. A
registered binding is *reachable code*, so the linker cannot discard what it
pulls in:

```cpp
EMSCRIPTEN_BINDINGS(occ) {
    register_core_bindings();      // Molecule, Mat3N, IVec, logging, threading
    register_xtb_bindings();       // GFN2-xTB — the geometry engine
    register_solvent_bindings();   // COSMO-RS solvents
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

Worth **21,390 → 14,629 KiB** of wasm (6,762 → 4,868 KiB gzipped): the DFT
(libxc, 9 MB of archive), Hartree–Fock/SCF (`libocc_qm`, 17 MB), coupled
cluster, crystallography and elasticity machinery all become unreachable.
Uncommenting a line restores that capability.

**3. Patch `src/js/xtb_bindings.cpp`** — drop nine bindings that name types from
the stubbed modules: `fromDimer`, `fromCrystal`, `toCrystal`, `toWavefunction`,
`isPeriodic`, `lattice`, `setKpoints`, `kpoints`, `updateStructureWithLattice`,
plus the `dimer.h`, `crystal.h` and `wavefunction.h` includes. This app is
molecular and only calls `fromMolecule`.

Worth **14,629 → 14,541 KiB** (4,868 → 4,839 KiB gzipped) — only 88 KiB. Almost
all of `libocc_qm` and `libocc_crystal` was *already* unreachable after patch 2;
what remained was the thin glue of those entry points themselves. Worth keeping
because it removes dead bindings, not because it saves meaningful bytes.

**4. Strip the unused basis sets.** 7.4 MB of the 8.5 MB `share/` tree is HF/DFT
basis sets, which GFN2 never reads:

```bash
mv share/basis /tmp/occ-share-basis-unused
```

Takes `occjs.data` from 8,660,442 to 1,096,265 bytes. It matters for disk,
memory and startup decode rather than for the wire: those basis sets are
repetitive tables that already compressed ~6:1, so the transfer saving is about
1 MB gzipped, not 7.

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

## What ships

| file | raw | gzip |
|---|---|---|
| `occjs.wasm` | 14,541 KiB | 4,839 KiB |
| `occjs.data` | 1,070 KiB | 254 KiB |
| `occjs.js` | 146 KiB | 36 KiB |

About **3.2 MiB brotli** in total (estimated from the gzip ratio; the wasm is the
whole of it), lazily loaded, single-threaded, on a static host.

## Verification

Checked against the Fortran xTB oracle (`xtb --gfn 2`) on identical geometries,
and by the app's own oracle-pinned test (`tests/gfn2.test.ts`, 330 tests pass)
after each trim — the energies below are identical before and after both
patches:

| quantity | this build | oracle |
|---|---|---|
| water total energy | −5.070324844258 Eh | −5.070325081194 Eh |
| PCl5 total energy | −25.3865870766 Eh | −25.3865883312 Eh |
| PCl5 P–Cl axial (after optimisation) | 2.1557 Å | 2.1556 Å |
| PCl5 P–Cl equatorial | 2.0269 Å | 2.0271 Å |

Agreement is under 10⁻³ kcal/mol on energies and within 0.0002 Å on optimised
bond lengths.

## API notes for callers

The bindings are raw embind, and the units are **not** uniform:

- `Molecule.fromXyzString()` and `new Molecule(IVec, Mat3N)` take **Ångström**.
- `XtbCalculator.updateStructure()` and `.positions()` use **bohr**.
- `.energyAndGradient(numerical, step)` returns a plain `{ energy, gradient }`
  object; the gradient is **Eh/bohr**, indexed `Mat3N.get(coordinate, atom)`.
- `XtbCalculator` has no accessible constructor — instances come from the static
  factory `XtbCalculator.fromMolecule(mol)`, which returns a raw pointer that the
  caller owns (`calc.delete()`). Upstream also binds `.fromDimer()` and
  `.fromCrystal()`; patch 3 removes them.
- `setNumThreads(1)` is load-bearing, not an optimisation: the wasm is built with
  pthreads, and a threaded build needs `SharedArrayBuffer`.

`src/geometry/gfn2-refine.worker.ts` encodes all of this; read it first.
