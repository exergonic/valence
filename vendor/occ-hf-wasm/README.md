# occjs (Hartree–Fock) — vendored on-demand HF engine

OCC's Hartree–Fock, and nothing else, compiled to WebAssembly: the engine
behind the Charge Model view's HF/def2-SVP charge sets
(`src/geometry/hf-single-point.worker.ts`). It is fetched the first time an
HF set is chosen, not at startup; the GFN2-xTB engine (`vendor/occ-wasm/`)
stays the app's one geometry engine.

- **Upstream:** <https://github.com/peterspackman/occ>, the same pinned commit
  as `vendor/occ-wasm/` (`5644eaf5632bb65b81f70082c873b30324b49b82`, untagged
  0.9.6).
- **Licence:** LGPL-3.0-or-later (OCC is dual GPL/LGPL; Valence takes the
  LGPL branch). The complete corresponding source is upstream at that commit
  plus the two patches below; rebuild with these steps and drop the three
  outputs back here to relink.

## Producing it

1. A tree with `vendor/occ-wasm/occ-valence.patch` applied — the GFN2
   engine's patched tree (`C:/Users/mccan/Code/occ-096`), or a copy of it
   (`C:/Users/mccan/Code/occ-096-qm` was used, so the GFN2 tree stays
   untouched).
2. Apply `occ-hf.patch` from this directory. It changes three files:
   - `src/occjs.cpp`: register `core` and `qm` bindings only (no `xtb`, no
     `opt`);
   - `src/CMakeLists.txt`: compile `js/core_bindings.cpp`,
     `js/qm_bindings.cpp` and `occjs.cpp` only;
   - `src/js/qm_bindings.cpp`: two bindings on `Wavefunction` —
     `electricPotential(points)` (the wavefunction's exact potential: nuclei
     less any ECP core, plus electrons) and `dipoleMoment()` (the density's
     dipole about the origin, each nucleus at Z less its ECP core electrons;
     OCC's own `compute_multipoles<1>` counts the full Z, which is wrong for
     iodine and beyond).
3. The preloaded data is def2-SVP alone: `share/` holds only
   `share/basis/def2-svp.json` (from upstream's `share/basis`). The SCF's
   starting guess (superposed atomic densities) reads its basis from there
   too, so without it every SCF runs on NaN.
4. Configure and build exactly as `vendor/occ-wasm/README.md` step 5
   (Emscripten 6.0.10, `-msimd128`, `-include cstdlib` on the C++ flags), then
   `cmake --build wasm --target occjs`. Outputs: `wasm/src/occjs.{wasm,js,data}`.

| file | raw | gzip | md5 |
|---|---|---|---|
| `occjs.wasm` | 5.48 MB | 1.39 MB | `1182601b279a10d11b7a462bcf523ca4` |
| `occjs.js` | 0.12 MB | 0.03 MB | `7c624b834c16b756f08316f4a5c5280f` |
| `occjs.data` | 0.22 MB | 0.03 MB | `4883a2684fefac8cbbeed513054205c6` |

About **1.45 MB gzip** in all (GitHub Pages serves gzip), fetched once and
then kept by the browser's cache.

## Using it

- **def2 is spherical.** `AOBasis.load` gives Cartesian d and f shells unless
  `setPure(true)` is called — another basis, millihartrees from every other
  program's def2-SVP. The worker calls it.
- An open shell's `electronDensity` comes back as every point's α density,
  then every point's β density (2 × points rows); the ESP is drawn on the sum.
- The SCF prints its table to stdout: drop `print`, as the GFN2 engine does.

## Verification

Against ORCA 6.1.1, HF/def2-SVP with `NoRIJCOSX TightSCF`, on identical
geometries (`tests/hartree-fock.test.ts`, `tests/references/orca-hf.json`):

| | this build (Eh) | ORCA (Eh) |
|---|---|---|
| water | −75.960959347 | −75.960959347 |
| formaldehyde | −113.779148963 | −113.779148963 |
| HI (def2 ECP on I) | −297.231544550 | −297.231544574 |
| Br₂ | −5144.184503028 | −5144.184503024 |
| O₂ triplet (UHF) | to 10⁻⁶ | −149.492945825 |

Dipoles agree to 10⁻³ e·bohr. CHELPG charges differ from ORCA's by up to
0.05 e: CHELPG is defined by its grid and radii, which the two programs
choose differently.
