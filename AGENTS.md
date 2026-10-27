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

**Descriptions have one home too.** What a module does, and how, is said in
its header comment; this file says where it is, and the rules it must keep.

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
- **Bun** 1.4 — package manager and script runner (`bun.lock`); Node.js is
  installed but the project is bun-managed
- **Vite** + **TypeScript**; **Three.js** (vanilla, no React) for the scene
- **Vitest** — the test runner (`bun run test`, not `bun test`)
- **JSME** — the molecule sketcher, in its own panel

## Pipeline
1. JSME → SMILES + MOL block; parse atoms and bonds (`src/mol-parser/`).
2. Kekulize the SMILES — monocyclic aromatic rings only.
3. PubChem PUG REST for an MMFF94 3D structure, accepted only if the guard
   passes (`validate-structure.ts`): the heavy-atom bond graph, each heavy
   atom's hydrogen count (drawn plus what the filler would add) and the net
   formal charge match the sketch, and the ion is one MMFF94's type space can
   represent (a carbanion is not; its conformer is an artifact). **A sketch
   containing a metal skips steps 3–4**: PubChem has no 3D for most metal
   compounds, and CIR builds them by rule, roughly (NOTES.md: H₃Si–Ni).
4. NIH CACTUS (CIR), with the same guard.
5. The local pipeline: implicit H's → the graph-walk embedder (`place3d.ts`)
   → **GFN2-xTB, the one local geometry engine**: OCC's, vendored as wasm, in
   a Web Worker preloaded at startup.
   - **The start**: every main-group centre in the AXₘEₙ shape the VSEPR
     picture names (lone pairs are electron domains); a metal by its
     neighbour count, a four-coordinate d⁸ singlet square planar.
   - **The optimiser** is OCC's Berny on the analytic gradient, held to a
     Cartesian gate (Gaussian's loose max force, 2.5e-3 Eh/bohr) and
     restarted from any stop that fails it; when Berny cannot finish,
     mmff94-ts's L-BFGS and bounded steepest descent take over through its
     `EnergyGradientFn` oracle. Never hand-roll a minimiser again (NOTES.md).
   - **Never silently a minimum**: a converged run below 16 atoms gets a
     Hessian verdict, and a saddle is pushed down its imaginary mode and
     re-optimised.
   - **A 30 s budget** for the whole run. A run that stops short shows the
     lowest structure it reached, labelled not fully converged — wherever it
     stopped, Berny included — and offers to keep optimising; a run that
     produces nothing shows the embedder's start, labelled unoptimised.
   - **Every start is the molecule drawn** by the guard's own rule — tested
     for every sketch and example (`tests/embedder.test.ts`).
   - **A single atom** (nothing the filler adds hydrogens to) is a point: no
     lookup, no optimiser, no refinement — only the single point every
     structure gets.
   - **Spin**: the lowest multiplicity the electron count allows (singlet if
     even, doublet if odd), unless the structure has its own (an example) or
     one is chosen under "Refine with GFN2-xTB". A run that is not a singlet
     says so, and why.
   - **A result must still be the molecule drawn** — its drawn bonds, some
     possibly partial, and no new ones (`bond-integrity.ts`; see Decisions).
   - **Every structure on screen**, wherever it came from, gets one background
     GFN2 single point in its principal-axis frame — charges, Wiberg orders,
     spin, the full dipole, the MOs — which the views read.
   - **MMFF94 is not a geometry engine** (NOTES.md: it inverts PCl₅'s axial
     and equatorial bonds); mmff94-ts stays as the optimiser's stepping and as
     a charge model. A *PubChem* structure is an MMFF94 conformer, so the
     parameter-gap and 3-ring pucker reports run on it — and only on it: CIR
     builds by rule, and an MMFF94 caveat there would blame the wrong thing.
6. Classify hybridization, lone pairs and π orbitals (`src/chem/`).
7. Render in Three.js (`src/render/`).

## Decisions
Made with the user; the reasons are in NOTES.md under the date.
- **Charges** (2026-10-12): the labels default to GFN2's **ESP-fitted**
  charges, fitted to the background single point; Mulliken stands in when the
  fit cannot be built. The Charge Model control offers ESP-fitted, Mulliken
  and CM5 — three divisions of one density; a set that cannot be built gives
  way to Mulliken, and the control says so — and MMFF94's BCI, used only when
  chosen or when GFN2 cannot give charges (under MMFF94, all three are BCI's).
- **The ESP and the dipole are the density's** (2026-10-09, 2026-10-12):
  under GFN2 the ESP is the exact potential on GFN2's 0.001 au density
  surface (valence plus free-atom cores) and the dipole is the full one, so
  only the labels change with the charge set. A hidden default, with no
  switch back; the hint under "Charges from" says why the labels need not add
  up to it.
- **GFN2's orbitals first** (2026-10-13): the Localized and Delocalized views
  use GFN2's MOs, each spin channel of an open shell on its own. Extended
  Hückel's are the fallback for localization and stay selectable beside
  GFN2's ladder, as the textbook model.
- **The Localized view** (2026-10-19): defaults to "Lewis structure" — the
  drawing as NBO-style orbitals and their E(2); closed shell, main group,
  two-centre bonds, anything else refused with the reason, and Pipek–Mezey
  stands in, the switch showing which method is on screen. The list's cues
  belong to the **anchor**, the first orbital
  drawn; removing it hands the anchor on.
- **Metals in the VSEPR picture** (2026-10-20, 2026-10-21): a drawn bond to an
  alkali metal is ionic — no electron domain, the metal's electron to the
  atom it touches (NaOH's O is hydroxide), and the Lewis structure takes it
  so. A ligand's bond to a transition metal stays a donor domain. A
  transition metal, lanthanide or alkali metal shows only its valence s
  orbital; the main group's metals and noble gases get the full picture.
- **Stretched, broken and formed bonds** (2026-10-23, 2026-10-24): a drawn
  bond past 1.3× its covalent radii sum is graded by GFN2's Wiberg order — at
  0.1 or more a partial bond, shown dashed. Below, it came apart; and an
  undrawn pair within bonding distance formed a bond — a 1,3 pair only when
  GFN2 gives it a single-bond Wiberg order (0.75 or more: a three-membered
  ring closing, not a bridge drawn as such). Either way GFN2's free
  result is set aside, and what is shown is the **held structure**: the
  molecule drawn, relaxed again with its bonds held at the guard's limits —
  after the free run, never inside it. The free result (its new contacts
  dashed) is behind a header button, and back. With no held structure, the
  start stands in.
- **Wedges say what leaves the plane** (2026-10-24): the embedder does not
  guess a torsion to reach a chemically preferred conformer. A plain bond
  starts where the embedder's own rules put it — anti about a single bond,
  which beside a trigonal centre is in that centre's plane — and a drawn
  wedge or hash is how the user says a substituent sits above or below.
  Stating what is in the plane and what is not is a teaching point in its
  own right: the 2-bromoethyl cation closes to the bromonium only with its
  Br wedged; on a plain bond it stays open, a minimum 20 kcal/mol higher.
- **Keep optimising** (2026-10-24): a free run that stops short offers it in
  the header — another run from the best structure reached, with a fresh
  budget, as often as the user likes; no unlimited mode.
- **The hover, per view** (2026-10-21): VSEPR the lobe's hybrid; Charge Model
  the ESP under the pointer; Localized the orbital's NBO hybrid on the atom
  and its E(2) with the anchor; Delocalized the MO, the lobe's atom by s/p/d
  share, and its phase.
- **The first view** (2026-10-19): longest extent across, broad face toward
  the reader, heavier end up and right; a symmetric top turned and tilted 25°
  so no atom hides.
- **Export** (2026-10-13): one format, SDF, carrying what Valence computed —
  the structure's source, GFN2's energy, spin, dipole, frontier orbitals,
  frequencies and thermochemistry, every charge set, the VSEPR assignment and the Wiberg orders,
  as data fields after `M  END` in RDKit's `atom.dprop.`/`atom.prop.`
  convention — for the download and the right-click copy alike; it waits for
  the single point. XYZ is the structure alone.
- **One molecule at a time** (2026-10-06): a second, unconnected molecule
  cannot be sketched; intermolecular phenomena are out of scope.

## Where things live
Each module's header comment says what it does and why; this list says where.
- `src/mol-parser/` — the MOL block parser, hand-rolled
- `src/chem/` — one folder per method, files named for its actions:
  - `vsepr/` — the Lewis-like picture: `hybridize.ts`,
    `ideal-vsepr-vectors.ts`, `orient-lone-pairs.ts`, `orient-pi.ts` (the
    conjugation gate), `assign-orbitals.ts` (what the renderer and the
    embedder read), `compare-shape.ts` (where a computed centre leaves its
    VSEPR shape)
  - `charge-model/` — the charges and what they feed: `bci-charges.ts`,
    `esp-fit.ts`, `cm5.ts`, `dipole.ts`, `esp.ts`, `core-density.ts` (and its
    generated table, `scripts/core-densities/`)
  - `extended-huckel/` — the EH solver: `parameters.ts`, `assign-basis.ts`,
    `align-principal-axes.ts`, `slater-overlap.ts`, `hamiltonian.ts`,
    `solve.ts`, `canonicalize-degenerate.ts`, `irrep-labels.ts`,
    `mo-surface.ts`
  - `gfn2-xtb/` — what one GFN2 calculation knows: `orbital-ladder.ts`,
    `normal-modes.ts`, `thermochemistry.ts`
  - `localized-orbitals/` — `localize-pm.ts`, `valence-virtuals.ts`,
    `mulliken-populations.ts`, `order-localized.ts`, `fock-couplings.ts`,
    `lewis-orbitals.ts`
  - root — shared tables and graph fixes: `radii.ts`, `assign-mass.ts`,
    `kekulize-smiles.ts`, `fill-hydrogens.ts`, `valence-electrons.ts`,
    `elements.ts`, `d-electron-count.ts`
- `src/geometry/` — the 3D pipeline (it consumes the VSEPR directions, so it
  sits above `chem/`): `resolve3d.ts` + `validate-structure.ts`, `place3d.ts`
  (the embedder), `embed.ts`, `local-geometry.ts`, `gfn2-refine.ts` +
  `.worker.ts` (the engine and the background single point),
  `mmff94-molecule.ts`, `parameter-warnings.ts`, `stereo-wedge.ts`,
  `bond-integrity.ts`, `ring-pucker.ts`, `symmetrize.ts`
- `src/render/` — the Three.js layer, files named for what they draw:
  `bonds.ts`, `lobes.ts`, `hybrid-orbitals.ts` (VSEPR), `mo-lobes.ts` (MOs),
  `pi-systems.ts`, `atom-styles.ts`, `labels.ts`, `label-colors.ts`,
  `chem-data.ts`, `vibration.ts`, `view-orientation.ts`, `axis-legend.ts`,
  `rebuild.ts`
- `src/ui/` — the sketcher (left), the scene, and the inspector (right, only
  the active view's controls); everything global in the settings drawer.
  `model-views.ts`, `controls.ts`, `jsme-panel.ts`, `sketcher-toolbar.ts`,
  `charged-x-atoms.ts`, `periodic-table.ts`, `functional-groups.ts`,
  `mo-diagram.ts`, `tooltip.ts`, `context-menu.ts`, `examples.ts`, the export
  (`sdf-data.ts`, `mo-data.ts`), `theme.ts` (the three looks)
- `src/utils/` — generic math, no chemistry: `vec3.ts`, `eigen.ts`,
  `march-tetrahedra.ts`
- `vendor/mmff94-ts-0.1.0-alpha.2.tgz` — the MMFF94 engine; Vite embeds it in
  the worker chunk, so after updating it rebuild/restart the app
- `vendor/occ-wasm/` — the GFN2-xTB engine (OCC 5644eaf, LGPL-3); its
  `README.md` is the build recipe, `occ-valence.patch` the complete source
  modification. Vite emits the wasm and data as hashed assets.

## JSME integration
- `jsme-editor` from npm: `index.html` loads `jsme.nocache.js` from
  `node_modules` and a Vite plugin copies JSME to `dist/jsme/`; the app uses
  the `window.JSME` global. It runs with `newlook,polarnitro` — every
  five-bonded N written N⁺–O⁻.
- **Our toolbar, JSME's engine** (`sketcher-toolbar.ts`): JSME's own menus are
  clipped out of view and never pressed while drawing — a simulated press
  left JSME deaf. The one exception: at startup its hidden **X** button is
  pressed once, out of sight, to borrow the "Nonstandard atom" text box.
- Charges JSME refuses go on its X atom (`charged-x-atoms.ts`).
- **A JSME upgrade must re-check** what was mapped against jsme-editor
  2024.04.29: the action codes and keys, the X box, the drag-drop press,
  Clean, the charge fallback, and `index.html`'s rewrite of JSME's negative
  `<rect>` widths. NOTES.md has the method; `bun run smoke` covers them.

## Conventions
- No cheminformatics libraries — MOL parsing is hand-rolled from JSME's output.
- Hybridization is an electron-domain count from the bond graph (σ bonds + lone
  pairs, shifted by formal charge) — never a measured angle, which is the output.
- Orbital lobes are surfaces of revolution → `THREE.LatheGeometry`.
- Unit-test chemistry logic as pure functions, independent of Three.js.
- Static deploy only (GitHub Pages / SDF.org) — no server-side code.
- The render pipeline is state-driven: change a toggle → rebuild → one
  frame, drawn on demand (`src/render/rebuild.ts`); a single facade in
  `src/render/` with separate modules for atoms, bonds and orbitals (MolView's
  pattern).
- **Frames are drawn on demand**, never every refresh (NOTES.md,
  2026-10-25): a rebuild, the trackball, a resize and any input event on the
  page each ask for one, and only auto-rotate and a playing vibration keep the
  loop running. Anything else that changes the scene must call
  `ctx.requestRender()`, or the picture goes stale.
- Atom meshes of the lit styles (Soft, Glossy, Showcase) live on layer 1 with
  their own light rig — any new raycaster must `layers.enable(ATOM_LAYER)` or
  atoms stop being pickable.
- Atom spheres are 0.3 × the van der Waals radius (Avogadro's ball-and-stick);
  space-filling uses the full vdW radii; bond radius is a separate knob. The
  stick representation draws atoms and bonds at one radius (0.16 Å × the bond
  knob), each bond half in its atom's colour.
- Every colour in the stylesheet is a theme token in `main.css`.
- **A drawn wedge or hash is honored — the sketch is the specification, and the
  refinement may not overrule it.** Drawn rings keep their stereochemistry.
- Never ship a silently wrong structure: a fetch that fails validation falls
  through to the local pipeline, never to a wrong "PubChem 3D" render.
- **Implicit hydrogens go on nonmetals and semimetals only** (H, B, C, N, O,
  F, Si, P, S, Cl, Ge, As, Se, Br, Sb, Te, I), to their usual valence. A metal
  or a noble gas carries only the hydrogens drawn: the user is responsible for
  charges, hydrogens and the rest of the 2D structure, and we give back what
  they give us. "More…" enters a metal or noble gas into JSME bracketed
  (`[Ni]`) so JSME's SMILES agrees.
- Export keeps one source of truth per field: the SDF carries formal charges
  on `M  CHG` lines and leaves the atom-block charge columns 0.

## Commits
Decided with the user 2026-10-26.
- **Commit each logical unit when it is done**, unasked. A unit says one
  thing, could be reverted on its own, and leaves `bun run test` and the
  typecheck passing; what counts as one is the agent's judgment, case by
  case. A fix and its test are one unit; its write-up in NOTES.md and
  AGENTS.md may be the `docs:` commit after it. Never commit a half-done
  change for the sake of committing.
- **Commit, never push**: a push, a pull request or a tag is the user's to
  ask for.
- The user's own uncommitted edits (ISSUES.md, often) go in only where they
  belong to the unit, and the message says so.
- Messages follow the history: `fix(scope):`, `feat(scope):`, `docs:`, and a
  body that says why.

## Environment
- **Bun** at `C:\Users\mccan\scoop\shims\bun.exe` (Scoop); `bunx` runs package
  binaries. **Node.js** at `C:\Users\mccan\scoop\apps\nodejs\current\node.exe`.
- **The oracles are on `lenovo`** (`ssh lenovo` on the LAN; off it, the
  Tailscale route in `AGENTS.local.md`, which is gitignored). A GFN2
  question — a geometry, a minimum, an energy, a frequency — is checked
  against the Fortran **xtb 6.7.1** there (`~/opt/xtb/bin/xtb --gfn 2 --chrg
  <q> --ohess vtight`) before the app's answer is blamed or trusted. Beside
  it: YAeHMOP `bind` (`~/yaehmop/tightbind/bind`, the extended-Hückel oracle),
  occpy 0.9.4 (`~/opt/occ-venv`), and a spare OCC tree (`~/Code/occ`).

## Commands
| Task | Command |
|------|---------|
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Preview the build | `bun run preview` |
| Test | `bun run test` |
| Test watch | `bun run test:watch` |
| Lint | `bun run lint` |
| Typecheck | `bunx tsc --noEmit` |
| Smoke test (the app, end to end) | `bun run smoke [url]` — needs `bun run dev`, or a URL (the live site) |

## Known limitations
Deliberate; the evidence is in NOTES.md or the test named.
- Kekulization covers monocyclic aromatics only; anything else relies on the
  fetch guard.
- Lone-pair inequivalence at bent AX₂E₂ centres is a didactic choice.
- The MMFF94 charge model, when chosen, runs on generic parameters for
  hypervalent centres (PCl₅, SF₆) and the dipole readout says so; a fetched
  MMFF94 conformer of such a centre is warned about the same way.
- A fetched MMFF94 conformer can pucker a trigonal 3-ring centre's substituent
  well out of the ring plane (`tests/ring-pucker.test.ts`): reported, never
  repaired.
- The Hessian verdict and the saddle escape run below 16 atoms only; above,
  a converged structure is a stationary point, not a verified minimum.
- Berny is held to the loose gate, so a soft torsion can stop a fraction of a
  kcal/mol above its minimum (NOTES.md, 2026-10-23).
- The engine is pinned at an untagged OCC commit (5644eaf, unreleased 0.9.6);
  move to the `v0.9.6` tag when it exists.
- The embedder knows little of metal bonding beyond d⁸ square planar: η⁵
  rings and ligand-field geometry are unknown to it, so such a complex can
  exhaust the budget and show its start. Seven electron domains (IF₇, XeF₆)
  start octahedral.
- GFN2-xTB makes SeF₄ and TeF₄ square pyramids where VSEPR and experiment say
  seesaw — its parameters; the oracle agrees (NOTES.md, 2026-10-20). The Info
  log says where any computed centre leaves its VSEPR shape (an angle more
  than 30° from the AXₘEₙ ideal; small-ring centres skipped), naming neither
  side right.
- GFN2-xTB bends NaOH where experiment and GFN1 have it linear: an ionic
  contact's bend is flat, and a semiempirical model tips it; the oracle
  agrees (`tests/gfn2.test.ts`).
- The implicit-H filler covers the common ±1 charge states only.
- Aromatic bond order 4 from a pasted or imported molfile is not understood.
- GFN2-xTB is semiempirical, and labelled as such everywhere it appears. It is
  the geometry default because it is structurally right where MMFF94 is not
  (hypervalent centres, untabled elements), not because it is uniformly more
  accurate: it opens water's angle past experiment's, and for organics MMFF94
  is often the better number. Its parameter table, not the app, decides which
  elements it accepts. Its charges, whichever set, are basis-dependent
  divisions of one density, and its Mulliken charges are a fraction of the
  BCI model's for organics. The ESP is exact within the model — as good as
  GFN2's minimal-basis density. The full dipole overshoots water's
  experimental value while the point charges alone undershoot it. Its empty
  orbitals sit low, so its ladder is read for order and gaps; its vibrations
  are harmonic, a few per cent from experiment. (The figures: `tests/gfn2.test.ts`,
  "the claims AGENTS.md makes of GFN2-xTB" and the water vibrations; the
  formaldehyde orbitals in `vendor/occ-wasm/README.md`.)
