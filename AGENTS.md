# AGENTS.md — the constitution

The stable rules for this project: what the app must do, where things live, what
may not break. Everything that explains *why* a rule exists, or records what was
measured, lives in `NOTES.md` — that file is a working log, free to add to and
correct. **If a change alters a rule here, ask first.**

**Numbers have one home.** This file states claims, not measured figures. A
figure a claim depends on is pinned in a test — against the oracle where
there is one, at a geometry the test names — and the claim points to it; a
measurement kept for the record goes in `NOTES.md`, dated. A setting (a time
budget, a gate, a cut-off, a radius) *is* a rule, and stays here (decided with
the user 2026-10-24, after figures copied here went stale or lost their
geometry).

## Code Style

This code is written for **chemists who code**, not software engineers.

- **Names use chemistry vocabulary.** If a concept has a chemistry name,
  that is the name (`buffered_14_7_vdw`, `partial_charges_from_bci`).
  Generic things get plain names (`i`, `dot`, `sum`). A forced chemistry
  name on a generic thing is worse than a plain one.
- **Comments explain why, not what.** Decision points where the *chemistry*
  drives a branch get comments; restatements of TypeScript are noise.
- **Simple beats clever.** If a block needs paragraphs of justification,
  simplify it. The longer-but-obvious version wins.
- **No architecture astronautics.** An abstraction needs two concrete users
  before it exists. Plain functions; no registries, no plugin systems.
- **The optimizer is the exception.** Inside `src/optimize/fast-system.ts`
  and the line search, performance is the domain: flat typed arrays,
  scalar math, dense comments about cache/ULP behavior are correct there.
  The readable term functions remain the ground truth; the fast path must
  match them within the documented tolerance, enforced by
  `tests/fast-system.test.ts`.
- **Never hand-build molecular structures.** Generate from SMILES via a
  toolkit, take them from the validation suite, or ask. Hand-typed
  coordinates carry silent errors.
- **Filenames and folders relate to chemistry.** Folders under `chem/` name the
  **method** — the chemist's unit of thought (`vsepr/`, `charge-model/`,
  `extended-huckel/`) — and the files inside name the **action** that method
  performs (`hybridize.ts`, `orient-pi.ts`, `slater-overlap.ts`). A body of
  chemistry too small for a folder stays a file at the `chem/` root
  (`radii.ts`, `kekulize-smiles.ts`). Everywhere else (`geometry/`, `render/`,
  `ui/`) folders and files get clear noun names after the chemistry they handle
  or display.

## Stack
- **Bun** 1.4 — the package manager and script runner: `bun install`,
  `bun run <script>` (`bun.lock` is the lockfile; Node.js is still installed but
  the project is bun-managed)
- **Vite** + **TypeScript** — `bun run dev`, `bun run build`, `bun run preview`
- **Three.js** (vanilla, no React) — scene graph in `src/render/`
- **Vitest** — `bun run test`, `bun run test:watch` (the runner is still Vitest,
  not `bun test`)
- **JSME** — molecule sketcher, mounted in its own panel (not inside Three.js)

## Pipeline
1. JSME → SMILES + MOL block; parse atoms/bonds (`src/mol-parser/`)
2. Kekulize the SMILES — monocyclic aromatic rings only
3. Try PubChem PUG REST for MMFF94-optimized 3D; accept only if the guard
   passes (`validate-structure.ts`): heavy-atom bond graph, each heavy atom's
   hydrogen count (drawn + what the local filler would add) AND net formal
   charge match the sketch, and the charged species is one the MMFF94 type
   space can represent — an unrepresentable ion (carbanion C⁻) gets a
   neutral-typed conformer whose shape is an artifact, so it falls through
   to the local pipeline rather than rendering a wrong "PubChem 3D". **A
   sketch containing a metal skips steps 3–4** and goes straight to the local
   pipeline: PubChem has no 3D for most metal compounds, and CIR builds them
   by rule, roughly (NOTES.md: H₃Si–Ni)
4. Fall back to NIH CACTUS (CIR) with the same validation
5. Fall back to the local pipeline: implicit H's → graph-walk embed at
   covalent bond lengths (an optimiser needs a 3D start, not a flat sketch) →
   **GFN2-xTB, the one local geometry engine**. A real semiempirical
   optimisation (extended tight binding) in its own Web Worker, over a vendored
   wasm preloaded in the background at startup (`vendor/occ-wasm/`, LGPL-3;
   `src/geometry/gfn2-refine.ts` + `.worker.ts`). The optimiser is **OCC's
   Berny** (internal coordinates; bound in the vendored wasm, trimmed), on
   the engine's analytic gradient — exact since the engine was rebuilt on
   OCC 5644eaf (2026-10-23), which made D4 self-consistent
   (peterspackman/occ#58). Berny's own convergence test is on its internal
   coordinates, which a structure whose bonding shifts can satisfy with the
   Cartesian gradient still large, so a converged point must also meet a
   Cartesian gate (Gaussian's loose max force, 2.5e-3 Eh/bohr), and Berny is
   restarted from it when it does not. When Berny cannot finish,
   **mmff94-ts's** Cartesian optimisers take over (L-BFGS, bounded steepest
   descent) through the library's `EnergyGradientFn` oracle. The app must not
   hand-roll a minimiser again (see NOTES.md). A converged run carries a Hessian verdict, and a saddle is pushed
   down its imaginary mode and re-optimised, so a stationary point is never
   silently called a minimum. The whole run has a **30 s budget**: this is a
   teaching tool, and a good-enough structure in seconds beats a perfect one in
   minutes. **Spin:** a sketch carries none, so GFN2 runs at the lowest
   multiplicity the electron count allows — a singlet when it is even, a
   doublet when it is odd (an odd count cannot be a singlet; the engine fails
   outright) — unless the structure has its own (an example) or one is chosen
   in the spin control under "Refine with GFN2-xTB". A run that is not a
   singlet says so, and why. A run that stops short shows the lowest-energy structure it
   reached, labelled not fully converged; a run that produces nothing (no
   Worker, an element outside GFN2's table, cancelled) shows the embedder's
   start, labelled unoptimised. **A result must still be the molecule drawn —
   its drawn bonds, some possibly partial, and no new ones**: GFN2 moves
   nuclei, not bonds, so a result in which an undrawn bond formed
   (`bond-integrity.ts`) is set aside, and the start is shown, saying which
   bond. A drawn bond stretched past 1.3× its covalent radii sum is graded by
   GFN2's Wiberg order (decided with the user 2026-10-23, after a bromonium
   ion opened toward its benzylic carbon): at 0.1 or more it is a **partial
   bond** — an unsymmetrical bromonium's long C–Br — and the result is shown,
   the bond drawn dashed; below 0.1 it came apart, and the result is set aside
   but kept: a button in the header shows it, and the start again. **MMFF94 is no longer a geometry engine** — it
   was wrong on too many educationally central small molecules (it bends
   PCl₅'s trigonal bipyramid and makes the *axial* bonds the shorter pair,
   where GFN2 has them the longer, as the textbook does — pinned against the
   oracle in `tests/gfn2.test.ts`; NOTES.md). mmff94-ts stays as the
   optimiser's stepping and as the charge model a user can choose. A *PubChem*
   structure is still an MMFF94 conformer, so the parameter-gap report and the
   3-ring pucker report (`ring-pucker.ts` — reported, never repaired) still run
   on it — and only on it: CIR builds by rule (CORINA) and MMFF94 never touches
   its structures, so an MMFF94 caveat there would blame the wrong thing
6. Classify hybridization / lone pairs / π orbitals (`src/chem/`)
7. Render in Three.js (`src/render/`)

## Where things live
- `src/mol-parser/` — fixed-width MOL block parser, hand-rolled
- `src/chem/` — one folder per method; the files inside are its actions:
  - `vsepr/` — the Lewis-like picture: `hybridize.ts` (electron domains →
    hybridization), `ideal-vsepr-vectors.ts` (directions per hybridization,
    and an AXₘEₙ centre's bond directions), `compare-shape.ts` (does a GFN2
    structure have the shapes the picture predicts? reported in the Info log),
    `orient-lone-pairs.ts`,
    `orient-pi.ts` (the conjugation gate), `assign-orbitals.ts` (the per-atom
    orbital assignment the renderer reads, and the electron-domain count the
    builder reads).
    The picture describes the main group, its metals and noble gases included
    (BeCl₂, SnCl₂, BiCl₃, XeF₄); a transition metal, lanthanide or alkali
    metal shows only its valence s orbital ("4s" on Ni) — the d-based bonding
    is beyond a VSEPR picture, and a bare atom said less than the truth. **A
    bond drawn to an alkali metal is ionic** (decided with the user
    2026-10-20): no electron domain, and the metal's electron goes to the atom
    it touches — NaOH's O is hydroxide, AXE₃, the Na⁺ in the hollow between
    its lone pairs; a bare anion (NaCl's Cl⁻) points a lone pair at each
    cation. A ligand's bond to a transition metal stays a donor domain
  - `charge-model/` — the displayed partial charges and what they feed:
    `bci-charges.ts` (the MMFF94 BCI model: resolution + the refusal rule),
    `dipole.ts`, `esp.ts`, `esp-fit.ts` (Merz–Kollman ESP-fitted charges),
    `cm5.ts` (Hirshfeld partitioning and the CM5 correction), `core-density.ts`
    (the free-atom core densities GFN2 leaves out, added back for the ESP
    surface; its table is generated). The charges are GFN2-xTB's **ESP-fitted** charges by
    default (decided with the user 2026-10-12: of the point charges, they
    match the ESP surface most closely), fitted to the background single point
    every structure on screen gets; the labels wait the moment the fit takes,
    and Mulliken stands in when it cannot be built. **The labels print those point charges; under GFN2 the ESP and
    the dipole come from the full electron density**: the ESP is drawn on
    GFN2's own 0.001 au density surface (the textbook convention — it bulges
    over lone pairs and π clouds) — GFN2's valence density with each atom's
    free-atom core added back (`core-density.ts`, from ORCA X2C atoms,
    `scripts/core-densities/`; without it the surface missed NaOH's Na⁺) —
    and coloured by the exact potential of its
    charge distribution, both built in the worker; the dipole is the full one
    (the charges plus the CAMM atomic dipoles, which sum to the density's
    dipole). So they need not add up from the labels: for water and pyridine
    the point charges alone give well under the full dipole (the figures, at
    named geometries, in `tests/gfn2.test.ts`, "the claims AGENTS.md makes of
    GFN2-xTB").
    This is a **hidden default**: whenever the engine can give it, it is what
    is drawn, with no switch back to the point charges (decided with the user
    2026-10-09: it is correct to the model, and the hint under "Charges from"
    says why the labels do not add up to it). The Charge Model control offers
    three GFN2 charge sets — three ways of dividing the one density into atoms:
    **ESP-fitted** (the default: the point charges that best reproduce the
    exact potential on Merz–Kollman shells; they give back the full dipole,
    but a buried atom's charge is poorly determined), **Mulliken** (by basis
    function; GFN2's own SCC charges) and **CM5** (Hirshfeld on GFN2's density with GFN2 free atoms
    as the promolecule, plus the published CM5 bond correction — the correction
    checked against the Fortran xTB oracle). Only the labels change between
    them: the ESP and the dipole are the density's (added with the user
    2026-10-12, after a lesson on the inductive effect). ESP-fitted and CM5 are
    built in the worker when first chosen; when one cannot be, Mulliken stands
    in and the control says so. Under
    MMFF94 all three are the BCI charges'. MMFF94 BCI is used only when the
    user picks it in the Charge Model control, or when the engine cannot give
    charges for the molecule
  - `extended-huckel/` — the extended-Hückel MO solver: `parameters.ts`
    (Alvarez's table; ICON8 in full for Si, P, S and Cl, which need a 3d the
    Alvarez set does not have), `assign-basis.ts` (molecule → atomic orbitals),
    `align-principal-axes.ts` (the frame the calculation runs in — the AO
    basis is tied to the coordinate axes, so a ring must be aligned to a
    coordinate plane or its π orbitals come out as px/py/pz mixtures),
    `slater-overlap.ts` (S), `hamiltonian.ts` (H), `solve.ts` (the
    calculation and the closed-shell filling rule),
    `canonicalize-degenerate.ts` (symmetry-adapted partners for a degenerate
    set), `irrep-labels.ts` (Mulliken labels from characters), `mo-surface.ts`
    (the isosurface the renderer draws)
  - `gfn2-xtb/` — what one GFN2-xTB calculation knows, as the views read it:
    `orbital-ladder.ts` (GFN2's self-consistent MOs as a ladder beside
    extended Hückel's: the worker describes its basis by probing each function,
    so the EH irrep labels and degenerate-set canonicalization are reused on
    GFN2's own overlap; and each ladder as a space to localize, its Fock
    matrix rebuilt from the orbitals), `normal-modes.ts` (harmonic vibrations
    from the optimiser's Hessian: mass-weighted, rigid motions projected out),
    `thermochemistry.ts` (ZPE, H, S, G at 298.15 K, 1 atm from those
    vibrations: plain RRHO, σ from the point group's proper rotations; held
    to the Fortran xtb oracle, tests/references/xtb-thermochemistry.json;
    shown under the vibration control and written to the SDF)
  - `localized-orbitals/` — Pipek–Mezey localization of **GFN2-xTB's MOs**,
    each spin channel of an open shell on its own; extended Hückel's only when
    GFN2 has none to give (the engine failed, or a build without the orbital
    bindings) — decided with the user 2026-10-13: one self-consistent
    electronic structure behind the charges, the ESP and the bonds, and open
    shells localize. The Localized view waits the moment the single point
    takes. The Delocalized ladder is GFN2's by default too, its button first
    (decided with the user 2026-10-13: GFN2's orbitals take primacy);
    extended Hückel stays selectable beside it, as the textbook model. `localize-pm.ts` (the rotation, on any
    `OrbitalSpace`), `valence-virtuals.ts` (the empty block it localizes:
    Knizia's IAOs on the basis's own s and p — d kept only on the d block —
    less the occupied space, n_minimal − n_occupied orbitals; a polarization
    d is not a valence virtual, so PCl₅ lists 4 empties, not 34. A minimal
    basis gives back its canonical virtuals), `mulliken-populations.ts` (the objective it maximizes),
    `order-localized.ts` (display order and character classes — avo_ibo's
    gates, tuned on extended Hückel, unchanged for GFN2; an empty orbital
    above 0.90 on one atom is that atom's LV, as a filled one is its lone
    pair — Na⁺'s 3s and 3p were named σ*/π* toward the O), `fock-couplings.ts`
    (⟨φᵢ|F|φⱼ⟩ between the localized orbitals: the panel ticks the ones the
    picked orbital mixes with — filled with filled, empty with empty only),
    `lewis-orbitals.ts` (the Localized view's second method, "Lewis
    structure": the drawn structure made into NBO-style orbitals from GFN2's
    density in a Löwdin basis — lone pairs, bonds, antibonds, empty valence
    orbitals (LV, NBO's lone vacancy), leftover d as unlisted Rydbergs — and the donor–acceptor
    E(2) = q·F²/Δε between them, the panel's number and underline. Closed
    shell, main group, two-centre bonds only; anything else is refused with
    the reason. An alkali metal is taken, its drawn bond ionic as in the VSEPR
    picture (decided with the user 2026-10-21): NaOH is ⁻OH's three lone pairs
    and σ, and Na⁺'s empty 3s (LV, its 3p Rydbergs, as in NBO's minimal
    basis) — the lone pairs' donation into it is the covalent part of the
    ionic bond. **The Localized view's default** (decided with the user
    2026-10-19); when a drawing has no Lewis orbitals, Pipek–Mezey's list
    stands in, its note giving the reason, and the switch shows the method on
    screen. The list's cues belong to the **anchor**, the first orbital drawn,
    and stay while partners are drawn beside it; removing it hands the anchor
    on (decided with the user 2026-10-19, after the cues followed the latest
    pick and sent the reader chasing). `rankDonations` feeds the E(2) table
    above the list: every donation, strongest first, an entry drawing its
    donor and acceptor)
  - root — shared tables and graph fixes that belong to no method:
    `radii.ts`, `assign-mass.ts`, `kekulize-smiles.ts`, `fill-hydrogens.ts`,
    `valence-electrons.ts` (read by both the VSEPR picture and the EH solver),
    `elements.ts` (atomic numbers and periods; which elements are metals, which
    show only a valence s; the lowest spin an electron count allows),
    `d-electron-count.ts` (a metal's dⁿ from the sketch, drawn ionically or
    covalently — the embedder's square-planar test)
- `src/geometry/` — the 3D structure pipeline (it *consumes* the VSEPR
  directions, so it sits above `chem/`): `resolve3d.ts` +
  `validate-structure.ts` (remote fetch and its guard), `place3d.ts` (the
  embedder: ideal VSEPR vectors at covalent bond lengths, each torsion set as
  the atom is placed — anti about single bonds, the sketch's cis/trans about
  double bonds — aromatic rings flat, each ring H outward from its own ring, a
  ring hung on a single bond turned out of any clash (two phenyls on one
  carbon). **Lone pairs are electron domains**: a
  main-group centre's bonds take the AXₘEₙ shape the VSEPR picture names
  (water bent, NH₃ pyramidal, SF₄ a seesaw, ClF₃ T-shaped, XeF₄ square
  planar — lone pairs equatorial in a trigonal bipyramid, trans in an
  octahedron), a lone pair beside a π system counting as its p orbital (an
  amide N starts trigonal). A metal's shape is its neighbour count, a
  four-coordinate d⁸ singlet square planar), `embed.ts` (the starting structure: `embed3D`, the symmetry
  kick, the wedges asserted after the engine), `local-geometry.ts` (the local
  pipeline: GFN2, or the labelled start), `gfn2-refine.ts` +
  `gfn2-refine.worker.ts` (the GFN2-xTB engine, preloaded at startup; returns the
  optimised geometry, its per-atom charges, a Hessian minimum/saddle verdict
  and, at a minimum below 16 atoms, its vibrations, and reports progress;
  cancellable. Every displayed structure also gets one background single
  point, in its principal-axis frame: charges, Wiberg bond orders, spin
  populations, the full dipole and the MOs; the worker keeps that calculator
  to build an orbital's isosurface on request), `mmff94-molecule.ts` (the mmff94-ts
  adapter, for the charge model and the optimiser), `parameter-warnings.ts`,
  `stereo-wedge.ts` (drawn wedge/hash enforcement), `bond-integrity.ts` (does
  an optimised structure still have the sketch's bonds — and is a stretched
  one partial, or gone?), `ring-pucker.ts` (reports
  an MMFF94 conformer's puckered 3-ring centres — fetched structures; it never
  moves atoms), `symmetrize.ts` (the snap to the point group a structure nearly
  has, reported in the Info log)
- `src/render/` — the Three.js layer, named after what it displays: scene,
  `bonds.ts` (a stretched bond dashed, one line whatever its order),
  `lobes.ts`, the two orbital pictures by model
  (`hybrid-orbitals.ts` = VSEPR hybrids and lone pairs, `mo-lobes.ts` =
  extended-Hückel MO lobes with phase colors), `pi-systems.ts` (the "Highlight π
  systems" π cloud: the in-phase sum of each system's p orbitals, drawn as two
  sheets either side of the σ framework, member lobes tinted), `atom-styles.ts`,
  `rebuild.ts`, `label-colors.ts`, `chem-data.ts`, `labels.ts` (element,
  hybridization, charge, Wiberg bond-order and spin-density labels),
  `vibration.ts` (a normal mode played: the atom and bond meshes moved each
  frame, the orbital pictures stepped aside), `view-orientation.ts` (the first
  view and the reset: longest extent across, broad face toward the reader,
  heavier end up and right; symmetric tops turned and tilted 25° so no atom
  hides — asked for 2026-10-19), `axis-legend.ts` (the structure's x, y, z
  above the corner buttons, turning with the trackball and auto-rotate; an
  SVG overlay in the theme's `--axis-*` tokens)
- `src/ui/` — the screen is the sketcher (left), the scene, and the
  **inspector** (right), which shows only the active model view's controls;
  everything global lives in the **settings drawer**. `model-views.ts` (the
  four views and the inspector they drive), `controls.ts` (every control,
  found by id), JSME wiring, `examples.ts`, export (SDF/XYZ; `sdf-data.ts` the SDF's data fields, `mo-data.ts` the MO printout), `theme.ts` (the
  three looks — Graphite, Steel, Light — whose colours and typefaces are
  tokens in `main.css`; every colour in the stylesheet is a token),
  `context-menu.ts`, `sketcher-toolbar.ts` (our toolbar over JSME),
  `charged-x-atoms.ts` (the charges JSME refuses, carried on its X atom),
  `periodic-table.ts` (the "More…" popover, H–Rn), `functional-groups.ts`
  (the "Groups…" popover: 26 of JSME's own substituent actions, by family;
  a group is dragged straight out of it onto an atom, or picked and clicked),
  `mo-diagram.ts` (the orbital list in the inspector: the
  level ladder or the localized list, and the click-to-draw selection),
  `tooltip.ts` (the hover, per view — asked for 2026-10-21: VSEPR the lobe's
  hybrid; Charge Model the ESP under the pointer, kcal/mol per unit charge;
  Localized the orbital's NBO hybrid spᵡ on the atom under the pointer and its
  E(2) with the anchor; Delocalized the MO and the lobe's atom by s/p/d share,
  and its phase)
- `src/utils/` — generic math, no chemistry: vector math (`vec3.ts`), the
  eigensolver for `Hc = εSc` (`eigen.ts`), signed-field surfaces by marching
  tetrahedra (`march-tetrahedra.ts`: the MO isosurfaces and the π cloud)
- `vendor/mmff94-ts-0.1.0-alpha.2.tgz` — the committed MMFF94 engine; Vite embeds
  it into the worker chunk, so after updating the tarball rebuild/restart the app
- `vendor/occ-wasm/` — the committed GFN2-xTB engine (OCC's `occjs` target at
  commit 5644eaf, LGPL-3, built from the recipe in its `README.md`; `occ-valence.patch` is the
  complete source modification, Valence's property bindings included — the
  full dipole, the AO map, orbital values on points). Vite emits its wasm and
  data as hashed assets from the worker's `?url` imports, so nothing needs
  copying into `public/`

## JSME integration
- **Package:** `jsme-editor` (npm) — no manual file management
- **Loading:** script tag in `index.html` loads `jsme.nocache.js` from `node_modules`
- **Build:** a Vite plugin copies JSME files to `dist/jsme/` for production
- **Usage:** `window.JSME` global after the script loads
- **Our toolbar, JSME's engine.** JSME's own menus are clipped out of view
  and not pressed while drawing — a simulated press left JSME deaf to the next
  click. Our toolbar (`src/ui/sketcher-toolbar.ts`) uses JSME's `setAction()`
  codes for tools, its Ctrl+Z/Ctrl+Y for undo/redo, its hover-and-type keys
  for elements, and `clear()`; the drawing's SVG colours are remapped per
  theme in `main.css`. The one exception: at startup the hidden **X** button
  is pressed once, out of sight, to borrow the text box of its "Nonstandard
  atom" dialog — JSME reads that box live, so every element past the nine
  buttons ("More…", `src/ui/periodic-table.ts`, H–Rn) is that box's value and
  the `x` key. A toolbar button can also be dragged onto the sketch: JSME sees
  the real pointer moves but not the press (it happened on our button), so on
  a drop that will draw something a synthetic mousedown is dispatched on
  JSME's drawing just before the real release — unlike a press on its hidden
  menus, this leaves JSME responsive. **Move** is action 113 ("Move atom"):
  one atom per drag, no lasso (JSME has none); Shift-drag on empty space
  rotates the molecule with any tool. **Clean** reads JSME's own MOL block back
  with every coordinate zeroed, which makes JSME compute a 2D layout (its
  "Compute 2D coordinates" menu item is unreachable); it keeps every drawn
  atom and the stereo, and since JSME's undo cannot step back over a MOL read,
  the toolbar keeps the drawing from before for one Undo. **Charges JSME refuses** —
  it infers a charge from the bond count and overrides the one given (I₃⁻ and
  ICl₂⁻ come out cations, ICl₄⁻, BrF₄⁻, SF₅⁻ neutral, SiF₆²⁻ Si²⁺), and its
  charge tool will not charge a bonded halogen — go on its X atom, which
  keeps one literally: when JSME refuses a charge-tool click, the toolbar
  reads the drawing back as a JME string with the atom labelled "[I-]" (one
  Undo, as for Clean); Clean puts charged X atoms back after its MOL read,
  and the build reads their charges from JSME's V3000 block
  (`charged-x-atoms.ts`). JSME runs with **`polarnitro`**: every five-bonded
  N (nitro, nitrate, N-oxides, azide), read or drawn, is written N⁺–O⁻, so
  PubChem's charges match and the Lewis orbitals build. The codes, keys, the
  X box, the drop press, the clean and the charge fallback were mapped against jsme-editor 2024.04.29 — **a JSME upgrade must
  re-check them** (NOTES.md has the method; the smoke test places a Xe from
  "More…" and builds methyl chloride by dragging). One more piece of glue: in a
  sketcher under ~300 px JSME writes its menu icons with negative `<rect>`
  widths, which the browser logs as dozens of errors per load; `index.html`
  rewrites them to 0 (identical rendering) before parsing, and the smoke test
  loads a narrow window and fails on any console error

## Conventions
- No cheminformatics libraries — MOL parsing is hand-rolled from JSME's output.
- Hybridization is an electron-domain count from the bond graph (σ bonds + lone
  pairs, shifted by formal charge) — never a measured angle, which is the output.
- Orbital lobes are surfaces of revolution → `THREE.LatheGeometry`.
- Unit-test chemistry logic as pure functions, independent of Three.js.
- Static deploy only (GitHub Pages / SDF.org) — no server-side code.
- The render pipeline is state-driven: change a toggle → rebuild → redraw
  (`src/render/rebuild.ts`).
- Atom meshes of the lit styles (Soft, Glossy, Showcase) live on layer 1 with
  their own light rig — any new raycaster must `layers.enable(ATOM_LAYER)` or
  atoms stop being pickable.
- Atom spheres are 0.3 × the van der Waals radius (Avogadro's ball-and-stick
  scale, `render/chem-data.ts`); space-filling uses the full vdW radii. Bond
  radius is a separate knob. The stick representation draws atoms and bonds
  at one radius (0.16 Å × the bond knob), each bond half in its atom's colour
  and material; a bond mesh's `span` tells the vibration which stretch it covers.
- **A drawn wedge or hash is honored — the sketch is the specification, and the
  refinement may not overrule it.** Drawn rings keep their stereochemistry.
- Never ship a silently wrong structure: a fetch that fails validation falls
  through to the local pipeline, never to a wrong "PubChem 3D" render.
- **Implicit hydrogens go on nonmetals and semimetals only** (H, B, C, N, O,
  F, Si, P, S, Cl, Ge, As, Se, Br, Sb, Te, I — `fill-hydrogens.ts`), to their
  usual valence. A metal or a noble gas carries only the hydrogens drawn: the
  user is responsible for charges, hydrogens and the rest of the 2D
  structure, and we give back what they give us. "More…" enters a metal or
  noble gas into JSME bracketed (`[Ni]`) so JSME's SMILES agrees.
- The render model follows MolView's plugin pattern: a single facade in
  `src/render/` with separate modules for atoms, bonds and orbitals.
- Export keeps one source of truth per field: the SDF writer carries formal
  charges on `M  CHG` property lines and leaves the atom-block charge columns 0;
  XYZ has no charge field. **The SDF carries what Valence computed** — the
  download and the right-click copy alike (decided with the user 2026-10-13:
  one common format, no others until there is demand): data fields after
  `M  END` (`ui/sdf-data.ts`) — the structure's source, GFN2's energy, spin,
  dipole, frontier orbitals and frequencies, every charge set and the VSEPR
  assignment per atom in RDKit's `atom.dprop.`/`atom.prop.` convention, the
  Wiberg orders in bond-block order. The export waits for the GFN2 single
  point and its charge sets. XYZ is the structure alone.

## Environment
- **Bun** is at `C:\Users\mccan\scoop\shims\bun.exe` (a Scoop shim); `bunx` runs
  package binaries
- **Node.js** is still installed at
  `C:\Users\mccan\scoop\apps\nodejs\current\node.exe` (Scoop) — `npm`/`npx` work,
  but Bun is canonical here
- **OpenCode Desktop** does not inherit the full Windows PATH — use full paths
  if commands fail
- Typecheck with `bunx tsc --noEmit`
- **The oracles are on `lenovo`** (`ssh lenovo` on the LAN; off it, the
  Tailscale route in `AGENTS.local.md`, which is gitignored).
  A GFN2 question — a geometry, a minimum, an energy, a frequency — is
  checked against the Fortran **xtb 6.7.1** there (`~/opt/xtb/bin/xtb --gfn 2
  --chrg <q> --ohess vtight`) before the app's answer is blamed or trusted.
  Beside it: YAeHMOP `bind` (`~/yaehmop/tightbind/bind`, the extended-Hückel
  oracle), occpy 0.9.4 (`~/opt/occ-venv`), and the OCC build tree
  (`~/Code/occ`)

## Commands
| Task | Command |
|------|---------|
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Test | `bun run test` |
| Test watch | `bun run test:watch` |
| Lint | `bun run lint` |
| Typecheck | `bunx tsc --noEmit` |
| Smoke test (the app, end to end) | `bun run smoke [url]` — needs `bun run dev`, or a URL (the live site) |

## Known limitations (deliberate — details and evidence in NOTES.md)
- Kekulization covers monocyclic aromatics only; anything else relies on the
  fetch-time validation guard.
- Lone-pair inequivalence at bent AX₂E₂ centers is a didactic choice.
- The MMFF94 charge model, when chosen, runs on generic parameters for
  hypervalent centers (PCl₅, SF₆) — the dipole readout says so, never silent. A fetched (MMFF94)
  conformer of such a centre is warned about the same way.
- A fetched MMFF94 conformer can pucker the exocyclic substituent of a
  trigonal 3-ring centre well out of the ring plane (cyclopropenyl cation,
  cyclopropene — `tests/ring-pucker.test.ts`). The app reports it (`ring-pucker.ts`) and does not
  repair it; the local GFN2 engine gets these centres right.
- The Hessian verdict (minimum or saddle) and the saddle escape run only below
  16 atoms — above that the check costs more than the optimisation, and a
  converged structure is reported as a stationary point, not verified a
  minimum.
- The vendored engine is pinned at an **untagged** OCC commit (5644eaf: main
  after v0.9.5, version string 0.9.6, unreleased), because that is where
  the gradient fix is. Move the pin to the `v0.9.6` tag when it exists
  (`vendor/occ-wasm/README.md`).
- A Berny run that passes the Cartesian gate is still only as converged as
  the gate: a soft torsion can sit up to 2.5e-3 Eh/bohr from flat, a fraction
  of a kcal/mol above its minimum (NOTES.md, 2026-10-23).
- The embedder knows little of metal bonding: a four-coordinate d⁸ singlet
  starts square planar (dⁿ read from the sketch's charges and bonds), and
  every other metal gets its VSEPR shape by coordination number — η⁵ rings
  and the rest of ligand-field geometry are unknown to it, so such a complex
  can exhaust the time budget and show its unoptimised start. Seven electron
  domains (IF₇, XeF₆) start octahedral: there is no pentagonal bipyramid.
- GFN2-xTB makes SeF₄ and TeF₄ square pyramids (C4v minima, the centre at the
  apex) where VSEPR and experiment say seesaw — its selenium and tellurium
  parameters, not OCC: the Fortran xtb oracle finds the same minima (NOTES.md,
  2026-10-20). The structure is shown as GFN2 has it, and the Info log says
  where any computed centre leaves its VSEPR shape (`chem/vsepr/compare-shape.ts`:
  an angle more than 30° from the AXₘEₙ ideal; small-ring centres skipped),
  naming neither side right.
- GFN2-xTB bends NaOH where experiment and GFN1 have it linear; its bend
  potential is flat, and the Fortran xtb oracle finds the same bent minimum
  (`tests/gfn2.test.ts`; NOTES.md, 2026-10-20). An ionic contact has no
  preferred direction, and a semiempirical model tips it.
- The implicit-H filler covers the common ±1 charge states only.
- One molecule at a time: with an element chosen, a click on empty space
  beside a structure adds nothing, so a second, unconnected atom or molecule
  cannot be sketched. Deliberate scope — Valence teaches electron
  configuration and bonding within a molecule; intermolecular phenomena are
  out of scope (decided 2026-10-06; may be revisited, not soon).
- Aromatic bond order 4 from a pasted/imported molfile is not understood.
- GFN2-xTB is semiempirical, and labelled as such everywhere it appears. It is
  the geometry default because it is structurally right where MMFF94 is not
  (hypervalent centres, untabled elements), not because it is uniformly more
  accurate: it opens water's angle past experiment's, and for organics MMFF94
  is often the better number. Its parameter table, not the app, decides which
  elements it accepts. Its per-atom charges, whichever set is shown, are
  basis-dependent divisions of one density; its Mulliken (SCC) charges are a
  fraction of the BCI model's for organics and not comparable to them in
  magnitude. The ESP is the exact potential of GFN2's own charge distribution
  — a minimal valence basis, each nucleus and its core electrons one point
  charge — on its 0.001 au density surface (valence plus free-atom cores):
  exact within the model, and as good as the model's density. The full GFN2
  dipole overshoots water's experimental value, while its point charges alone
  undershoot it. GFN2's orbital energies are its own: the empty orbitals sit
  low (formaldehyde, `vendor/occ-wasm/README.md`), so its ladder is read for
  order and gaps; its vibrations are harmonic, a few per cent from
  experiment. The figures behind these claims are pinned against the oracle,
  each at a geometry it names, in `tests/gfn2.test.ts` ("the claims AGENTS.md
  makes of GFN2-xTB" and the water vibrations).
