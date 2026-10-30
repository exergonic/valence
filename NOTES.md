# NOTES.md — working notes

Case histories, measurements, and gotchas. `AGENTS.md` is the constitution — the
rules. This file is everything that explains *why* a rule exists. Add to it and
correct it freely; it needs no approval.

## The saddle verdict reads the vibrations; methyl rotors (2026-10-20)

**Found:** acetaldehyde from a sketch listed "ν1 · 166i cm⁻¹". The embedder
sets single bonds anti, so the methyl starts with a C–H anti to O — the
staggered conformer, a saddle — and Berny keeps the mirror plane. The verdict
read the lowest eigenvalue of the RAW Hessian against −0.02 Eh/bohr² (a margin
left for rotational noise, ±0.003 measured 2026-10-02); the torsion's raw
eigenvalue is −0.0018, so no escape ran and the vibrations were shown. Not
numerical: 166.1i/166.1i/166.3i/167.2i at steps 0.0025/0.005/0.01/0.02 bohr,
and a rigid 60° methyl turn is 0.69 kcal/mol down. Not the snap (the
vibrations come from the unsnapped geometry; it moved nothing). Same miss:
propene 171i, acetone 100i, acetic acid 49i, ZnCl₂ 36i. Every other example,
and ethane/methanol/methylamine/ethanol, had no imaginary mode.

**Fix:** the verdict is the lowest frequency after mass weighting and
projection of the rigid motions (`SADDLE_FREQUENCY_THRESHOLD`, −20 cm⁻¹), the
escape pushes along that normal mode, `Gfn2Result.lowestFrequency` is cm⁻¹ and
the Info log prints "166i cm⁻¹". At converged minima the projected spectrum has
no negative mode at all (raw rigid eigenvalues 1e-5 to 1e-10 now). Acetaldehyde
escapes once to the eclipsed minimum: 1.00 kcal/mol down (experiment 1.16),
torsion 145 cm⁻¹ (experiment ~150). Propene 159–161, acetone 79/105 (experiment
~77/105).

**Methyl rotors and the push.** A nearly free rotor's torque is below Berny's
force gate (4.5e-4) a few degrees off the saddle, so Berny stops on the slope.
Acetic acid at a 0.30 bohr push: two escapes, ~12° each, still 54i. At 0.60:
6i (called flat); at 1.0: 10i. The fully eclipsed form, optimised directly, is
only 0.065 kcal/mol lower and itself reads 9.7i — GFN2's acetic-acid methyl is
nearly free. Push raised to 0.60 bohr with the user: methyl rotors are a plague
to every optimiser, good enough is the bar (some codes treat them as free
rotors in the thermochemistry instead of vibrations).

**ZnCl₂ bends under GFN2 — the oracle agrees.** With the verdict fixed the
example escapes linear and comes back at 134°, ν 47/256/302, −9.703567 Eh.
Fortran xtb 6.7.1 on lenovo: `--ohess vtight` from 134° gives −9.703570 Eh,
133°, 48.5/257.3/303.0; linear (`--opt vtight`) −9.702428, 0.72 kcal/mol higher.
Its bend scan at r 2.1438 Å falls quadratically from linear (178° −0.004, 175°
−0.025, 170° −0.098 mEh; lowest at 134°, −1.037), matching OCC's (170° −0.097).
xtb's `--hess` at linear reports the bend at +2.46 cm⁻¹ — an artefact of its
linear-molecule Hessian, against its own scan; OCC's 36i is right. (xtb
`--ohess` from a 170° start ended in a fatal error, unexplored.) Experiment:
gas-phase ZnCl₂ is linear, so the bend is a GFN2 model error, now shown
honestly.

**The example stays linear** (decided with the user): what students and
everyone else expect, and what experiment finds. An example is displayed at its
own coordinates (no optimisation), so nothing changed on load; its note says the
shape shown is the experimental one and that "Refine with GFN2-xTB" will bend
it. The coordinates are avo_ibo's GFN1-xTB linear structure, 2.070 Å. An
electron-diffraction r_g of 2.072(4) Å turned up in a search but its source
could not be opened; Wikipedia gives 205 pm. Unverified, so the note claims the
shape only, and links Donald, Hargittai & Hoffmann, Chem. Eur. J. 2009, 15,
158 (doi 10.1002/chem.200801035), whose monomers are all linear.

## The localized list prints its energies (2026-10-14)

Reverses the 2026-09-30 "no energies printed" rule, with the user, now that the
list is GFN2's: each row ends in ⟨φ|F|φ⟩ in kcal/mol, written as the
Delocalized ladder writes an MO's energy, and the readout carries it too. It is
what avo_ibo prints as an IBO's energy, and the ORDER already was this number.
Measured first (a scratch script through the app's own code, deleted after):

- formaldehyde (avo_ibo's ORCA geometry): GFN2 σ(CO) −18.80, LP-s −16.94,
  σ(CH) ×2 −15.26, π −15.14, LP(p) −13.23; π* −7.93, σ*(CH) ×2 +4.16, σ*(CO)
  +15.07 eV — orbital for orbital avo_ibo's ωB97X-D/def2-TZVP order. The π is
  the canonical b₁ exactly; the p lone pair is 1.7 eV below the canonical HOMO
  (b₂), which mixes it with the C–H bonds (⟨n|F|σCH⟩ = 1.51 eV).
- the localized Fock block's eigenvalues are the canonical energies, every
  molecule (water, ethene, formaldehyde, PCl₅, SF₆) — so the occupied energies
  sum to the canonical sum (water −1386.7 kcal/mol both views, in the app).
- the occupied–virtual block of F is zero by construction (both blocks are
  rotations of canonical sets): coupling between localized orbitals exists only
  within a section. Donor–acceptor (n→σ*) is not a Fock coupling here; it is
  already in the occupied orbital's tail.
- largest within-section couplings: water σ/LP-s 1.57, σ/σ 0.68; formaldehyde
  σCO/LP-s 1.86, σCH/LP(p) 1.51, σCH/σCH 1.05; ethene σCC/σCH 0.92; PCl₅ and SF₆
  LP/σ on the same halogen 3–4.6 eV.

The note now says what the number is (the expectation, the weighted average of
the delocalized energies it holds) and is not (an ionization energy).

**Then, same day, two cues (separate commits so either can be dropped):**

- **The degeneracy rail** (both lists): orbitals within DEGENERATE_TOLERANCE_EV
  (5 meV ≈ avo_ibo's 2×10⁻⁴ Ha) share a 2 px rail in a 12 px gutter every row
  keeps. Localized: the rail is a button that draws / hides the whole set.
  Delocalized: a mark only (that view draws one MO).
- **The coupling tick** (localized): rows coupled to the latest pick by
  |⟨φᵢ|F|φⱼ⟩| ≥ 0.1 eV get an accent tick at the right edge, opacity 0.35–1 by
  strength; the number is the tooltip, and the readout's once two are drawn.
  Measured in the app: water σ(OH) ticks LP-s 36.1 and σ(OH) 15.8, not LP(p)
  (b₁) or σ*; benzene C–H ticks its ring σ (21, 12) and the other C–H (7, 3);
  a benzene π ticks exactly the other two π (15). Two placements were tried
  and dropped: a number on the row ("↔36") truncated the longest labels in a
  ~220 px row (it fits only if "kcal/mol" moves to the section header, in both
  lists — the user's call), and a tick on the LEFT edge read as a second rail.
- Vite on Windows missed an edit twice here (the page kept a stale
  `rebuild.ts?t=…` with a call but not its import): `touch` the file and
  navigate, not reload.

## Drag and drop from the toolbar: the feasibility probe (2026-10-14)

Asked for by the user after watching a student drag an element button onto
the sketch. The probe was injected into the dev page, not committed: on a real
press on a toolbar button, `button.click()` (the existing selection); on the
real release over `#jsme-stage`, a **synthetic mousedown on the release's
target at the release point**, dispatched from a document-capture `mouseup`
listener so it runs before the toolbar's own stage listeners (that order lets
`swallowRelease` keep the real release from JSME on an element-on-atom drop).
Real pointer input (automation drags), 1280×800, jsme-editor 2024.04.29.

What JSME sees during a drag that starts on our button: the real `mousemove`s
over the drawing (no implicit capture for a mouse, so its blue hover box
tracks the pointer) and the real `mouseup`, but no press — so a drop with no
help draws nothing. `click` fires on `#jsme-panel` (the common ancestor), not
on our toolbars. With the synthetic press:

| Drop | Result |
|---|---|
| C on an empty sketch | `C` |
| single bond on CH₄ | `CC` |
| Cl on an ethane carbon | `CCl` — the element *replaces* the atom, as a click does |
| first ordinary click afterwards (single bond on a carbon) | `CCCl` — **no deafness** |
| O, then a single bond, on empty space beside a structure | nothing (the one-molecule scope holds) |
| double bond on a C–C bond | `C=CCl` |
| benzene on an empty sketch, single bond on a vertex, N on another | `c1ccccc1` → `Cc1ccccc1` → `Cc1ccncc1` |
| N on a fresh page's empty sketch, far off centre | `N`, drawn at the centre (the 2026-10-06 quirk; the existing conversion handles it) |
| Si (from "More…", the X box) on NH₃ | `[SiH4]` |
| charge on a carbon | `[CH3-]` |

So the synthetic press that made JSME deaf on its *menus* (2026-10-05) is
harmless on its *drawing*. One failure, not the drag's: the charge tool does
nothing on an X-box atom (Si) — an ordinary click fails the same way.

Untested: touch (a touch's moves are captured by the button it began on, so
JSME would get no hover), and a hand's many-step drag (the automation gives two
moves; more moves can only help the hover).

**Built, mouse only** (`setupDragFromToolbar` in sketcher-toolbar.ts; touch
waits until there is a tablet to test on — the user, same day). A press on an
element or a drawing tool becomes a drag after 5 px; undo, redo, clear and
"More…" stay click-only. The drag chooses the tool at once (so a drag and
clicks mix), and a copy of the button follows the pointer, offset below-right
so it never hides JSME's hover box. The copy is dim until a release there would
draw something: JSME's hover box is on the drawing (read a frame after the
move, once JSME has moved it), or the sketch was empty and the tool draws on an
empty sketch — measured by click: elements, the three bonds and the chain
(ethane), the rings; erase, stereo and charge draw nothing there. Only such a
drop gets the synthetic press; any other release glides the copy back to its
button and is kept from JSME, as are Esc and a release outside the window (the
next move arrives with no button held). After a drop, `click` fires on
`#jsme-panel` (the common ancestor), so the toolbar never sees a stray click.
Verified with real drags: the user's C → ethane → methyl chloride, a drop
beside the molecule and one over the toolbar (nothing drawn), Esc, a plain
click straight after, N on a fresh page, Xe from "More…"; the smoke test
repeats the first four.

## A review for drift: stale comments, copies, dead ends (2026-10-13)

A pass with the scientist-coder eye over the whole of `src/`, after the move
from extended Hückel and MMFF94 to GFN2-xTB left comments describing the old
app. What it found, beyond the comments themselves:

- **Two real bugs.** The measuring tool's dihedral had the wrong sign: it used
  `atan2(m₁·n₂, n₁·n₂)` with `m₁ = n₁ × b̂₂`, which is −IUPAC. Looking down
  b→c with a at +x and d at +y, a clockwise quarter turn read −90°. It now
  shares the embedder's `dihedralAngle` (utils/vec3.ts), pinned by
  tests/vec3.test.ts. And a saved view or share link dropped the formal
  charges, the drawn wedges and the spin, so a link to [NiCl₄]²⁻ (triplet)
  reloaded as neutral singlet NiCl₄. Every calculation then ran on the wrong
  electron count. The view also saved `display.autoRotate`, a field nothing
  ever wrote, so auto-rotate always saved as off. Verified in the browser:
  the link now round-trips the charges, the spin (the β row shows) and
  auto-rotate.
- **Copies consolidated.** Vector helpers were written out again in five
  files and now come from vec3.ts. The other copies: the embedder's
  `alignVectors` (it was vec3's `rotateToward`), the worker's grid builder (2×)
  and engine-Molecule construction (4×), and the five request functions in
  gfn2-refine.ts, which are now one `ask`. The camera framing (buildScene and
  Reset view) is now `frameCamera`. The examples' header code, with its own
  formula builder, now goes through jsme-panel's `showMoleculeHeader`, so an
  example shows its MW like every other structure. Also: the spin names (2×),
  the centre-of-mass sum in dipole.ts (2×), the saddle threshold (worker and
  gfn2-refine.ts, now normal-modes.ts) and the localized-list build (one path
  for GFN2 and EH).
- **Dead ends removed.**
  - The worker computed every orbital's Mulliken atom shares on every single
    point, but only a test read them; the ladder computes its own from the
    canonicalized coefficients.
  - `computeDipole` and `computeMoSurface` had no caller but the tests, and
    their test copies now live in the tests.
  - The Force-local checkbox had a no-op listener.
  - A second `syncChargeModelControl` call per redraw did nothing.
  - Fifteen functions were exported but used only in their own file.
  - The render barrel re-exported sixteen names nobody imported through it.
- **Engine memory.** The optimiser never `.delete()`d the Mat3N it built for
  each evaluation, nor the gradient it got back. A hostile start makes
  thousands of calls in a long-lived worker. They are freed now (`evaluate` in
  the worker), and so are Berny's per-step geometry and positions.

Left as they were: the worker's `typeof calc.x === 'function'` guards for
bindings the vendored build always has. They cover a rebuilt engine and cost
nothing.

## Exports: the SDF carries the data; MO data is GFN2's (2026-10-13)

Decided with the user: one common format (SDF), no CJSON or Molden until
there is demand — Valence is a teaching tool and most of its data stays in
it. Both SDF exports (Export button, right-click copy) carry data fields;
XYZ stays structure-only for whoever wants just that.

Fields (sdf-data.ts; units in the names): VALENCE_NAME, _STRUCTURE_SOURCE,
PUBCHEM_COMPOUND_CID (PubChem's own tag), VALENCE_WARNINGS, TOTAL_CHARGE;
GFN2_SPIN_MULTIPLICITY, _TOTAL_ENERGY_HARTREE (the single point's — added to
Gfn2Properties for this), _DIPOLE_DEBYE (full density), HOMO/LUMO/gap per
spin channel, _HARMONIC_FREQUENCIES_PER_CM (when vibrations exist); per atom
`atom.dprop.GFN2_{ESP_FITTED,MULLIKEN,CM5,HIRSHFELD}_CHARGE`,
`MMFF94_BCI_CHARGE`, `GFN2_SPIN_POPULATION` (open shell),
`atom.prop.VSEPR_HYBRIDIZATION` (ASCII sp3), `atom.iprop.VSEPR_LONE_PAIRS`
(`n/a` for a metal the picture does not describe — RDKit's missing-value
marker); GFN2_WIBERG_BOND_ORDERS_IN_BOND_BLOCK_ORDER (no per-bond
convention exists).

The name, source, CID and warnings are read from the header's DOM at export
time: four paths write the header (build, example, refine, loaded view), and
it is the one place that is always current. The export awaits the GFN2 run
(`gfn2PropertiesRequest.done`, added) and the charge sets (all three come
from one worker call). The right-click copy hands the clipboard a promise
(ClipboardItem), as the PNG does, so the click still owns the write.

Not exported: the orbitals themselves (the MO data printout has them), the
localized-orbital list (built only when that view opens), the mode vectors,
the ESP surface.

The right-click MO data printout is GFN2's (both spin channels for an open
shell); extended Hückel's only when GFN2 has none; disabled while the single
point runs.

## Localized orbitals from GFN2-xTB (2026-10-13)

The Localized view localized extended Hückel's MOs; GFN2's single point,
which every structure on screen already gets, now supplies them, and extended
Hückel stands in only when GFN2 has none (failed run, no orbital bindings).

What localization needs and GFN2 already sent: coefficients, overlap, a basis
description (atom, s/p/d, axis), occupations. The one missing piece, a
Hamiltonian (⟨φ|H|φ⟩ orders the list; H resolves the pairs PM is flat on), is
rebuilt as F = S C ε Cᵀ S — exact for the operator the orbitals diagonalize
(pinned: Cᵀ F C = ε to 1e-6 on water). `OrbitalSpace` is the seam;
`extendedHuckelSpace` and `gfn2OrbitalSpace` are its two users.

The avo_ibo gates were not re-tuned. Side by side on every example plus SI₂ and
P₄, GFN2 and EH give the same occupied labels, with two differences, both
GFN2's way: [Ni(CN)₄]²⁻'s four Ni–C bonds are σ (EH: δ), and triplet
[NiCl₄]²⁻'s α channel localizes (4 σ, the Cl lone pairs, five Ni d pairs; EH
refuses — no spin). Its β channel is refused: the Jahn–Teller frontier is
fractionally filled by GFN2's Fermi smearing. The virtual block is rougher
under GFN2 (SF₆'s and ZnCl₂'s empties include d-rich "virt"/anti* oddities),
as it was under EH. "Polarization d" became "a d on a non-d-block element",
which matches the old EH rule (same-n 3d on Si–Cl) and covers GFN2's d on
Br, I and the rest.

Cost: PM runs on the main thread when the Localized view first asks (cached
per ladder): PCl₅ 1.3 s, benzene 0.19 s, P₄ 0.2 s; most under 0.1 s. EH's
localization used to run in buildScene for every molecule, whatever the view
(PCl₅ 1.6 s), so the net is a saving. N₂ orders differently (GFN2 σ, π, π,
LP, LP by ⟨F⟩; EH σ, LP, LP, π, π): the model's call, not a bug.

The panel: `localizedOnScreen` (rebuild.ts) returns the list, 'pending', or
null; `ctx.onGfn2Orbitals` redraws the panel when the single point lands and
picks the HOMO if nothing was drawn. GFN2 localized surfaces are drawn by the
worker (`localized:<spin>:<index>` names its cached field), smooth only. The
context menu's MO data export is still extended Hückel's.

## The builder counts lone pairs (2026-10-13)

place3d chose each centre's directions from its neighbour count alone, so a
lone pair took no space: water and every ether/alcohol O started linear
(the 2026-10-01 linear-water trap was this), NH₃ and every amine N flat, and
the expanded octets wrong. Measured from flat sketches through the real
pipeline (builder → GFN2), before the change:

| centre | builder start | GFN2 result |
|---|---|---|
| SF₄ AX₄E | tetrahedral | seesaw, 0.7 s |
| BrF₅ AX₅E | trigonal bipyramid | square pyramid, 3.6 s |
| XeF₄ AX₄E₂ | tetrahedral | square planar, 5.1 s |
| ClF₃ AX₃E₂ | trigonal planar | **stayed planar**: E −18.54829, lowest Hessian eigenvalue −5.8e-6 (not flagged) |
| ICl₄⁻ AX₄E₂ | tetrahedral | **distorted** [74 85 86 86 86 169]°, E −22.27634 |

From the VSEPR start: ClF₃ T-shaped (84, 84, 167°), E −18.57276 — 15
kcal/mol lower — in 0.2 s; ICl₄⁻ square planar, E −22.30390 — 17 kcal/mol
lower — in 0.5 s.

The fix: `electronDomainCounts` (assign-orbitals.ts) gives each atom the
domain count the orbital picture makes, from the graph alone, and
`vseprBondVectors(domains, bonds)` takes the first m vertices of the full
shape. The vertex lists were already in the right order — the trigonal
bipyramid's axial pair first (lone pairs equatorial), the octahedron's ±z
last (lone pairs trans) — so no per-shape table was needed. A lone pair
beside a π system counts as the p orbital it becomes (amide N, ester O start
trigonal; an ester O used to start linear), without the picture's geometric
veto, which needs coordinates. Metals (domain count 0) keep the
neighbour-count shape and the d⁸ square-planar rule.

Planar ClF₃ passing the Hessian check — investigated 2026-10-13: the check is
right. D₃h ClF₃ is a genuine, shallow LOCAL MINIMUM of GFN2 itself:
- OCC's Hessian and an energy-only finite-difference Hessian (no gradient
  involved, so the known analytic-gradient error is ruled out) agree: six
  rigid-body zeros, then all positive — the degenerate e′ bend +2.1e-3
  Eh/bohr². The −5.8e-6 "lowest" was a rigid-body zero; the verdict does not
  project those out, which is fine for a sign test at −0.02.
- The Fortran xtb oracle (`xtb --gfn 2 --hess`) on the same geometry: the
  same energy (−18.548286 Eh) and gap (2.575 eV), 0 imaginary frequencies,
  the e′ pair at 52 cm⁻¹, symmetry d3h. A model property, not an OCC bug.
- Rigid scan toward the T-shape (F2, F3 swung together): +0.06 kcal/mol at
  5°, +0.16 at 10°, −0.03 at 15°, −9.1 at 36° (bond lengths frozen; −15
  relaxed). A dimple ~0.2 kcal/mol deep.
- Electronically: integer occupations, zero electronic entropy (no Fermi-
  smearing artifact); the LUMO is a degenerate e′ pair that splits on the
  bend (−11.38 → −12.24 eV at 15°) — the second-order (pseudo-)Jahn–Teller
  path to the T-shape, which in GFN2 only wins past ~12°.
So no saddle escape can fire (no negative mode). What the Hessian verdict
cannot say — "a minimum, but not the lowest" — is inherent to local
optimisation; the cure is the right start, which the builder now gives.
Seven domains (IF₇, XeF₆) still start octahedral, on purpose (place3d.ts).

## The element tables reach H–Rn (2026-10-12)

"More…" places any of GFN2's 86 elements, but mass, van der Waals radius,
covalent radius and colour covered 26. A missing mass counted as 0: the
molecular weight left a Ni or Xe out (XeF₄ would have read 75.99, not
207.29), the centre of mass ignored it (an ion's dipole origin, the
principal-axis frame), and normal-modes.ts refused the molecule, so its
vibrations quietly never appeared. Missing radii fell back to 1.50/1.40 Å.

Sources, taken as data files and parsed (no third-party code run):
- masses: IUPAC 2016 conventional weights, from ASE's `ase/data/__init__.py`
  (`atomic_masses_iupac2016`; Tc, Pm, Po, At, Rn their longest-lived
  isotope). Only S (32.065 → 32.06) and Cl (35.453 → 35.45) moved.
- covalent radii: Cordero 2008, ASE's `covalent_radii` (low-spin Mn/Fe/Co) —
  every one of the 26 old values matched. The duplicate table in
  render/chem-data.ts (lobe sizes; B 0.85 against 0.84) is gone: one table.
  Ni now starts a Ni–Cl bond at 2.26 Å (real ~2.27) instead of 2.42.
- van der Waals radii: the 26 old values kept (nothing on screen shifts);
  the other 60 from PubChem's periodic table (`/rest/pug/periodictable/JSON`,
  AtomicRadius), which is Bondi–Mantina for the main group — it matched the
  app on 20 of 26. ASE's Alvarez 2013 set was rejected: systematically larger
  (C 1.77, Al 2.25), it would have broken the periodic trend against the
  kept values, and it has no Pm, Po, At, Rn.
- colours: the 24 old values kept (Jmol's, bar the app's own Li, He, Zn);
  the rest Jmol's, from ASE's `colors.py` (PubChem lacks Er).

A test holds all four tables complete for H–Rn, with spot checks.

Also: a 30 s suite-wide test timeout (vite.config.ts `test.testTimeout`),
replacing the mo-surface override — P₄'s localization (0.37 s alone) timed
out at 5 s in a full run beside the dev server, the second test to do so.

## JSME's negative-width icons, and a smoke check for a clean console (2026-10-12)

Dozens of `Error: <rect> attribute width: A negative value is not valid.`
per load buried real errors. Traced with a temporary hook installed before
JSME loads: JSME's constructor sets `innerHTML` to its menu buttons' SVG, and
in a sketcher under ~300 px (279 px measured; 532 px is clean) some icon
frames get negative widths (`x="10500" width="-2940"`). The browser itself
logs these while parsing, so no `console.error` override can hide them;
`index.html` now wraps the `innerHTML` setter, before JSME is built, to write
a `<rect>`'s negative width or height as 0 — a negative size draws nothing,
nor does 0. Other `innerHTML` passes untouched (one `includes('="-')` test).
The smoke harness now listens to the DevTools `Log` domain too (failed
requests aside — a fetch that falls through is expected), and a new first
check loads an 800 × 870 window and fails on any console error. Verified both
ways: without the fix it fails with the rect errors, with it 30/30.

## Smoother hybrid lobes, built once per kind (2026-10-12)

The user found the VSEPR lobes faceted beside the new density surfaces. Two
causes: the teardrop outline was 8 hand-placed points joined by straight lines
(ridges, and a small cone at the tip), and it was spun at 24 steps. Measured
(LatheGeometry, Bun): 8 × 24 builds in 96 µs per lobe, a smoothed 32 × 48 in
106 µs, 48 × 64 in 168 µs, 64 × 96 in 399 µs; the fixed cost of a geometry
dominates. First try, a Catmull–Rom curve through the same 8 points: the
user saw "nipples" on every tip — the old 7th point (0.35R at 0.93L) sits
inside the convex outline, so a smooth curve that meets the axis square-on
must bend in and out to pass through it. Now the outline is analytic and
convex by construction, r(s) = R·(3√3/2)·s·√(1−s): widest at 2/3 of the
length (was 0.6), a parabolic cap at the tip, a point at the nucleus where a
p's lobes meet; 32 points crowded toward the tip (s = 1 − (1−u)²), 48 steps
around. A test holds the outline convex. Each kind (σ, π, lone
pair) is built once at unit size and shared, a lobe's size is its mesh's
scale, and `clearGroup` skips geometries marked `shared` — so a rebuild now
builds no lobe geometry at all. The s sphere (H's 1s, a metal's valence s) is
a shared unit sphere at 48 × 32 the same way.

## ESP-fitted charges become the default (2026-10-12)

The user: "since they match the ESP most closely." The default `chargeModel`
is `gfn2-esp`, first in the control; a saved view without a choice gets it,
one that chose Mulliken keeps Mulliken. The labels wait while the fit is
built (a second worker request after the single point, 0.1–0.2 s at these
sizes) rather than flash Mulliken's numbers first; Mulliken stands in only
when the fit cannot be built. MMFF94 chosen but untypeable now falls to
ESP-fitted, not Mulliken. The trade-off, said at the time: a buried atom's
fitted charge is poorly determined (ethoxide's O-bound carbon +0.47, the
chloro anion's +0.23), so an inductive-effect lesson reads better off CM5 or
the oxygen.

## ESP-fitted and CM5 charges beside Mulliken (2026-10-12)

The question came from a lesson: 2-chloroethanolate against ethoxide, the
inductive effect, and the label on the carbon next to O read +0.18 in both.
That was not a fault of Mulliken: on PubChem's conformers that carbon moves
0.004 (0.181 → 0.177), and the user's own IAO charges (Psi4 ωB97X-D/def2-TZVP
on avo_xtb geometries) move it the other way too (+0.168 → +0.154) — its
hydrogens carry the change, and the oxygen shows it (−0.80 → −0.76). The user
asked for the alternatives anyway, as teaching: same density, other divisions.

- **ESP-fitted** (`esp-fit.ts`): Merz–Kollman shells at 1.4/1.6/1.8/2.0 × the
  MK radii (vdW for elements MK never tabled), 5 points/Å², least squares to
  the exact potential with Σq held to the net charge by a Lagrange multiplier.
  Water −0.81/+0.41, and its dipole 2.29 D against the full 2.28 D. The buried
  carbons swing: ethoxide's O-bound carbon +0.47, chloro's +0.23.
- **Hirshfeld → CM5** (`cm5.ts`): GFN2 free atoms, neutral at their lowest
  multiplicity, spherically averaged (62 directions, 0.01-bohr radial table);
  q_A = ∫ w_A (ρ_pro − ρ) on an atom-centred grid (70 Mura–Knowles radial ×
  302 golden-spiral angular), so the two halves' quadrature errors cancel. The
  residual against the net charge is ≤ 1e-3 e and shared out. Water Hirshfeld
  O −0.35 (DFT about −0.33), CM5 −0.69 (DFT about −0.66). The CM5 table is
  copied from xtb's `src/solv/cm5.f90` (Marenich et al. 2012); the correction
  matches the oracle's GFN1 CM5 − Mulliken for 2-chloroethanolate to 1e-4.
- **The inductive pair under CM5**: the O-bound carbon +0.133 → +0.144, the
  oxygen −0.896 → −0.850 — CM5 shows the pull on the carbon itself, where
  Mulliken and IAO put it on the hydrogens.
- Cost: 0.1–0.2 s for these sizes, built only when chosen. Only the labels
  change; the ESP and the dipole stay the density's.

## The full-density ESP becomes a hidden default (2026-10-09)

The user: "It is proper, correct to the model and beautiful" — so no toggle.
"Full electron density (not just point charges)" is gone; under GFN2 the ESP
is always the exact potential on the 0.001 au density surface and the dipole
the full one, whenever the engine can give them. The point-charge surface
(and its shared-scale colouring) went with the toggle. The hint under
"Charges from" keeps the lesson in words: the labels print point charges,
which cannot hold what the surface and the dipole show. The point-charge
dipole now appears only when the engine could not give the full one, and its
hover says so.

## The ESP from GFN2's density: its 0.001 au surface, its exact potential (2026-10-09)

Asked by the user ("do both"), after the multipole ESP: draw the surface
where GFN2's density ends, and take the potential from the density itself.

- **Two bindings, both already in OCC**: `densityValues` (ρ = Σ P_μν φ_μ φ_ν
  through `gto::evaluate_basis`) and `electrostaticPotential` — each atom's
  nucleus-plus-core at Z_A = q_A + its Mulliken population (exact by
  definition, so no GFN2 core count is assumed) less the valence density
  through the engine's `electric_potential_mmd`. The density-matrix
  convention was the one open question: OCC's own comment says its
  MolecularOrbitals holds one spin channel, so the spin-summed P goes in as a
  closed shell of P/2 — and the long-range check confirmed it.
- **Checks**: ∫ρ = 7.999 (water), 30.000 (pyridine, benzene). The exact
  potential equals the charges + dipoles + quadrupoles at 8 and 15 Å (a test
  holds water to 4 decimals), and parts from them close in — pyridine 2.5 Å
  past the N: −108 exact, −159 multipoles; along another axis the multipoles
  even have the sign wrong. That is charge penetration, the reason for the
  change. Cost: +152 KiB gzip (the potential integrals; the engine is now
  980 KiB), 20 000 points in 35 ms (water) to 0.6 s (benzene); the surface's
  vertices are deduplicated first, so each point is integrated once.
- **The surface**: the worker samples ρ on a grid (pad 4 Å, step ≤ 0.25 Å),
  marches the 0.001 e/bohr³ contour (a density has one sign, so one sheet),
  takes normals from the density's gradient by central differences, winds
  the triangles along them (the helper the orbital surfaces use, now shared),
  and turns everything back from the principal-axis frame.
- **The toggle** became "Full electron density (not just point charges)":
  off, the SAME density surface coloured by the point charges, on the exact
  surface's colour scale; the dipole the charges' own. MMFF94 keeps the
  fused van der Waals surface and the BCI charges. Nothing is drawn while the
  worker builds the surface (well under a second at these sizes).
- The multipole ESP path is gone from the renderer; `espPotentialAt` keeps
  the dipole and quadrupole terms as GFN2's own electrostatic model, which
  the test holds the exact potential to at long range.

## The atomic quadrupoles join the ESP (2026-10-09)

- **Binding**: CAMM `qp` was computed every SCC cycle and dropped, like the
  dipoles; now `atomicQuadrupoles` (6 × N, e·bohr², +59 bytes gzip).
- **Convention, pinned against the oracle, not assumed**: xtb prints its
  molecular quadrupole about the coordinate origin in Buckingham's
  ½(3xᵢxⱼ − r²δᵢⱼ), order [xx xy yy xz yz zz]. The charges' term alone
  reproduces its "q only" line to 0.004; adding the atomic dipoles' term
  (3/2(xᵢμⱼ + xⱼμᵢ) − δ x·μ) its "q+dip"; adding Σ qp its "full", to 0.003,
  for water and formaldehyde. Each atom's tensor is traceless to 1e-15. So the
  potential term is Θ:RR/R⁵. The test rebuilds water's full quadrupole from
  the single point's charges, dipoles and quadrupoles (turned back from the
  principal-axis frame as R Θ Rᵀ) within 0.01 of the oracle.
- **On the surface** (kcal/mol/e; charges → + dipoles → + quadrupoles):
  water −40…+32 → −57…+46 → −55…+51; pyridine −23…+9 → −50…+26 → −57…+23;
  benzene −12…+3 → −32…+19 → −29…+16.
- **Correction to what I told the user**: I predicted the quadrupoles would
  deepen benzene's π faces. 1.8 Å above the ring centre they do the
  opposite — −6.7 (charges), −20.8 (+ dipoles), −9.9 (+ quadrupoles): the
  quadrupoles take back about half the dipoles' overshoot there. The
  dipole-only sum was an expansion stopped one term early; the quadrupole
  term is the better estimate of GFN2's potential.
- The toggle is now "Include atomic dipoles & quadrupoles"; the setting
  `atomicMultipoles`, the ESP argument an `AtomicMultipoles`.

## The ESP gets the atomic dipoles, on one colour scale (2026-10-09)

Asked by the user after the full dipole landed: "make it as accurate a
picture as possible" — and keep the gap between the labels, the ESP and the
dipole visible, because it is "an excellent teaching moment".

- **The potential** adds each atom's CAMM dipole, Σ pᵢ·(r − rᵢ)/|r − rᵢ|³,
  to Σ qᵢ/|r − rᵢ|. The single point returns the dipoles turned into the
  molecule's axes, in e·Å. Checked: Σ qᵢrᵢ + Σ pᵢ rebuilds the full dipole;
  1.6 Å past water's oxygen, away from the hydrogens, the potential is more
  negative with them.
- **Measured on the surface** (kcal/mol/e, charges → + dipoles): water
  −40…+32 → −57…+46; pyridine −23…+9 → −50…+26 (the N lone pair);
  benzene −12…+3 → −32…+19. Pyridine's dipole: 1.16 D from the charges,
  2.28 D full, experiment 2.19 D — the best teaching case found.
- **One colour scale.** Each surface used to set its own scale from its own
  potentials, which would have stretched the point charges' weaker surface to
  the same reds and blues and hidden the whole lesson. The GFN2 surface is
  now always scaled to the with-dipoles potentials (`espVmaxUnder` re-probes
  the same vertices), so turning them off reads paler.
- **"Include atomic dipoles"** (Charge Model view, on by default, disabled
  under MMFF94) switches the ESP and the dipole together between GFN2's
  fuller picture and the point charges alone — what the labels add up to.
  The hint under "Charges from" no longer claims one set feeds all three.
- **The atomic quadrupoles followed** (same day, at the user's asking) — see
  the next entry.
- Testing trap: the controls rebuild on the next animation frame, and a
  background browser pane gets frames only when screenshotted, so a readout
  read straight after a click shows the previous state. And TrackballControls
  keeps turning after a drag — reset the view before comparing captures.

## What one GFN2 calculation knows: bond orders, spin, the full dipole, SCF orbitals, vibrations (2026-10-09)

The user agreed the ranking (bond orders, spin density, GFN2 MO ordering,
vibrations, full dipole) and the rebuild ("especially true SCF orbital
ordering").

- **The rebuild** (vendor/occ-wasm, step 3c; `occ-valence.patch` is the whole
  modification now): the engine computed CAMM atomic dipoles every SCC cycle
  and dropped them — kept; `dipoleMoment`, `aoAtoms`, `aoAngularMomenta`,
  `orbitalValues(points, coefficients)` (ψ and ∇ψ through OCC's own
  `gto::evaluate_basis`, so no basis convention reaches TypeScript). Incremental
  build in the existing tree: minutes. +32 KiB gzip (the basis evaluator).
  Against the oracle (`ssh lenovo ~/opt/xtb/bin/xtb --gfn 2`): water full
  dipole 2.279 vs 2.278 D, formaldehyde 2.415 vs 2.411 D, Wiberg identical to
  three places, HOMO/LUMO within 12 meV; the HOMO on a grid integrates to
  1.0000; 216 000 points in ~40 ms.
- **Correction to what I told the user** while ranking: I read formaldehyde's
  HOMO as −0.296 Eh. That is the LUMO; the HOMO is orbital 6 at −0.425 Eh
  (the oracle agrees). I had taken the first unoccupied level for the last
  occupied one.
- **One single point per displayed structure**, GFN2-optimised ones included
  (their charges came with the run, nothing else did): charges, Wiberg bond
  orders per drawn bond, spin populations, the full dipole, the MOs. Run in the
  principal-axis frame, so a GFN2 p is the same px/py/pz as extended Hückel's,
  and the dipole is turned back to the molecule's axes.
- **GFN2 orbitals through the EH machinery.** The worker identifies each AO by
  probing its values a bohr out along x, y, z and the diagonals (a p is where
  it is non-zero; z² is −½ along x and y; x²−y² is opposite along x and y),
  folds each function's sign into the coefficients and overlap, and hands over
  an EH-style basis description. `labelIrreps` and
  `canonicalizeDegenerateSets` then run unchanged: water's occupied labels
  equal EH's, benzene's HOMO is the canonical e1g pair, the LUMO e2u.
  Acetaldehyde: both methods put the in-plane O lone pair (a′) at the HOMO
  and π (a″) two below, π* (a″) the LUMO.
- **GFN2 surfaces are built in the worker** (the field and its gradient need
  the engine's basis): field cached per orbital, level by percentile or
  amplitude, march, then each vertex's normal from the analytic ∇ψ in one
  batch. Trap met: `marchSignedField` winds each triangle by the normal it is
  handed at the centroid, and it was handed zeros — a speckled surface. Each
  triangle is now re-wound against its vertex normals.
- **Fermi smearing** (GFN2's 300 K default) left 0.002 electron in H₃Si–Ni's β
  MO 9, and "occupied > 0" made it the HOMO. Occupations within 5 % of empty
  or full are snapped; a genuinely fractional level keeps its share.
- **Spin**: H₃Si–Ni's unpaired electron sits 0.56 on Ni, 0.39 on Si.
- **Vibrations** come free with the Hessian check (below 16 atoms, at a
  minimum): mass-weighted, translations and rotations projected out with an
  explicit projector. Water: 1539/3644/3652 cm⁻¹ in the app; the oracle's
  `--ohess` 1540.8/3637.3/3645.4 at its own minimum (5 cm⁻¹ from our minimum
  and step). Played by moving the existing atom and bond meshes each frame;
  the period scales as 1/ν so a stiff stretch beats faster than a bend. The
  VSEPR view hides atoms by default, so a playing mode shows them regardless
  and hands the layer back to its toggle when stopped.
- **UI**: label modes "Bond orders (Wiberg)" and "Spin density" (disabled,
  with the reason, for a closed shell); the Delocalized view's method row
  (Extended Hückel | GFN2-xTB) and, for an open shell, α/β; a Vibrations
  picker under the spin control in the Structure group. A `.hidden` class does
  not beat `.preset-row`'s `display: flex` — the rows needed their own rule —
  and the σ/π/LP preset handler grabbed every `.view-preset-btn` until scoped
  to `[data-preset]`.

## H₃Si–Ni: an odd electron count, a rule-built CIR structure, a bare Ni (2026-10-09)

Reported by the user after sketching H₃Si–Ni: CIR's structure came with
"Ni has no MMFF94 type — generic fallback, geometry approximate", and
"Refine with GFN2-xTB" answered "found no usable geometry".

- **No geometry: the spin, not the parameters.** 17 valence electrons (Ni 10,
  Si 4, 3 H), and every sketch ran as a singlet. Measured on CIR's
  structure: as a singlet the engine throws on the first evaluation, so the
  run returns nothing; as a doublet it converges in 6 steps (0.2 s) to a
  minimum, Si–Ni 2.17 Å. CIR itself marked the Ni a radical (`M  RAD`).
  Organic sketches seldom hit this — the hydrogen filler evens the count —
  but metals now come bare, and a d⁹ Cu(II) is odd. Fix: the lowest spin the
  count allows (parity of Σ Z − charge; a core is always even), and a spin
  control under Refine for anything else (decided with the user: there,
  so "set the spin and re-run" happens in one place). A chosen spin whose
  parity does not fit is refused with the reason. A quartet H₃Si–Ni lost a
  Si–H bond in GFN2 and `bond-integrity.ts` set it aside — the guard doing
  its job, not a bug.
- **The MMFF94 note blamed the wrong thing.** `composeNotes` ran the
  parameter-gap report on every fetched structure, on the premise that a
  fetched structure is an MMFF94 conformer. PubChem's are; CIR's are CORINA's
  rule-built ones. Now PubChem only (and the ring-pucker report with it).
- **CIR's metal geometry is rough**: Si–Ni 2.59 Å against GFN2's 2.17 Å.
  With the user: a sketch containing a metal skips PubChem and CIR, and the
  Info log says why.
- **The symmetry snap was fine**: 0.02 mÅ, noise.
- **VSEPR for metals** (asked by the user, who proposed an s sphere): the
  model described only H B C N O F Si P S Cl Br I, so every other element
  drew nothing — XeF₄ included (my earlier claim that it would read sp³ was
  wrong; `hybridize.ts`'s `|| 4` is never reached). Agreed and refined: the
  main group is described, metals and noble gases included — valence counts
  added for Cs, Ba, Tl, Pb, Bi, Po, At and the noble gases (8) — so BeCl₂ is
  sp, SnCl₂ bent, XeF₄ square planar with two trans lone pairs (seen in the
  app). The d and f blocks (Sc–Zn, Y–Cd, La–Hg) and the alkali metals show
  their valence s alone, a translucent sphere a quarter ångström outside the
  atom ball (a smaller one hid inside Zn's 0.63 Å ball), labelled "4s".

## Any element through radon in the sketcher: JSME's "X" atom (2026-10-09)

Probe for a "More…" periodic table: how to place an element our toolbar has
no JSME key for. Measured against jsme-editor 2024.04.29 in the dev app.

- **JSME's X button** opens a GWT popup (`.mosaic-WindowPanel`, caption
  "Nonstandard atom", label "atomic SMILES") holding one `input.gwt-TextBox`
  (default `H`) and a `Close` button. Whatever SMILES is in that box is the
  "X element".
- **JSME reads the box live**, at every use, even after Close has taken the
  popup out of the document. Keep a reference to the `<input>`: setting
  `.value = '[Pt]'` on the detached box makes the next placement Pt. The
  popup only has to open once per session.
- **Two ways to place the X element**, both following the box: the `x` key
  over a hovered atom turns it into the X element (the same hover-and-type
  path as `c n o …`), and `setAction(301)` — any code ≥ 301 — places it on
  empty space (an empty sketch; beside a structure not tested). `setAction`
  202 still gave `CC` in between, so the codes were honoured, not ignored.
- **Bracket the symbol.** A bare symbol gets JSME's own implicit hydrogens,
  and not consistently: `Si` → `C[SiH3]`, `Se` → `C[SeH]`, `B` → `BC`, and
  `Ni` gave `C[NiH]` on an atom that had been C or O but `C[Ni]` on one that
  had been another metal. `[El]` gave `C[El]` with no hydrogens for all 86
  elements H–Rn. Charges in the box work too (`[Ni+2]`). JSME also accepts
  nonsense (`Zz` → `[Zz]`), so our table must limit the choices.
- **Opening the popup with menus clipped.** A synthetic mousemove/mousedown/
  mouseup on the hidden X label's `<svg>` (find `svg text` "X", fire at its
  centre, with `screenX/screenY` as well as `clientX/clientY`) opens it — on
  the *second* press; the first never did (fresh page, three trials; a 50 ms
  gap after the move did not help). It appears asynchronously, within
  ~200 ms. `setAction` 1–999 never opens it, nor does the `x` key.
- **No deafness.** After opening it that way and pressing Close from
  script, our single-bond button plus one real click drew `CC`, and the `x`
  key then gave `C[Ni]` — the first-click-ignored bug of 2026-10-05 did not
  return.
- **Theming gap:** JSME draws an unlisted element's label in
  `rgb(64,64,64)`, dark grey on the dark themes; `main.css` needs a rule
  for it.
- **Hydrogens disagreed between the two pipelines.** The fetch sends JSME's
  `smiles()` (`C[Si]` from a bracketed entry — no H on Si); the local pipeline
  ignores the molfile's H-count column (JSME writes it for these atoms) and
  fills from `BOND_VALENCE` (SiH₃). `validate-structure.ts` compared heavy
  atoms and net charge, not H counts, so a radical could pass as "PubChem 3D".
  Settled below.
- `setMenuXShortcuts('Fe,Xe,[Pt]')` is accepted and read back but changed
  nothing in the popup.

**Built (same day), with the user's decisions:**
- **One pick, then the sketch.** "More…" opens our periodic table (H–Rn,
  lanthanides in their own row). A pick sets the X box, adds a button for
  the element to the row (the four most recent picks are kept) and chooses
  it, so the next click on the sketch places it. Startup opens the X dialog
  out of sight (`.jsme-x-hidden`), takes the box, closes it, and sets the
  chosen tool again — the press makes the X atom JSME's action. "More…" stays
  disabled until the box is in hand.
- **Hydrogens: the user's sketch is the specification.** Nonmetals and
  semimetals (H, B, C, N, O, F, Si, P, S, Cl, Ge, As, Se, Br, Sb, Te, I) get
  implicit hydrogens to their usual valence; metals and noble gases only the
  ones drawn. The filler used to give Li, Na, K, Rb, Be, Mg, Ca, Sr, Al, Ga,
  In and Sn hydrogens (a sketched Na became NaH) — a bug the user named, now
  fixed. In the X box a nonmetal goes in bare (JSME adds its hydrogens for B,
  Si, Se; none for Ge, As, Sb, Te), a metal or noble gas bracketed.
- **The fetch guard counts hydrogens**: each heavy atom with its H count,
  the sketch's being drawn + `implicitHydrogenCounts`. Where JSME's SMILES
  carries fewer than the local filler would add (Ge, As, Sb, Te; and the
  sketches whose valence the filler reads differently from SMILES, such as a
  neutral three-bonded S), the fetch now fails and the local pipeline builds
  it. Checked in the app: H₃Si–Ni came back from CIR as H₃NiSi and passed.
- Seen while checking, left for the downstream limitations: the H₃Si–Ni
  scene drew Si's three lobes to H and the Ni apart, with "Ni has no MMFF94
  type".

## NiCl₄²⁻ refined as a singlet; Ni(CN)₄²⁻ cannot start from a tetrahedron (2026-10-06)

Reported by the user on the NiCl₄²⁻ example: no VSEPR lobes, a 0.56 D dipole
on a C3v structure, no localized orbitals or HOMO, and Refine giving a nearly
planar "D2".

- **The C3v is ORCA's.** `~/orca_calcs/nickel-complexes/NiCl4`: ωB97X-D3/def2-TZVP,
  charge −2, triplet, started from Td; converged, 0 imaginary modes, point
  group C3v, ⟨S²⟩ 2.004, dipole 0.098 D, lowest modes 46 cm⁻¹. Tetrahedral
  d⁸ ³T₁ is Jahn–Teller active, so C3v is the real minimum and a small dipole
  is real. The app's 0.56 D is GFN2's point charges on that geometry (their
  dipole only — see AGENTS.md). Td would read 0. Which one to teach is the
  user's call (asked, open).
- **No localized orbitals, no HOMO: intended.** The example is a triplet and
  `closedShellOccupations` refuses an open shell rather than invent one.
- **No lobes: fixed (c5aab41).** A bond to a metal was skipped as a domain, so
  each Cl⁻ had (7 + 1)/2 = 4 lone pairs and no bond to orient them by. A
  ligand's bond to a metal is now its donor σ domain (`sigmaNeighbors`): Cl⁻
  sp³ with three lone pairs; the cyanide C points its σ hybrid at Ni. A haptic
  contact (the metal also bonded to a neighbour of the atom) is still not a
  domain — ferrocene's ring carbons stay sp².
- **Refine went flat: fixed (c5aab41).** `breakSymmetry`, `fillMissingHydrogens`,
  `embed3D`, `separateOverlaps` and the wedge `finish` rebuilt the Molecule from
  `{ atoms, bonds }` and dropped `multiplicity`, so every GFN2 optimisation
  ran as a singlet. From the example geometry the singlet goes to Cl–Ni–Cl
  165.7°/90.8° (−23.528533 Eh). The triplet stays near-tetrahedral: 107.5–112.6°,
  −23.534615 Eh, 7 steps, a Hessian minimum, snapped Cs. (From the
  embedder's tetrahedral start the singlet also stays near-tetrahedral, so
  the regression test refines the example, as the button does.) The
  single-point charges always had the multiplicity: `chargesAt` reads the
  posted molecule directly.

**Ni(CN)₄²⁻ from the local pipeline: still unoptimised, and it never was.**
The embedder puts the four C at 2.16 Å in a tetrahedron. A closed-shell
tetrahedral d⁸ ion has four electrons in a triply degenerate t₂ set — no
valid closed shell — and the SCC oscillates:
- Unkicked start: the SCC converges (default mixing). After the 0.05 Å kick it does not.
- OCC exposes `mixerDamping` (default 0.4), `maxIterations` (250) and
  `temperature` (300 K). On a fresh calculator at the kicked start,
  damping 0.1 / 500 iterations converges (−25.180934 Eh), and so do T ≥ 1000 K.
- But **after `updateStructure`** the same settings fail. That holds even at the
  same coordinates, and even 0.01 bohr from a converged solution
  (−25.1377, unconverged). It takes damping 0.1 with 2000 iterations, or 0.02 with
  3000. Settings survive `updateStructure`; the SCC's restart from there
  does not. A patient-mixing retry inside the worker rescued nothing, and it
  stretched the failure from 5 s to 16.6 s, so it was reverted.
- Refining from the example's D4h geometry works: Ni–C 1.833 Å ×4, 90°/180°.
- Bisected the "16.8 s" in the Berny entry above: fc98c76 converges (12.7 s)
  only because its example had single C–N bonds that the filler hydrogenated.
  From ff15e70, the commit that made them triple, it fails.
The fix that addresses the cause is the embedder knowing low-spin four-coordinate d⁸
is square planar — an AGENTS.md known limitation, changed with the user's
approval the same day:
- `chem/d-electron-count.ts`: dⁿ = group − oxidation state. The oxidation state
  is the metal's drawn charge plus one per *covalent* bond to it; a bond is
  dative when the ligand atom is already at its normal valence for its charge
  without it (Cl⁻, C⁻ of cyanide, NH₃'s N). Ionic Ni²⁺/4 Cl⁻ and covalent
  Ni²⁻/4 Cl both read d⁸.
- `place3d.ts`: a four-coordinate atom with d⁸ and multiplicity 1 takes
  `SQUARE_PLANAR_VECTORS`. The triplet NiCl₄²⁻ keeps the tetrahedron.
- Measured: Ni(CN)₄²⁻ from the sketch (Ni²⁻ drawn, Skip PubChem) — GFN2
  converged in 13 steps, 1.0 s, −25.284604 Eh, Hessian minimum, D4h; the
  same energy as refining ORCA's D4h geometry (−25.284605).
- JSME's `readMolFile` drops `M  CHG` lines (its SMILES output also hides a
  charge on Ni, though its molfile carries it). A *neutral* Ni(CN)₄ sketch is
  formally Ni(IV), d⁶, and rightly gets no square-planar start.

Also from the user, same day: the NiCl₄²⁻ example keeps ORCA's C3v (a
teaching moment), with an Info note — the flat fact and a LibreTexts link
(Example.note, rendered as a link by showInfoLog). The user finds the other
Info outputs long-winded; revisit them. First pass (4575ed5): the GFN2 note
cut to the fact + "one parameter set through radon" + the JCTC 2019 paper;
the Pipek–Mezey note lost "pick one from each section to see a
hyperconjugation interaction" (false where there is none) and cites
J. Chem. Phys. 1989. Links are `InfoNote` (ui/info-note.ts). The browser pane
caches main.css across reloads in dev — a stale rule there is the cache, not
the code (a `?bust=` link proved it).

## The embedder chose no torsions, and the wedges were read off a 3D model (2026-10-06)

Reported by the user: with the local route forced, butane came out gauche,
pentane U-shaped after GFN2, and hexan-2-amine "converged" (65 steps, 30.6 s,
−23.258692 Eh) with C–H bonds of 3.7 A and two H2 molecules in it.

Two independent bugs, measured stage by stage (embed → de-overlap → GFN2 →
wedges) on JSME's own 2D sketches (tests/references/sketches.ts):

1. **The graph walk left every torsion to chance.** Aligning an atom's ideal
   directions to its parent takes the minimal rotation, which fixes nothing
   about the turn around the bond; torsions.ts then snapped each to the
   nearest multiple of 60° measured from arbitrary substituents (H's
   included) — and 0/120/240° are the *eclipsed* values. Measured: pentane's
   and octane's C–C–C–C dihedrals all 0° (syn); octane's C3 and C8 0.17 A
   apart, which the de-overlap pass "fixed" by stretching a C–C bond to
   2.54 A; hexan-2-amine eclipsed at −120°; cis- and trans-but-2-ene both
   twisted 60° about the C=C. Now `setTorsion` (place3d.ts) chooses the
   torsion as the atom is placed: the first heavy child anti (180°) to a heavy
   neighbour of the parent about a single bond — every other substituent
   then staggered — and cis (0°) or trans (180°) about a double bond as the
   sketch draws it. torsions.ts is gone. Measured after: every chain all-anti,
   no pair three bonds apart closer than 1.87 A, GFN2 converging in 4–14
   steps (hexan-2-amine 12 steps, −23.415443 Eh — 0.157 Eh below the broken
   "converged" one).

2. **The wedges were re-asserted against a 3D model.** After the
   optimisation `honourWedges` re-checks the drawn configuration, reading
   "front of the page" from the sketch's x,y — but it was handed the 3D start,
   so the "page" was an arbitrary projection, and a correct centre could be
   inverted: hexan-2-amine's N swung 2.3 A, its H's up to 3.3 A, after a GFN2
   run that had kept the right configuration. `embed3D` now returns the 2D
   `sketch` (with its hydrogens) and that is what the wedges are read from.

Then the guard ("belt and suspenders", the user's words): `bondingChange`
(bond-integrity.ts) runs on every GFN2 result, after the wedges — a drawn bond
longer than 1.3 × the covalent radii sum, or two atoms neither bonded nor
sharing a neighbour within the radii sum + 0.4 A, means the structure is not
the one drawn; the start is shown, labelled with the bond. The Refine button
refuses such a result the same way. The 1,3 exemption is what lets diborane's
undrawn B···B (1.77 A across the bridges) pass. Swept over every example and
every test sketch through the full pipeline: no false rejection; the broken
hexan-2-amine export is rejected ("the C1–C2 bond came apart (3.67 Å)").

Found on the way, older than any of this: **[Ni(CN)₄]²⁻ is not optimised at
all.** Its start's SCC converges, but the deterministic 0.05 A symmetry kick
(breakSymmetry) lands it where the SCC does not, every rung fails, and the app
shows the unoptimised start (5.7 s). The embedder starts it identically before
and after the torsion fix; most likely since the C≡N fix changed what GFN2 is
handed. Not yet fixed.

## Ketene's π systems, and the π cloud (2026-10-08)

**Cumulenes.** A one-bond sp² atom took its p from the cross product of its
partner's two bonds; at a cumulene's linear sp centre that is zero (PubChem's
exactly linear ketene: O drawn without a p) or noise (an optimised, slightly
bent one: a p in a random direction). `orient-pi.ts` now walks the cumulated
chain (detected by bond orders, never the angle — HN=C=O bends 8°) to the atom
that ends it and turns that plane's normal 90° per double bond. Then the central
carbon's own p's depended on atom ORDER: it borrowed from whichever π neighbour
came first, and PubChem lists ketene's O first, so it took an arbitrary
perpendicular. A terminal neighbour now answers with its anchored direction.
Tested on PubChem's own 3D record (CID 10038) and the local build both ways.

**The π cloud** replaced the tubes of "Highlight π systems" (user: "a
disjointed tube is somewhat gaudy"; reference: Silberberg's ethene/ethyne
figures). In-phase sum of Gaussian p functions (α = 1.2 Å⁻², peak 0.65 Å out),
marched on the signed field at 0.9 of one p's peak: bond midpoints sum to ~1.1
(joined), benzene's centre to ~0.57 (hole kept). Cloud opacity 0.55, member
lobes tinted and 0.45 so the cloud leads. Palette clear of the π blue and the
lone-pair amber. Anthracene's first cloud ~0.3 s; cached per molecule, every
redraw after ~10 ms. Marching moved to `src/utils/march-tetrahedra.ts` (two users).

## The icon (2026-10-07)

`public/favicon.svg` is the source of the brand mark as an icon (the header's
hexagon on a dark tile); `src-tauri/icon-source.svg` is a copy, and
`src-tauri/icons/` is generated by `bunx tauri icon src-tauri/icon-source.svg -o <tmp>`,
copying back only the files the project ships (it also makes android/ and ios/).
- No `--` inside an SVG comment: it is invalid XML, and `tauri icon`'s parser
  (usvg) panics on it.
- A local `tauri build` after an icon change kept the OLD icon in valence.exe:
  the build script did not re-run. `touch src-tauri/build.rs` forces it. CI
  builds from a clean checkout and is unaffected.

## The smoke test, and the display scaling that hid a bug (2026-10-07)

`scripts/smoke/` (`bun run smoke [url]`): headless Edge/Chrome over the
DevTools protocol, no automation dependency. 27 checks, about 100 s (up to
~8 min when PubChem is slow).

- **Display scaling matters.** At deviceScaleFactor 1 JSME draws a session's
  first atom where it is clicked, so the pre-d7b8471 sketcher passed. At 1.5
  (common on Windows laptops) the first atom of a fresh page is drawn at the
  drawing's centre and the old code left CH4: the user's bug, reproduced
  exactly ("first atom of a session" fails, "after Clear" passes). The smoke
  test runs at 1.5 for that reason.
- **Each check was proved against the old bug it guards:** old sketcher fails
  first-atom at 1.5; old MO panel fails the scroll check (243 → 52).
  Swapping two source files at once mid-run broke the whole page under Vite's
  reload, so prove one at a time.
- **Scene coverage** is measured from a DevTools screenshot decoded in the page:
  a WebGL canvas without preserveDrawingBuffer cannot be read back.
- **Smoke against the live site is not trustworthy.** Headless Edge against
  https://exergonic.github.io blanks the centre column after the first few
  view changes (canvas *and* the DOM header and view bar), for v0.8.0 and for
  v1.0.0-beta.1 alike, while the same build under `vite preview` passes 27/27
  and the live site draws correctly in a real browser (checked in the pane with
  the same sequence). A test-environment quirk, unexplained. Use
  `bun run build && bun run preview` + `bun run smoke http://localhost:4173/valence/`
  for the production check.
- (Superseded note:) **The live site (v0.8.0, 2026-10-07) fails headless:** the centre column
  (canvas *and* its DOM header and view bar) comes out blank in the capture,
  though the DOM says visible and the pane draws it fine. The current production
  build under `vite preview` passes 27/27. Re-run against the live site after the
  next deploy; if it still fails there, look at what overlays the centre.
- **Vite watched `src-tauri/target`**: a `tauri build` locking `valence.exe`
  crashed `bun run dev` with EBUSY. Now ignored (vite.config.ts `server.watch`).
  (Not the cause of the user's dev server stopping on 2026-10-06: the user
  closes everything at the end of the day to free RAM on a 16 GB machine.)

## 1.0.0-beta.1, and the MSI's version (2026-10-07)

The user's call: feature-complete for the scope, carried a real lesson, still
finding a bug a day in real use, mostly in the UI glue, which has little
automated coverage. So 1.0, beta.

- **The Windows build runs on a pushed `v*` tag** (`.github/workflows/tauri.yml`),
  not on a version bump; Pages deploys on every push to main.
- **MSI versions are numbers only**, `major.minor.patch.build`, each ≤ 255/255/65535,
  and Tauri refuses a lettered pre-release for the msi target. `sync-version`
  writes `bundle.windows.wix.version` for a pre-release, the pre-release number
  as the build (1.0.0-beta.1 → 1.0.0.1), and removes it for a plain release.
  Verified locally: `tauri build` → `Valence_1.0.0-beta.1_x64_en-US.msi`,
  ProductVersion 1.0.0.1 (read from the MSI's Property table).
- Unverified: whether the final 1.0.0 MSI upgrades cleanly over 1.0.0.1.
  Windows Installer ignores the fourth field when it compares versions for an
  upgrade, so the two may count as the same version. Check before 1.0.0.

## README screenshots: how they were made (2026-10-07)

`doc/screens/*.jpg` came from the running dev server through headless Edge
(`msedge --headless=new --remote-debugging-port`, 1600×1000 at DPR 2, real GPU
via ANGLE/D3D11), driven over the DevTools protocol with plain DOM events:
the examples dropdown, `[data-model]` view buttons, `button.orb-item` rows,
`.view-preset-btn`, `#ctrl-mo-clear`, `.theme-option`, and JSME's
`readGenericMolecularInput` + the Build button for sketched molecules
(`setMolecularAreaScale(2.2)` so the read-in sketch is legible).

Lessons, in the order they cost time:
- **Don't steer the camera by dragging.** TrackballControls keeps turning
  after a drag by the last frame's angle (decaying, even while the pointer is
  held), and Reset does not clear it, so the same drag landed anywhere from
  0° to 90° between sessions. Instead, catch the live camera: import the
  page's own three.js module (`performance.getEntriesByType('resource')` →
  `/deps/three.js?v=…`), wrap `Object3D.prototype.updateMatrixWorld` to grab
  the PerspectiveCamera (and Scene), then set `position`/`up` and `lookAt`.
  Atom meshes carry `userData.lobeType === 'atom'` + `atomIndex`, so views can
  be aimed by chemistry (a plane normal up, looking along a bond). The
  molecule is centred on the origin. Exact and repeatable.
- **Kill the whole Edge tree.** Killing the launcher left its children running:
  280 headless `msedge` after a day. Close with CDP `Browser.close`, then
  `taskkill /PID … /T /F`, and delete the temp profile. A leftover holding the
  debug port makes the next run hang silently.
- The tooltip races a hide; inject `#tooltip { display: none !important }`.
- Piped stdout is lost when `timeout` kills a run; log progress to a file.

The scripts lived in the session scratchpad, not the repo (offered to the
user as `scripts/` tooling). Also noticed: the README's MIT badge has no
LICENSE file behind it in the repo.

## Benzene's HOMO leaned: a symmetric top's frame was the eigensolver's whim (2026-10-06)

Reported by the user on a PubChem benzene: the e1g HOMO "leaning a bit to the
side", composition C4 −0.47 · C1 +0.47 · C6 +0.44 · C3 −0.44. Symmetry requires
the partner with a nodal plane through two carbons to carry equal |c| on the
other four (Hückel ½; EH 0.457 here) and zero on the two.

Cause: `canonicalize-degenerate.ts` builds the partners against the frame's x
axis (x² first), and `align-principal-axes.ts` left a symmetric top's two equal
axes wherever Jacobi put them. Snapped GFN2 benzene: carbons at 22.3° from x,
HOMO 0.488 / 0.417 / 0.070. The stored example escaped by accident: it is a
hair off D6h (its pair is split by 1e-4 eV), which pins the axes through atoms.
An old test had accepted 0.056 on the "nodal" atoms as "invisible as lobes";
that residue was the lean.

Fix: when two moments agree to 1e-4 (relative), x goes through the heaviest
atom off the unique axis (ties: farther, then lower index). Oblate (ring
normal unique) and prolate (CH₃Cl's axis unique) both handled; spherical tops
(CH₄, SF₆) untouched. PubChem benzene now reads 0.46 ×4.

The YAeHMOP oracle tests had to change, not the fixtures: they compared the
matrices the solver built after re-framing the fixture coordinates, so they
silently pinned the old frame convention too. S and H are now computed in the
oracle's own coordinates (as bind received them); energies, frame-invariant,
still go through the solver. All 31 pass. Fixtures untouched (provenance
rule above); rerunning bind over `ssh lenovo` was not needed.

## The first atom of a session was always CH4 (2026-10-06)

Reported by the user: on a fresh page, choose P (or O, N, S…), click the empty
sketch, and CH4 appears; a second click (on that atom) gives the element.

Cause: on an empty sketch our handler lets JSME place a carbon (action 253) and
then types the element key, which acts on the atom under the pointer; it
looked for the carbon at the click point. On a fresh page JSME draws the
**first atom at the centre of the drawing whatever the click** (clicked
(50,240), drawn at (134,373) with the drawing's centre at (133,367)), and only on
its next pointer event. After Clear the next atom *is* drawn at the click. My
early tests clicked near the centre and passed, which hid it.

Fix (sketcher-toolbar.ts): on the release, a synthetic move at the click
(JSME draws), find the lone atom where it was drawn (centre of its label's
first glyph: `getExtentOfChar(0)` through `getScreenCTM()`), move there, type
the key once the blue hover box shows; 5 retries at 50 ms. The step runs only
on an empty sketch: beside an existing structure, action 253 places nothing on
empty space (measured), so there is nothing to convert.

Dead ends, measured:
- `readGenericMolecularInput(el)` / `readMolFile` of a one-atom molfile: always
  right, but a read-in molecule resets JSME's drawing scale for the session —
  bonds drawn afterwards are 20 px instead of 39 px. Not shippable.
- `setTemplate('P', 'P')`: accepted silently; the next click gave methanol.
- Retrying the key at the click point, or stepping the pointer 1 px off and
  back: no hover — the atom is not there.

Testing trap, again: synthetic `mousemove`s are only reliably honoured by JSME
when the automation's own pointer approached the drawing in small steps first.
Teleporting clicks (toolbar → canvas in one jump) produced after-Clear
"failures" in both the old and new code that vanished with a hand-like
approach. Approach in steps before judging any sketcher behaviour.

Scope decision (the user, same day): clicking empty space beside a structure
adds no second, unconnected atom, and that stays. Valence teaches electron
configuration and bonding within one molecule; disconnected species belong
to intermolecular phenomena, which are out of scope.

## The first click after picking a tool did nothing — no more simulated presses (2026-10-05)

Reported by the user building methyl chloride: after choosing a tool or an
element, the first click on the drawing only "engaged" JSME (the blue hover
box appeared) and the second one drew. Cause: our toolbar pressed JSME's
hidden menu buttons with synthetic mousedown/mouseup, and that left JSME's
drawing ignoring the pointer — no hover tracking — until a real click there.
A real click on JSME's *own* buttons in the un-clipped applet behaved the same
under automation. What did NOT fix it (each tried and measured): sending the
leave events a real pointer makes (mouseover/out/leave), adding a `click`,
moving focus to JSME's drawing (focus moves on every click anyway), and a
synthetic mouseup on the drawing (woke it only sometimes, depending on
position and on prior pointer moves). `setAction()` leaves JSME responsive,
and that settled it: stop pressing the menus at all.

The toolbar now uses what JSME offers directly:
- tools: `setAction` 104 delete, 108 charge (cycles), 201 stereo (atom → new
  wedge; that bond → hash → either), 202–204 bonds, 205 chain, 206–208 rings
  3–5, 209 benzene, 210 ring 6; 253 places a lone carbon;
- elements: JSME's keys, which turn the atom under the pointer into the
  element — c n o s p f, l = Cl, b = Br, i. With an element chosen, a mousedown
  on an atom (JSME has drawn its blue hover box) is kept from JSME and becomes
  the key; on empty space JSME places a carbon (253) and the key follows on
  the release. `setAction` 301 and up only mean "the element last chosen on
  JSME's own button", so element buttons were the one thing codes could not do;
- undo / redo: Ctrl+Z / Ctrl+Y on JSME's hidden text area;
- clear: `clear()` — after an undo or redo JSME can ignore the first call, so
  it is repeated when the sketch is not empty; and **`clear()` does not
  redraw**: JSME's molecule is emptied (smiles '', 0 atoms) but the old
  structure stays on screen, so Clear looked dead to the user ("I can click it
  several times"; the next atom appeared beside the stale drawing). A
  `repaint()` follows it. Checking `smiles()` alone had passed it — check what
  is drawn.

Verified with real pointer input (approach, then one click each): C on empty
→ CH4; single bond on it → ethane; Cl on the new carbon → CCl; O on empty →
O. And a synthetic sweep with stepped approaches: every bond and ring, all
eight heteroatoms on a ring atom, charge (pyridinium), stereo, delete, undo,
redo, clear.

Testing traps met: the automation's hover is one jump, and JSME sometimes
ignores a single far jump (hover box missing though the pointer is on the
atom) — approach in a few small steps, as a hand does. Reading JSME's
"selected button" highlight is useless: it only redraws on the next drawing
event.

## Our sketcher toolbar over JSME's engine (2026-10-05)

Redesign step 3, the experiment: keep JSME as the sketching engine, replace
its look. What made it work: JSME draws everything — drawing area and menus —
as plain SVG in the page (five `<svg>`s: the drawing, the button bar above,
the element column left, an info bar below, a 1 px strip right), with its
colours as presentation attributes. So:

- **Clipping.** JSME mounts in `#jsme-stage`, which is moved up/left by the
  measured menu sizes and grown by them inside the overflow-hidden well; only
  the drawing shows. The stage stays invisible until clipped (no flash).
- **Driving.** Our buttons press the hidden JSME buttons with synthetic
  mousemove/mousedown/mouseup at the button's grid position (pitch = button
  bar height / 2; the element column starts 3/37.5 pitch down). JSME acts on
  mousedown+mouseup; pointer events and click alone do nothing.
- **Theming.** CSS rules outrank SVG presentation attributes: `rect
  [fill=white]` → well colour, `line[stroke=black]` → ink, label fills (blue N,
  red O, rgb(178,178,0) S, rgb(255,0,255) every halogen, rgb(255,200,0) P) →
  theme tokens, the blue hover box → accent. The old invert filter is gone.

The grid, mapped by behaviour (press, click empty or an atom, read the
molfile back) with options "newlook" at menu scale 1. Top bar, row 0: col 3
delete, col 7 charge (cycles; C goes −1 first, N +1 first), col 9 undo,
col 10 redo. Row 1: col 0 stereo bond (click an atom: new wedge; click the
bond: wedge → hash → either), 1–3 single/double/triple, 4 chain, 5–7 rings
3–5, 8 benzene, 9 ring 6. Element column rows 0–8: C N O S F Cl Br I P.
Clear uses JSME's `clear()`. Traps met while mapping: a sweep's leftover undo
history made undo look like redo (map commands from a controlled history);
`depictaction` mode has no menus but also refuses edits; `setAction` codes
exist (202–204 bonds, 206–212 rings, 233–261 groups) but its element codes
place an "X", so buttons, not codes.

Testing trap: JSME finds the atom under the pointer on **mousemove**. An
automated click that teleports the pointer (mousedown with no move before it)
never hits an atom, so atom tools look broken under automation while working
for a person. Hover first, then click. Verified end to end that way: benzene
tool, N on a vertex (pyridine), charge on N (pyridinium), Build 3D model →
PubChem 3D.

## The inspector: one model's controls at a time (2026-10-05)

Redesign step 2. The floating tabbed panel (Molecule / View / Analyze /
Export) and the floating MO panel are gone; even the author could not find
things in them. The screen is now sketcher | scene | inspector. The inspector
is docked on the right and shows a shared section (atoms & bonds, labels),
then the active view's own: VSEPR (hybrids, orbital set, π highlight),
Charge model (charge source, ESP and its key, dipole), the orbital list for
Localized and Delocalized, and the Info log at the bottom. Everything global
(theme, structure options, display, measuring, annotations, export) moved to
a settings drawer behind the top-right button; Examples moved above the
sketcher. Every control kept its id, so controls.ts now finds them in the
document instead of inside the old panel.

A behaviour change that follows from it: a model view is now a mode. Before,
a hand change to one of its controls cleared the button's highlight (the
preset no longer named the picture). With the inspector showing the view's
controls, clearing it would leave the panel naming nothing, so the view stays
selected while its controls are adjusted.

Two details measured on the way: the orbital list scrolls its drawn row into
view, which does nothing inside a hidden section, so the inspector switches
sections before the list is drawn. The ESP colour key is generated from the
surface's own `espColor` (red → green → blue), not written into the CSS — the
first draft's red-white-blue key did not match the surface.

## Three themes, one token layer (2026-10-05)

Redesign step 1 of 3 (then: controls per model view; our own sketcher
toolbar). The user liked all three mockup directions and chose a picker over
a single look. Every colour in main.css is now a token, set per theme on
`<html data-theme>`: Graphite (near-black, Geist — the default), Steel (navy,
IBM Plex, a 1 px top bevel on panels), Light (for projectors). theme.ts sets
what CSS cannot reach: the scene background, through the Background control's
own input so its swatches and the labels' contrast palette follow; and JSME's
chrome colour. An inline script in index.html applies the stored theme before
first paint. Fonts are bundled (@fontsource), not fetched: the app must work
offline in a classroom, and only the active theme's faces download.

JSME on a dark theme: its canvas is out of the stylesheet's reach, so the
container is filtered `invert(0.94) hue-rotate(180deg)` — 0.94 rather than 1,
so white lands on #0f0f0f instead of pure black; the hue-rotate turns the
element colours back round. Its drawing area is neutral near-black on Steel
too (no navy tint), and its toolbar keeps JSME's own grid — both step 3's job.

## Where a scene build's time goes; ferrocene leaves the examples (2026-10-05)

Profiled once, to rule out anything pathological (dev build, in the browser):
the chemistry is nearly free — extended Hückel 1–7 ms, Pipek–Mezey ~15 ms,
irrep labels ≤4 ms, VSEPR and BCI ~0 for the organics. A scene build is
10–30 ms in the VSEPR view; the Charge Model view adds ~90 ms for the ESP
surface when the GFN2 charges land. The orbital views cost 250–330 ms, and
nearly all of it is the HOMO isosurface: the field on a ~150k-point grid
(~70 ms) and the marching tetrahedra (70–190 ms). Of the marching, ~40 % is
the analytic gradient for the exact normals (four evaluations per triangle,
shared vertices recomputed — a possible 2–3x if it ever matters); the rest is
the plain walk, ~45 ns per tetrahedron. Nothing pathological.

The one outlier was ferrocene: Pipek–Mezey took 2.5 s (59 AOs), it localizes
poorly, GFN2 does not converge it, and its chemistry is crystal-field theory,
which the app does not teach. Removed from the examples. Its ORCA geometry
lives on as `FERROCENE_MOL` in tests/fixtures.ts, because a user can still
draw a metallocene and the valence model's refusal of one (no hybrid on Fe,
no η⁵ contact counted as a σ domain) stays pinned. The EH d-block oracle
test never used the example; it has its own reference file.

## Split E pairs named as one irrep; the engine preloads (2026-10-05)

**Benzene's HOMO read a2g/a1g.** The examples were loaded at their stored
coordinates, which are D6h only to 0.1 mÅ — skipping the snap every rendered
structure gets. That much asymmetry splits each E pair by 0.1–6 meV (benzene,
ferrocene, PCl₅ measured), above the 1e-5 eV the labeller called degenerate,
so each half was named alone as some A or B. Two fixes: examples now go
through the same symmetry snap (and the number-key shortcut goes through the
dropdown, so it gets the header and multiplicity too); and the labeller groups
levels as the ladder does (5 meV), keeping a group only when its characters
pass the irreducibility test Σ|χ(R)|² = h — otherwise the exact sets inside it
are named separately. That is what keeps accidental near-degeneracies apart:
ZnCl₂'s δg/δu at 1.9 meV and [NiCl₄]²⁻'s a1/e at 3.9 meV still read as two
irreps. With the snap off, unsnapped benzene now reads e1g (pinned in
tests/irrep-labels.test.ts).

**The GFN2 engine is fetched at startup.** The lazy load was decided when the
binding was ~26 MB; trimmed, it is 3.1 MB (wasm 2.4 MB, data 334 KB, worker
350 KB; ~1.2 MB gzipped). `preloadGfn2` starts the worker after the page's
load event and instantiates the wasm, so the first optimisation does not wait
on the download — a user draws first anyway. A Cancel has to kill the worker,
and a fresh one is warmed at once. Measured: a GFN2 single point lands ~17 ms
after the scene build on a preloaded engine.

## One charge model on screen: GFN2-xTB's, for labels, ESP and dipole (2026-10-05)

Before, the three charge displays could disagree: the labels and the ESP drew
whichever model the control chose, but the dipole arrow and its readout were
always MMFF94's, and GFN2's charges existed only for a structure the GFN2 tier
had produced, so a PubChem conformer could never show them. Water then read
−0.56/+0.28 on its atoms with a 2.42 D arrow that belonged to −0.86/+0.43.

Now `rebuildDisplay` picks ONE array (`displayedCharges`) and all three read
it. GFN2-xTB is the default for every structure: the optimiser's charges when
it made the structure, otherwise a single point at the displayed geometry,
requested in the background once per molecule (`gfn2ChargesAt` → the
worker's `chargesAt`). The single point adds no hydrogens and runs at the
geometry as shown — PubChem's MMFF94 conformer stays put, and its charges are
GFN2's at that geometry. Until they arrive the readout says "Dipole: …" and no
charge picture draws; the first molecule pays the engine's ~3 MB load.

MMFF94 BCI is a choice, not a fallback, except that a molecule the engine
cannot treat (an element outside GFN2's table, no Worker) shows MMFF94's in
its place, and one outside the MMFF94 type space shows GFN2's even when MMFF94
is chosen. The control shows the model actually on screen; the user's choice
is kept for the next molecule. The MMFF94 caveats (generic parameters,
residual ion charge) moved from the Info log to the dipole readout's hover,
because the log outlives a switch of model.

Measured on water (the example geometry, GFN2 single point): 1.59 D from the
Mulliken point charges, against MMFF94's 2.42 D and experiment's 1.85 D. GFN2's
own dipole adds the atomic dipoles; the point-charge one is what the labels and
the ESP show, which is the point. Pinned: the single point at the optimiser's
geometry reproduces the optimiser's charges to 1e-4, and [Ni(CN)₄]²⁻'s sum to
−2 (`tests/gfn2.test.ts`); `dipoleFromCharges` fed the BCI charges is the
MMFF94 dipole to 1e-12 (`tests/dipole.test.ts`).

Model-view presets, same day: the app opens on VSEPR; Charge Model turns the
dipole on; Localized and Delocalized draw the HOMO — the top row of the
Occupied list, and for a degenerate HOMO the set's top row in the ladder (its
lowest-numbered partner). While a button is lit, a new molecule gets its own
HOMO drawn. The MO panel's own buttons — the view tabs, collapse, and the O
key that clicks collapse — end the highlight.

## Berny adopted; OCC's gradient gap confirmed against the oracle (2026-10-05)

**Second correction, 2026-10-14: the README's cause was wrong — it was D4.**
The maintainer answered #58 and fixed it in 5644eaf (master; due in 0.9.6).
The AO-multipole derivative terms had been added since that README note was
written: with dispersion off, the multipole-on gradient already matched finite
differences to ~2e-7 on methanol and the anion. The gap was D4: its energy was
evaluated at the SCC charges, but its charge potential ∂E_disp/∂q never
entered the Hamiltonian — the energy was not variational and the gradient
missed a charge-response term, hence worst on polar and charged species (our
"missing charge-dependent term" guess below was the right shape). D4 is now
self-consistent, as in xtb; `gradient()` runs the same SCC as `single_point()`
and follows `include_multipoles` (the JS `includeMultipoles` switch already
existed, it just never reached the gradient). After the fix analytic and
numerical agree to 1e-5 Eh/bohr on both molecules, and `energy_and_gradient()`
returns the `single_point_energy()` energy; total energies move toward xtb
6.7.1 (methanol within 3.6e-7 Eh, was 9.6e-7; anion 3.6e-7, was 6.8e-6). Our
two geometries are upstream regression tests now. Plan (decided with the user
2026-10-14): wait for the 0.9.6 release rather than build from master — our
patch touches `xtb_calculator.h/.cpp` and `gfn2_engine.cpp`, the files the fix
rewrites, so port it once, onto a tag. Then re-measure analytic vs numerical
on P₄, water, SF₆, CHFCl₂, ethene, methanol and the anion; if they agree to
~1e-5 the numerical check in `relax` and the 24-atom limitation go (an
AGENTS.md rule change — ask), the numerical-gradient L-BFGS rung kept until
shown unused. The measurements below stand; the attributions to the multipole
term in them are superseded.

**Correction, same day: it is a known upstream limitation, not a bug.** OCC's
README (v0.9.4, and `main` — no `src/xtb` commit since) lists it under
"Current limitations": the multipole-on analytical gradient "has a known
~1 mHa gap versus FD-of-energy from missing AO-multipole integral
derivatives — the charge-only gradient is the production variant". The
measurements below stand; the cause is theirs, stated. What their README does
not say: the JS `XtbCalculator` exposes no charge-only switch, so through
the bindings `energyAndGradient(false, …)` always pairs the multipole-on
energy with the gap-carrying gradient, and OCC's own `BernyOptimizer` on it
converges the cyclopropenyl anion 4.7 kcal/mol above its minimum. That,
not the gap, is what an issue there would add. (OCC has no CONTRIBUTING file,
no templates and no AI policy; the README welcomes PRs and asks for an issue
first on major changes.)

**And in Python (occpy 0.9.4 on lenovo, `~/opt/occ-venv`)** the same gap, to
three digits (methanol 2.19e-4, anion 4.62e-4) — so it is not the wasm port.
Python does have `include_multipoles`, but it reaches only
`single_point_energy` (on −8.226018832, off −8.229505657) and
`gradient_numerical`. `energy_and_gradient(False)` returns the multipole-on
energy and a bit-identical gradient whichever way it is set, and `gradient()`
returns that same gradient — 9.0e-3 from the charge-only numerical gradient,
although its docstring says it "runs a charge-only SCC internally so the
(energy, gradient) pair is self-consistent". No setting in either binding
yields a self-consistent analytic pair. Filed as peterspackman/occ#58
(2026-10-05); the numerical-gradient check in `relax` can go when it is fixed.

**The gap, measured.** Methanol, the planar C₃H₃⁻ and P₄ (control), at
identical geometries, through the Fortran xTB oracle on lenovo
(`~/opt/xtb/bin/xtb --gfn 2 --grad`, 6.7.1) and OCC here:

| | methanol | C₃H₃⁻ | P₄ |
|---|---|---|---|
| xTB analytic − OCC finite difference | 6e-7 | 6e-6 | 4e-7 |
| xTB analytic − OCC analytic | 2.2e-4 | 4.7e-4 | 5e-7 |
| energy, xTB − OCC (Eh) | 1e-6 | 7e-6 | 4e-7 |

OCC's energy is right and its finite differences reproduce the reference
gradient; its analytic gradient is wrong, and only where charge separates —
the anisotropic-electrostatics (multipole) part, as their README says. Not
the SCC convergence: xTB at its own defaults lands on OCC's finite
differences.

**Berny is the optimiser now.** The trimmed opt binding is vendored (wasm md5
f84f0dd3…, +55 KB gzip; recipe step 3b). `relax` runs Berny on the analytic
gradient; a converged point below 24 atoms is checked with the numerical
gradient against Berny's own 4.5e-4 gate, and Berny continues on the
numerical gradient when it fails; the Cartesian ladder is the fallback when
Berny cannot finish. The examples, end to end with the Hessian check: 0.1–2.5 s
for every organic and main-group one (benzene 0.8, phenol 2.5, PCl₅ 2.2);
NiCl₄²⁻ and Ni(CN)₄²⁻, which never converged before, now do (1.6 s, 16.8 s —
**the Ni(CN)₄²⁻ figure is void**: its cyanides were then single bonds, and the
H filler had put an H on every C and two on every N; see 2026-10-06 below);
ZnCl₂ 4.7 s (the check sends it to the numerical gradient); ferrocene still
reaches nothing inside the budget. The cyclopropenyl anion: 1.3 s, −7.906788
Eh, a verified minimum. Without the check Berny stops at −7.899336, which is
the planar saddle — the escape then rescues it, so the test pins the check
directly (no escape needed with it): the escape only runs below 16 atoms and
only rescues a false stop that is a saddle.

## MMFF94 retired as a geometry engine; GFN2 alone (2026-10-05)

The decision (user, 2026-10-05): Valence is a valence-bond teaching tool, and
"good enough, quickly" is the bar — the right VSEPR shape, not 1e-4 Eh/bohr.
MMFF94 got too many educationally central small molecules wrong (hypervalent
centres, strained rings, cations). So the local pipeline is GFN2-xTB or,
when GFN2 produces nothing, the labelled unoptimised start; a run that stops
short shows its lowest point, labelled not fully converged. mmff94-ts stays —
it is the charge model and the optimiser's stepping. A fetched structure is
still an MMFF94 conformer, so its parameter-gap and 3-ring-pucker reports stay.

What the move turned up, all measured:

- **OCC's analytic GFN2 gradient is inexact for polar molecules.** Against
  central differences of its own energy (h = 1e-3 bohr; SCF to ~1e-11, so the
  reference is good to ~1e-8): P₄ 1e-7, water 9e-6, SF₆ and CHFCl₂ 6e-5,
  ethene 9e-5, methanol 2.2e-4, the cyclopropenyl anion 4.6e-4 — and 1.0e-3
  where its optimisation stalled (3 400 evaluations at a flat E −7.906788),
  against the 1e-4 gate. Exact for nonpolar, worst for the ion: a missing
  charge-dependent term upstream, worth checking against the Fortran xTB
  oracle and reporting. This, not the start, was the anion's "start-quality
  problem" below. Fix: a third rung, L-BFGS on `energyAndGradient(true, 1e-3)`
  (the engine's numerical gradient, 6N energies each), from the lowest point
  the analytic rungs reached, below 24 atoms. The anion now converges to a
  verified minimum (λmin −3.5e-5) in 15 s.
- **The saddle escape** pushes a converged saddle 0.30 bohr down its imaginary
  mode, both ways, re-optimises, keeps the lower converged point and checks
  again (≤2 escapes). OCC's Hessian rows are ATOM-major (x₀ y₀ z₀ …) unlike its
  gradient — a rigid translation gives |H·t| 5e-7 that way, 1 the other. Pinned
  on linear water with no kick: it converges onto the D∞h saddle, and comes
  back bent with saddleEscapes ≥ 1.
- **409 851 console lines for one run.** OCC prints the SCF table for every
  evaluation straight to stdout — outside its logger, so no log level stops
  it — and `setLogLevel(LogLevel.WARN)` made it four times noisier (the enum
  binding does not map onto spdlog's levels). Fixed with Emscripten's `print`
  hook and `setLogLevelString('warn')`; mmff94-ts's parameter-gap report, also
  printed per rung, is switched off in the worker (it describes a force field
  the worker never evaluates).
- **The start was the cost.** place3D copied ring atoms from the sketch at the
  sketcher's scale, puckered every ring ±0.4, and put each ring CH's hydrogen
  AXIAL; one uniform factor then scaled the unit skeleton. Benzene started
  non-planar with its H's straight up, C–C 2.07 Å and C–H 1.31 Å. Now: each
  bond at its covalent-radius sum (×0.87 double, ×0.78 triple), the sketch's
  ring scaled to those lengths, only saturated ring atoms puckered (±0.25),
  and a trigonal ring atom's H in plane. Benzene 137 → 51 steps (10.0 → 3.5 s),
  pyridine 15.4 → 4.0 s, phenol 14.6 → 11.2 s; water and PCl₅ unchanged.
- **A 30 s budget for the whole run.** The examples' organics and main-group
  cases converge in 0.1–12 s; ferrocene, NiCl₄²⁻ and Ni(CN)₄²⁻ burned 55, 15
  and 118 s to reach nothing from an embedder that knows no metal bonding. Not
  worth chasing — the examples are VSEPR demonstrations, and a metal complex
  gets whatever the budget reaches.
- **The symmetrizer called GFN2's pyridine C1.** At 20 mÅ, a real optimised
  structure's few mÅ of noise admits many near-duplicate operations about
  slightly-off axes; their products never close and the group overflowed
  (54 seeds, no closure — while its heavy atoms alone closed to C2v). It now
  retries at ½, ¼, ⅛ the tolerance when closure fails: pyridine C2v (4.2 mÅ),
  benzene D6h (5.1), stable up to 0.1 Å.

**OCC's native optimiser, measured (same day).** It is Berny (internal
coordinates, model Hessian, trust radius), exposed as a driver: the caller
hands it energy and gradient (`update`, `step`, `getNextGeometry`), so it is
NOT bound to the analytic gradient. From the app's own starts, analytic
gradient: water 8 steps, benzene 6 (0.1 s against the ladder's 3.5 s),
pyridine 9, phenol 9 (0.1 s against 11.2), PCl₅ 9 (0.2 s against 6.8),
butenyne 12 — the same minima to 1e-6 Eh, 30–100× faster. The trap: on the
cyclopropenyl anion the inexact analytic gradient fools Berny's convergence
test — "converged" at −7.899336, 4.7 kcal/mol above the true −7.906790, which
Berny on the numerical gradient reaches in 1.7 s. So: Berny analytic, then a
numerical-gradient check of the converged point, continuing on the numerical
gradient when it disagrees.

Size: upstream's opt bindings also register HessianEvaluator<HartreeFock> and
<DFT> and the XYZ writer, which anchor the HF/DFT/integral code — 2.3 → 14 MB
(gzip 0.76 → 4.7 MB). Trimmed to Berny, its coordinates and criteria and the
core vibrational helpers: 2.4 MB, gzip 815 KB, +55 KB (+7%) over today's
build, Berny results bit-identical to the full build. The trimmed binding and
the CMake source line are in `C:/Users/mccan/Code/occ-win` (upstream's file
kept in the session scratch); not vendored yet.

## VSEPR, audited (2026-10-05)

The domain count and the ideal polyhedra are right (every tetrahedral vector
unit, pairwise cos −1/3; TBP and octahedron exact), AX₃E's equal-angle axis is
right by construction, and AX₂E₂'s l = α(a+b) ± γn̂ does put each lone pair at
109.47° to each bond. The lone-pair placement was wrong in two places,
measured against the ideal polyhedra's leftover vertices:

- **Five and six domains used four-domain rules.** SF₄'s lone pair went
  through the "equal angles to the first three bonds" branch and sat 30° off
  its equatorial site; ClF₃'s two were built from its first two bonds — trans,
  so an arbitrary perpendicular — and also missed by 30°; I₃⁻'s three were a
  tetrahedron around one bond (19.5° off, 70° from the other bond). BrF₅ and
  ICl₄⁻ came out right only for a lucky bond order. Five domains now put lone
  pairs equatorial in the trigonal bipyramid, six put them trans.
- **AX₂E₂ past the tetrahedral angle.** Holding each lone pair at 109.47° to
  each bond pinches the pair together as the bonds open (59° apart at 135°)
  and has no solution past 141° — disiloxane's 144° Si–O–Si drew NaN lobes.
  The pair's half-angle is now the larger of that rule's and half the bond
  angle; the two agree at 109.47°, so water (104.5°) is unchanged to the
  digit and a wide angle opens the pair with the bonds, reaching the linear
  branch's ±n̂ at 180°. The lone pairs stay equivalent (the didactic choice
  recorded below). An ether at 111.7° moves from 107.2° to 111.7° between its
  lone pairs.

## The MO display, audited (2026-10-05)

The isosurface is the computed orbital: ∫ψ² over the drawn grid is 1.000
(within 0.2 %, the shortfall a diffuse LUMO's tail past the box) for
canonical and localized orbitals on ethene, SF₆ (sulfur 3d included) and P₄ —
the coefficients, the S they are normalized in and the amplitude the surface
evaluates are one set of functions. The marcher's six-tetrahedron split is
consistent between neighbouring cubes, every two-inside quad is cut on the
diagonal that tiles it, normals are −sign·∇ψ on both sheets, and the field
and mesh caches clear with the molecule.

**The AO view's sizes.** An s contribution was a sphere of 0.15–0.34 Å, and a
ball-and-stick atom is 0.3 × vdW — hydrogen 0.36 Å, carbon 0.51 — so every s
sat wholly inside its own atom and no s contribution was ever visible: water's
3a1 drew its O 2pz and nothing of the O 2s or either H 1s. The s sphere is now
1.15–1.7 × the atom's own sphere, and the p/d lobes run 0.8–1.7 Å (they were
0.55–1.23, which a weak p barely cleared on carbon). d_z²'s equatorial collar
is drawn at half the axial lobes' size, as its angular factor (−1 against +2)
says; its comment had called it a torus.

## The charge model, audited (2026-10-05)

The equations are right. The BCI charges are mmff94-ts's eq. 15 of Halgren
part V, q_i = (1 − α_i·crd_i)q⁰_i + Σ_k α_k q⁰_k + Σ_k ω_ki, with the
neighbour's α on the shared term; spot-checked against MMFF94's own values
(water O −0.86/H 0.43, benzene ∓0.15, pyridine N −0.62 and Cα +0.16, ethene
C −0.30), each molecule summing to 0 exactly. The dipole is Σ qᵢ(rᵢ − r_com)
with the centre-of-mass origin an ion needs, 1 e·Å = 4.80320 D, and the drawn
arrow −p̂ toward δ−. Water's 2.42 D against experiment's 1.85 is the BCI point
charges' known overestimate, not a bug — the label says charge model. The ESP
is V = Σ qᵢ/rᵢ in e/Å, which only the colour reads.

**One real bug, in the ESP surface's grid box.** A fixed 2 Å pad, and a
point count of ceil(L/h) that could leave the last grid point a whole step
short of it: the far side's real margin was as little as 1.75 Å. Every
element with a vdW radius past that (I 1.98, Si 2.10, Br 1.85, P and S 1.80,
the alkali metals) had its outermost sphere cut open by the box — I₂'s
surface had 238 open edges and 199 grid-face points inside it, SI₂'s 128.
The pad now covers the largest radius present plus a step, and the count
has the +1. The 0.35 Å distance floor in V never acts on the surface (every
vdW-union point is at least one vdW radius from every nucleus); its comment
now says so.

## Pipek–Mezey, audited (2026-10-05)

The equations are right. Rotating i′ = c·i + s·j makes n_A(i′) = m + d·cos2θ +
q·sin2θ with q the SYMMETRIZED cross population — Pipek & Mezey's
Q_st = ½Σ(c_μs c_νt + c_μt c_νs)S_μν, which is why the code averages the two
row-wise values — so the pair objective is Σ[(d²+q²) + (d²−q²)cos4θ +
2dq·sin4θ], maximized at 4θ = atan2(2Σdq, Σ(d²−q²)): the code's angle, and
the literature's sin4α = B/√(A²+B²), cos4α = −A/√(A²+B²).

Measured on twelve molecules (the snapped examples and the DFT minima): the
occupied density matrix is unchanged to 3e-15, both blocks stay S-orthonormal
to 1e-14, L rises every time (benzene 2.24 → 7.33), and after the
Hamiltonian's flat-pair pass no pair would rotate by more than 1e-12 — the
pass keeps L (it only turns pairs whose per-atom populations do not move)
and, measured, leaves a true stationary point. The pictures are the
textbook ones: water 2σ + 2 LP, ethyne σ + 2π, benzene and naphthalene
Kekulé π, SF₆ 6σ + 18 F lone pairs, CHFCl₂ 4σ + 9 halogen lone pairs.

**One real bug, in the σ/π typing of a p-rich bond.** `pPointsAlongBond`
weighted each p AO's Mulliken weight by its own axis's projection² on the
bond. That is rotation-invariant only for a bond along a coordinate axis: a p
hybrid pointing straight down a bond along (1,1,1) scored Σu⁴ = 1/3, under the
0.5 cut, so a σ bond would be called π. Every planar π system is immune (its
p is all perpendicular, 0 either way), and CHFCl₂'s C–X antibonds read
0.30–0.38 against a true 0.00–0.06 but stayed under the cut; none of the
twelve changed verdict. P₄ (DFT minimum) is the case that bites: each P is
0.866 p in a bond, past the 0.85 gate, and five of the six tetrahedron edges
came out π — only the edge that happened to lie near a frame axis read σ. It
is now the projection of the atom's p vector, (c·û)²/|c|², and P₄ is 6σ +
4 LP. The sign rule's tie between a π*'s equal and opposite
coefficients is settled deterministically, as in the canonicalizer.

## Irrep labels, audited: four families named wrong (2026-10-05)

The second half of the EH audit, the symmetry side. The machinery is right:
D(g) carries a p orbital along Rû (the source axis, not the target), the 5×5
d block is the quadratic forms' R M Rᵀ projected back with the right
normalizations, and χ = Σ ψᵀ S D ψ over a degenerate set is the trace whatever
mixture the solver returned. The *naming* treated every group as axial, and
four families are not. Checked on wB97X-D3/def2-TZVP minima
(tests/references/dft — PubChem 3D is not trusted for this, and an embedder's
geometry is only approximately symmetric):

- **D2h / D2.** Named like an axial group: ethene came out a1g, a2u, b1g…,
  symbols D2h does not have, and never a b3. Now Mulliken's 1955 axes (x ⊥
  plane, z the in-plane C2 through the most atoms; the same convention water's
  b1/b2 already followed): ethene ag, b1u, b2u, b3g, ag, b3u (π), π* b2g.
  Naphthalene's z is then the short axis (through C9, C10), HOMO au. A tie in
  the atom count (diborane) is left a bare b.
- **Oh.** A2 is antisymmetric under C4 and was called b (cubane's a2u). T1/T2
  were read off the parallel mirror through the most atoms, which in SF₆ is the
  σh class, under which T1 and T2 have the same character: every t1u read t2u,
  every t2g t1g. Now the C4 decides (never Oh's S4, which flips sign between
  g and u); Td uses its S4. SF₆: a1g t1u eg a1g t1u t2g t2u eg t1u t1g, the
  textbook set with the 1t1g HOMO.
- **D2d / S4.** A/B is the S4's character, not the C2's: allene's b2 orbitals
  were all a. Same for S8 and D4d (whose E1–E3 are numbered by the S8).
- **Cs.** ′/″ only looked at a mirror normal to the frame's z. Methanol's
  happens to be (so its test passed before the fix too). CHFCl₂'s is not —
  the two Cl straddle the mirror and its normal lands on the frame's y — and
  every orbital came out a bare a; it is the regression test. Fixing ′/″
  exposed a second Cs fault: with no axis, the "mirror containing the
  principal axis" was tested against the default z, and CHFCl₂ read a1′/a2″.
  A parallel mirror now needs a principal rotation.

The detector had a latent cousin: for D2d it took the first C2 as the
principal axis, and a perpendicular one makes the σd neither σh nor σv — D2.
Not reproducible on allene (its terminal carbons put the S4 axis first in the
candidate list) but now the S4's axis is used whenever C2 is the highest
proper rotation.

The canonicalizer is a point-charge second moment (each AO weighted by its
nucleus's x²), so it cannot rotate a set whose AOs share a centre or an x² —
a lone atom's p shell stays as the solver returned it. Methane's t2 comes out
px/py/pz-like (C coefficients 0.54 on one axis, ≤0.05 mixing) only because
the spherical top's arbitrary frame put one C–H on x; I first claimed it
would not, and the measurement said otherwise. Display only; documented, not
changed. Its sign rule ("largest coefficient positive") now takes the first
AO within 1e-6 of the largest, so a tie between symmetry-equivalent atoms is
not settled by rounding noise.

## Extended-Hückel equations, audited (2026-10-04)

A line-by-line check of the EH equations against the literature and against
independent numerical integration (prolate-spheroidal quadrature, written
fresh, sharing nothing with `slater-overlap.ts`). Confirmed correct: the A/B
auxiliary recurrences as derived, the Mulliken–Rieke–Orloff radial sum for 1s
through 6p with s/p/d and σ/π/δ (14 cases agree to 1e-8 or better; H₂ at
1.4 bohr gives 0.752943 = e⁻ᴿ(1+R+R²/3)), all 25 d-rotation entries (rederived
from the real d functions' quadratic forms in the bond frame), the σ/π sign
convention, the Wolfsberg–Helmholz form, the Cholesky reduction of Hc = εSc
and the Jacobi rotations, the STO normalization and angular factors of the
isosurface, and the norm of the contracted d coefficients (Sc, Ti, Mo, Ta, Lu
all 1.0000).

**One real bug: the B_n recurrence.** B_n(ρ), ρ = (ζ₁−ζ₂)R/2, was built by the
upward recurrence, which divides by ρ at every step; its error grows like
(n−1)!/ρ^(n−1). For light atoms the worst seen was 3·10⁻⁸ (P/C), invisible.
For heavy atoms whose s and p exponents nearly agree it was catastrophic: Zr
5s/5p 0.692 against an exact 0.295, Au 6s/6p 6.8·10⁷, Hg₂ S(6s,6pz) = 1.9·10⁸,
Re₂ 3.0·10⁶. S then lost positive-definiteness and the solver refused Hg₂, Au₂,
Re₂ and Zr₂ — a numerical refusal dressed as a chemical one, and Re₂Cl₈²⁻ is
the textbook δ bond. The YAeHMOP fixtures never reached it (light atoms, PCl₅,
one Fe). Now B_n is always the power series
Σ_k (−ρ)^k/k! · (1 − (−1)^(n+k))/(n+k): only n+k odd survives, so every term of
one B_n has the same sign and nothing cancels — full precision for any ρ,
checked against direct integration from ρ = 0 to 40, n ≤ 13.

**Helium counted 0 valence electrons.** The EH filling gave HeH⁺ no electrons,
and VSEPR's `|| 4` fallback (0 is falsy) read He as four electrons, an sp
centre. He is now 2: HeH⁺ fills one bonding orbital, a He atom is a pure s.

## The optimiser is the library's, not ours (2026-10-02)

The GFN2 tier's stepping was a hand-rolled steepest descent with backtracking
(0.1 Å trust region, 300 steps, max|g| < 1e-4). The arrangement recorded on
2026-09-30 was different — "mmff94-ts's optimiser driving OCC's forces" — so
the shipped loop was a lapse, not a decision. It is replaced by the library's
optimisers through their `EnergyGradientFn` oracle:

    optimize_lbfgs(mol, oracle, { max_iterations, criterion: 'max', gradient_tolerance })
    optimize_steepest_descent(mol, oracle, { ..., initial_step_size: 0.1 })

L-BFGS is the first rung, the library's steepest descent at a bounded step the
fallback — its own documented answer to "a pathological starting geometry".
Which rung earns its place is measured, not assumed (same start: embedder →
scaleSkeleton → breakSymmetry; same stop: max|g| < 1e-4 Eh/bohr = 0.1186
kcal/mol/Å in the library's unit):

| start | L-BFGS | SD @ 0.1 Å |
|---|---|---|
| water | 24 it, 185 calls, 157 ms, E −5.070544 | 26 it, 183 calls, 139 ms, same E |
| PCl5 (pipeline) | 30 it, 289 calls, 5.2 s, E −25.386585 | 34 it, 202 calls, 2.2 s, same E |
| PCl5 (test fixture: five 1.6 Å bonds) | **fails**: 12 223 calls, E −29.19 (3.8 Eh *below* the true minimum) | 9 it, 46 calls, 1 s, E −25.386587 |
| cyclopropenyl cation | 67 it, 373 calls, 970 ms, planar 0.001 Å | 55 it, 412 calls, 758 ms, planar |
| cyclopropene | 98 it, 792 calls, 2.1 s | 140 it, 1052 calls, 3.0 s |
| cyclopropyl cation (app start) | **converged**, 251 it, 1946 calls, 4.6 s, E −8.396303 | fails: 300 it cap, maxGrad 2.79 |
| cyclopropenyl anion (app start) | fails: 300 it, 10 017 calls, 23.6 s | fails: 53 it, 408 calls, 1.1 s |

Neither rung alone covers the app: the hand-rolled loop stalled on the
cyclopropyl cation (300 steps, unconverged) and the library's L-BFGS — fast and
correct on the app's real starts — walks off a far-off one. The ladder covers
both, at the cost of one wasted run on the hard starts.

Four integration details, each measured:

- **Units.** The engine's gradient is Eh/bohr, the library's kcal/mol/Å
  (×627.509474/0.529177 = 1185.82). The stop is expressed in the library's
  unit, so the app's convergence claim does not change. The oracle's energy
  container carries OCC's total in hartree with the six MMFF94 components zero:
  OCC's decomposition does not map onto them, and only `total` is read.
- **The engine fails on some trial geometries.** A wild line-search trial can
  fail the SCC, and the analytic gradient throws outright when the multipole-on
  SCC does not converge (measured: 2 of 289 calls on PCl5). The library has no
  failure channel, so a failed evaluation returns a *sentinel*: 1e9 Eh with a
  zero gradient — the line search rejects it and backtracks. A cleverer first
  attempt (the last valid energy plus 1 Eh, carrying the last valid gradient)
  was worse: an α-independent wall poisons the zoom's cubic interpolation, and
  PCl5 wandered for its full 300 iterations to E −25.2936 instead of converging
  in 30 to −25.386585.
- **The engine can lie, and the optimiser believes it.** On the far-off PCl5
  fixture the SCF returns a spurious solution 3.8 Eh below the true minimum
  (max|g| 1242 kcal/mol/Å) and L-BFGS follows it off the cliff — the failure
  mode the old loop's header warned about. The oracle therefore rejects any
  evaluation more than 1 Eh below the best seen (a real step in a
  connectivity-preserving optimisation never drops that far; ~627 kcal/mol).
- **Hostile starts must be bounded, and rejections are not the whole cost.**
  Abort budgets per rung: engine failures 15/30, spurious drops 5, oracle calls
  2 500/1 500 (L-BFGS/fallback). The call budget is the one that holds: the
  cyclopropenyl-anion start wastes its time in *valid* evaluations (10 017 L-BFGS
  calls for the same unconverged energy the fallback reached in 408), and the
  app's legitimate rungs measure 185–1 946 calls. Each rung gets a **fresh
  calculator**: the first rung's thrash leaves the SCF warm start on whatever it
  last touched, and the fallback must begin from the molecule, not that state.

Charges and the Hessian verdict are read after one re-evaluation at the returned
geometry — the library's last oracle call can be a rejected trial — which
retires the `cachedAt` alignment guard the old loop needed (one SCF out of
hundreds).

Cost: importing the library into the GFN2 worker grows that chunk to 340 kB
(the optimiser statically imports its own energy/gradient machinery). The worker
is lazy and sits next to 2.26 MB of wasm, so this is acceptable — but it is a
real number, not a rounding error.

Known, measured limitation: the cyclopropenyl anion still does not converge from
the embedder's start in either rung (both stall near E −7.886, maxGrad 0.30–0.66
against the 0.1186 gate), so the pipeline falls back to MMFF94 and says so. The
engine *can* do this species — a single point and a Hessian run fine at the
user's ORCA geometry (the planar form is a saddle, −0.162 and −0.128 Eh/bohr²) —
so this is a start-quality problem (the parked multi-seed idea), not an
optimiser one.

## The 3-ring repair is gone; a Hessian verdict takes its place (2026-10-02)

`restoreThreeRingPlanarity` was deleted outright — not moved, not gated. It
projected the exocyclic substituents of sp² ring atoms back into the ring plane
after both engines, correcting a genuine MMFF94 parameterization artifact (no
reference angle for a trigonal ring carbon's substituent; measured 2026-09-28:
all three C–H of the cyclopropenyl cation ~54° out of plane). Three
measurements decided it:

- On every *converged* GFN2 geometry the projection was a no-op — max shift
  0.0001 Å (cyclopropenyl cation), 0.0019 Å (cyclopropene), 0.0000 Å
  (cyclopropane). The engine was already the authority for the tier that
  matters; the call was dead weight.
- It could override the engine. GFN2 leaves the planar cyclopropenyl anion
  saddle and pyramidalizes one carbon by 1.15 Å; the projection flattened it
  (max shift 1.42 Å), because its gate reads the *drawn bond graph* (which
  carbon carries the formal charge, where the Kekulé double bond sits) while
  the pyramidalization is a property of the converged structure. For a
  delocalized antiaromatic ring that assignment is arbitrary, and the gate
  pointed at the wrong carbon.
- It was a post-SCF geometry change — the charges/geometry mismatch recorded in
  the entry below.

What replaced it is a *report*: `src/geometry/ring-pucker.ts` finds 3-rings,
classifies ring atoms with the same charge-aware sp² test
(`chem/vsepr/hybridize`), and when an exocyclic substituent of an sp² centre
sits more than 0.25 Å out of the ring plane (the artifact measures 0.83–1.00 Å;
a genuine sp² centre sits within hundredths) the Info log says so and names the
remedy. It runs only when the geometry did not come from GFN2. sp³ ring atoms —
cyclopropane's CH₂, a 3-ring carbanion C⁻ — are never flagged: their
out-of-plane geometry is real.

**And a converged run now reports its curvature.** A gradient-based stop cannot
tell a minimum from a saddle — the planar cyclopropenyl anion has zero gradient
too — so the worker computes one numerical Hessian at the returned geometry
(`XtbCalculator.hessian`, bound in the vendored build; 6N gradient evaluations,
measured 45 ms at N=3, 182 ms at N=8, 653 ms at N=13, 3.1 s at N=21; skipped
above 16 atoms) and reports the lowest eigenvalue. Below −0.02 Eh/bohr² the app
says "converged to a saddle, not a minimum". The threshold is measured: the
finite-difference noise floor is ±0.003 and step-independent (0.002/0.005/0.01
give the same spurious negatives on water — the same size as water's smallest
real mode, 0.0049), while the planar anion's imaginary modes sit at −0.162 and
−0.128, an order of magnitude clear. Displacing along that eigenvector lowers
the energy by 4.15 kcal/mol at 0.30 bohr, both signs; GFN2's own bent minimum
is 39.7 kcal/mol below the planar point (ORCA: 34.5 kcal/mol). The engine sees
the saddle and points at the escape direction — what is still missing is an
optimiser that acts on it (mode-following), parked for later along with
CalcFC/CalcAll-style curvature in the step rule.

## GFN2-xTB charges, offered beside the MMFF94 model (2026-10-02)

The vendored engine always could report per-atom charges — the `charges`
binding survived the wasm trim (checked in the shipped bytes: the name is
present, `toWavefunction`/`fromCrystal`/`fromXyzString` are not) — and the
geometry tier now carries them back with the optimised structure, so the
Charge Model control in the Analyze tab can draw either model's numbers as
charge labels and as the ESP surface. The dipole arrow stays on MMFF94: its
readout and caveats are phrased for that model, and mixing an MMFF94 arrow
into a GFN2 charge picture is the kind of quiet inconsistency this app avoids.

What the numbers are: `q_shell = ref_occ − Mulliken_pop` on GFN2's valence STO
basis, summed per atom (`XtbResult.atomic_charges`) — the `q` column the
Fortran xTB prints. Not ESP/RESP/CHELPG, not CM5/Hirshfeld/Voronoi, and not
comparable in magnitude to the BCI model. Measured on the geometry the oracle
test pins (E = −5.070324844258175 Eh, matching the README's pinned value to
every printed digit):

    water    O −0.563587305   H +0.281793653   H +0.281793653   Σ = −2.7e−15
             shells: O2s +0.259076237, O2p −0.822663543, H1s ×2
    OH⁻      O −1.033035      H +0.033035                      Σ = −1.000000
    H₂O⁻     (charge −1, one unpaired electron)                 Σ = −1.000000

Same geometry, both models (BCI vs GFN2) — the disagreement is the reason to
show them side by side, not a rounding difference:

| molecule | MMFF94 BCI | GFN2 |
|---|---|---|
| water | O −0.860, H +0.430 | O −0.564, H +0.282 |
| benzene | ±0.150 | ±0.030 |
| phenol ring | all C −0.150 | −0.071 … −0.031 |
| PCl₅ | P +1.580, Cl −0.316 ×5 | P +0.279; axial Cl −0.167, equatorial +0.019 |
| SF₆ | S +0.486, F −0.081 ×6 | S +2.493, F −0.416 ×6 |

BCI is a bond-increment model: it types all five PCl₅ chlorines alike (on
generic parameters for a 5-coordinate P) and cannot see the axial/equatorial
split GFN2 resolves. GFN2's Mulliken charges are compressed for organics and
their hypervalent magnitudes (S +2.5) are the usual basis-dependence, not
chemistry.

**The gotcha that shaped the code.** The engine caches the SCF result of the
last geometry it evaluated, and the optimiser's backtracking line search
evaluates trials it then rejects — so after a failed step the cache sits on a
trial geometry, not on the accepted point the function returns. Charges read
there would be silently wrong for the returned structure (the same class of
error the whole pipeline exists to avoid). The worker therefore tracks where
the cache points (`cachedAt`) and re-evaluates the accepted point once when
they differ (one SCF); charges are handed back only when the cache and the
returned geometry are the same point, and null otherwise. `Gfn2Result.charges`
is `number[] | null` for that reason — a wrong-geometry array is worse than
none.

**Known approximation:** the charges describe the geometry the engine finished
at. `snapToSymmetry` then moves atoms by up to ~20 mÅ, so the displayed
coordinates and the charges are not the same point to the last digit.
Re-running a single point after the snap would close that gap for one more SCF;
not done, because the snap is noise-level by design.

## Layout: one folder per method (2026-09-29)

The chemistry outgrew a flat `src/chem/`. It now reads as the app's arc, one
folder per method, with the files inside naming the action:

    chem/vsepr/               hybridize, ideal-vsepr-vectors,
                              orient-lone-pairs, orient-pi, assign-orbitals
                              — the Lewis-like picture
    chem/charge-model/        bci-charges, dipole, esp — the displayed
                              partial charges (MMFF94 BCI or, for a
                              GFN2-refined structure, the engine's own) and
                              what they feed
    chem/extended-huckel/     the MO solver (PLAN.md Phase 2)
    chem/localized-orbitals/  PM localization of the EH MOs (Phase 4)
    chem/                     radii, assign-mass, kekulize-smiles,
                              fill-hydrogens — shared tables and graph fixes

`geometry/` stays the structure pipeline that *consumes* VSEPR directions
(fetch → validate → embed → refine → stereo), and `render/` keeps naming
after what it displays — with one rule for later: when a second orbital
picture lands (MO lobes), disambiguate by model (`hybrid-orbitals.ts` /
`mo-lobes.ts`) rather than by adjective.

The charge model earned a module of its own in the same pass:
`resolveCharges` / `chargeModelResult` moved out of `dipole.ts` into
`bci-charges.ts`, because the dipole, the charge labels and the ESP all read
those same resolved numbers and share the one refusal rule — the dipole file
is now just the dipole's physics.

Entries above/below written before 2026-09-29 name the old paths:
`chem/esp.ts` → `chem/charge-model/esp.ts`; `chem/dipole.ts` →
`chem/charge-model/{bci-charges,dipole}.ts`; `chem/hybridize.ts`,
`chem/ideal-vsepr-vectors.ts`, `chem/orient-lone-pairs.ts`,
`chem/orient-pi.ts`, `chem/assign-orbitals.ts` → `chem/vsepr/…`.

## Sulfur diiodide's lone pairs were δ bonds (2026-09-30)

The surfaces are fine. On PubChem's SI₂ (CID 20583912, S–I 2.34 Å) the HOMO
at the 0.04 contour puts about 163k vertices on iodine and 89k on sulfur, and
the iodine ones sit well outside the ball-and-stick sphere (display peak 0.50
on I, 0.82 on S). The localized S–I σ bonds at 0.10 draw both ends. I₂ (CID
807) draws too. The radial power and the per-shell peak scaling were the
picture; what was still wrong was the label, and it is why SI₂ looked worse
than SF₂.

An iodine lone pair localizes to **0.90 on I and 0.10 on S, and that 0.10 is
sulfur's 3d**. It misses the 0.90 lone-pair gate by a few hundredths. The bond
test then accepts anything over 0.02 on the neighbour, and the metal rule —
"majority d, so type by the d shape" — names it. xy and x²−y² come out δ, xz
and yz come out π. SF₂ never reaches that rule: its fluorine lone pairs are
0.95 and up, so the 0.90 gate catches them. SCl₂ loses one sulfur lone pair
(called π, off the chlorine 3d tails). SBr₂ and SI₂ lose four halogen lone
pairs each. PCl₅ does the same to three chlorine lone pairs, two of them
labelled σ because the phosphorus d that caught the tail was z². Lewis SI₂ is
two σ bonds and eight lone pairs; the list was two σ, four lone pairs, two δ
and two π.

Two separate mistakes, both in the typing:

- The d-shape rule is for a valence d shell, n one below the s. avo_ibo stops
  at Z 21–30; extending it to every element that has a d function pulled in
  Si, P, S and Cl, whose 3d is polarization on the same n as the s. A sulfur
  3d tail is not a δ bond. Ferrocene and [Ni(CN)₄]²⁻ are unchanged — their d
  is the valence shell.
- With that d set aside, the neighbour's remaining share is a percent or two,
  under the 0.10 a second centre has to carry. The orbital is a lone pair, and
  the centre list no longer reads "lone pair I–S".

I₂ had the other hole in the same test. Its bond is two 5p orbitals along the
axis and almost no s, so both atoms clear the "mostly p, therefore π" gate.
The bond direction breaks the tie: p density along the axis is σ, across it is
π. N₂ and ethene keep their π bonds. I₂ is one σ and six lone pairs.

## One isovalue has to draw every shell (2026-09-30)

The smooth surface was a contour of the true Slater amplitude. That amplitude
is normalized, and the peak of a normalized shell falls as the orbital spreads
out. Measured on a unit valence orbital, |ψ| at the radial maximum:

| shell | peak |
|---|---|
| H 1s | 0.84 |
| F 2p | 0.78 |
| C 2p | 0.43 |
| Cl 3p | 0.32 |
| S 3p | 0.27 |
| Br 4p | 0.23 |
| I 5p | 0.19 |
| Si 3p | 0.18 |
| Fe 4s | 0.11 |
| K 4s | 0.035 |

An absolute 0.20 is inside a fluorine lobe and above the whole of an iodine
5p, a silicon 3p, and every alkali 4s. The localized default of 0.10 did the
same inside one orbital: an SF₆ σ bond peaks near 0.51 on fluorine and 0.04
on sulfur, so the surface was a fluorine lone pair and the sulfur end was
absent. Diborane's bridge did the same to boron. The knob could not fix it —
the level that reveals the large atom inflates the small one past recognition.

The picture now divides each basis function by its own peak before taking the
contour, so the panel's number is a fraction of a full atomic orbital. A
coefficient of 1 reaches 1 on hydrogen and on iodine; 0.20 is a fifth of
either lobe, and both ends of the S–F bond are on the surface at 0.10. The
overlap integrals are untouched — they still use the true normalization, which
is what the populations and the localization are built on. The shape of each
shell (where the lobe sits, how far it extends) is the Slater shape it always
was. What changed is the vertical scale, which is what made the sizes
incomparable.

The two phase sheets are also taken from ψ = +c and ψ = −c separately. A
march over |ψ| misses the node when one grid edge has both samples above the
contour: |ψ| looks inside at both ends, the dip through zero is invisible, and
the lobes fuse.

## Zinc chloride's ten core electrons (2026-09-30)

Zn and Cd are s+p only, and the d¹⁰ shell is core. The valence table still
carried Nvalen's 12, which counts those ten d electrons. ZnCl₂ then had 26
electrons in a 22-orbital basis and the filling stopped one orbital into a
degenerate pair at −9.001 eV, so localization was refused and the VSEPR count
read octahedral. The bonding valence is 2. With it, ZnCl₂ has 16 electrons,
two Zn–Cl σ bonds, and a linear zinc.

## How Avogadro2 does it, and what to steal (2026-09-30)

Read from the local checkout (`~/Code/third-party/openchemistry/avogadrolibs`,
core library; the app and plugin repos are beside it). Numbers verified in the
source, not from its documentation. The short version: **the same physics, a
different division of labour — they use a coarse grid and smooth the mesh, we
use a fine grid and no smoothing.** That single difference explains most of the
rest, including why our per-surface cost is 0.3-1 s and theirs is not.

| | Avogadro2 | Valence |
|---|---|---|
| field | Gaussian `Σ cφ`, analytic GTO normalizations, exponents factored into 1D tables, per-shell cutoff spheres that skip unreachable grid blocks | Slater `Σ cφ`, each AO divided by its own peak for display |
| grid | **fixed spacing in Å**: presets 0.50 / 0.35 / 0.18 / 0.10 / 0.05, or Automatic `0.02·N_atoms^(1/3)` clamped to [0.05, 0.5]; padding 5 Å | step from an evaluation budget (≤4M, ≥0.1 Å), pad grows with the diffuse reach |
| contour | **flying edges** (Schroeder 2015), 4 passes, vertices shared by construction, normals interpolated from a gradient cube | marching tetrahedra, one pass per phase sheet, normals from analytic ∇\|ψ\| |
| smoothing | Laplacian, 1 pass in the orbital plugin, presets up to 9, generator default 6 | none |
| threading | mesh in a `QThread`; the **field** split into x-slabs over `QtConcurrent`; cancellable | main thread |
| isovalue | **absolute**, default 0.03 (MO plugin) / 0.025 (surfaces); spinbox 0.0001–0.999, step 0.001, 4 decimals | a fraction of each AO's own peak; 0.04 molecular, 0.10 localized |
| phases | two meshes at ±iso, the negative one with reversed winding | one field, two sheets marched separately |
| caching | the **Cube** per (orbital, electron type, resolution) — an isovalue change re-meshes without re-evaluating; HOMO/LUMO neighbourhood precalculated, priority rising with distance, range 10 | the finished **surface** per orbital, cleared whenever the isovalue changes |
| rendering | VBO + Blinn-Phong, front/back two-pass culling for translucency; also a second, unrelated strategy: GPU volume raymarching (150 steps, R32F 3D texture) | three.js, our own translucency scheme |

**The isovalue finding matters most.** Ours is the unusual choice: every
implementation checked here is absolute in bohr^-3/2 with a user control, which
is what this app used to do — and their 0.03 against our old 0.04 is not a
coincidence, both are ~20% of a typical valence peak. So the reviewer's per-AO
scaling is a *deviation from the mainstream*, taken to fix a real problem (an
absolute 0.20 is inside a 2p and above an entire 5p) that other programs answer
by asking the user to move the slider. Worth keeping in mind when comparing our
pictures to anyone else's: ours is a picture of coefficients, theirs of |ψ|.

**MOrbVis** (`~/Code/third-party/morbvis`, TS + React + three.js, cloned
2026-09-30). The closest analogue to us: a browser MO viewer, though its MOs come
from Molden/Cube files, not from its own solver.

- Field on the **GPU**: one 1D WGSL kernel (`src/shaders/mo_eval.wgsl`,
  `@workgroup_size(256)`), 5 bindings (48-byte uniform, shells, primitives, MO
  coefficients, field), read back through a `MAP_READ` staging buffer, buffers
  destroyed after. CPU fallback is **one** worker for the whole grid (no pool),
  and `setTimeout(…, 0)` on the main thread if Workers are missing.
- Grid: `autoGrid(shells, 60, margin 3.0)` — isotropic spacing from the *longest*
  bbox axis, so a bigger molecule gets a coarser grid; options 40…200, 200
  disabled on CPU.
- Contour: Bourke marching cubes, main thread, **no welding**, normals from a
  central-difference gradient taken at the nearest grid node. Cheap because the
  grid is 216k cells at the default 60.
- Isovalue **absolute**: 0.04 (MO) and 0.005 (density), chosen from five buttons
  each, not a slider.
- Cache: `Map<moIndex:gridPoints, {field, grid}>` — retained across **isovalue
  and opacity** changes (opacity does not even re-march), meshes never cached,
  cleared only on a new molecule. **No prefetch.**
- Render: three.js BufferGeometry, depth pre-pass (renderOrder 10 colourless
  depth, 11 colour) — our own ESP trick — DoubleSide, `nSign` normal flip for
  the negative lobe, no smoothing or decimation.
- Benchmarks exist as live harnesses (60→200, MO and density, CPU worker vs GPU,
  benzene STO-3G/6-31G*/cc-pVTZ) but **no committed numbers anywhere**.

**IBOView** (`~/Code/third-party/ibo-view.20211019-RevA`, source release, read
2026-09-30). Its isovalue is the interesting part.

- **Relative is the default: 80 % of the integrated weight.** `comboBox_IsoType`
  (Absolute | Relative) + `doubleSpinBox_IsoThreshold` = 80, and
  `FIsoSurfaceSettings(IsoType = ISOTYPE_Relative, fIsoValue = 0.8, …)`
  (`IvIsoSurface.h:81`). `GetAbsoluteIsoThreshold` (`IvVolumeDataSet.cpp:742`)
  sorts grid values by integrated weight, accumulates, and returns the level
  whose enclosed weight reaches the fraction — i.e. *the surface that encloses
  80 % of the electron*. Absolute is real too (`ISOTYPE_Absolute`,
  `IvDocument.cpp:2862`).
- **It scales the LEVEL, never the field.** The drawn surface is a true
  isosurface of the true |ψ|, at a level chosen by a physical rule — which is
  exactly the property our per-AO peak division buys by distorting the field.
  This is the fix worth copying.
- Contour: `TraceIsoSurface` (`IvIsoSurface.cpp:714`) marches **slice by slice**,
  holding two data layers, and calls the evaluator through a **callback** — the
  volume is never materialised. Geometry is **indexed (welded)** via
  `ConvertToIndexed`, and `FixVolumeDataNormals` (`:279`) inverts triangles whose
  front side faces inward: a fourth independent solution to the outward-normal
  problem (Avogadro reverses winding, morbvis flips the gradient, we take −∇|ψ|).
- Grid: box padding = 2× the step (`:142`), `nPts = 1 + length/step` (`:160`),
  step = `1/(ToAng · linearDensity)` (`:400`) with the UI default **20** ≈
  0.0945 bohr ≈ **0.05 Å** — twice as fine as our 0.1 Å floor, affordable
  because the field is never stored.
- **Tracing is a user action** ("Trace active/all iso surfaces", a Rebuild
  button), not a live re-trace — a fourth caching philosophy.
- Transparency: **depth peeling by default** (`TRANSSTYLE_DepthPeeling`,
  `IvView3D.cpp:88`, 8 layers), the correct answer to drawing several
  translucent lobes at once — the problem we solve with one alpha pass.

**A provenance correction, and it matters.** IBOView does **not** ship the
`LP / LP-s / σ / π / δ / 2e3c / Deloc` classifier. Searched: every `2e3c` in its
source is a *two-electron-three-centre integral* (`IrCore/Ir.h:369`), and the
only related flag is `MakeAntibonds` (`IvIao.cpp:356`). It computes IAO/IBO
bases and displays them. The vocabulary and its gates are **avo_ibo's** — the
user's own project — written from Knizia's how-to-read-IBOs guidance
(`examples/how-to-read-ibos.md`), and that is what our classifier was ported
from. So the four deviations are departures from *avo_ibo's implementation*,
with no upstream program behind it to check against. And the inherited rules
contain **no treatment of a main-group d** — the gap our minimal-basis d exposed
is documented nowhere upstream, which is the confirmation of the basis-artifact
reading above.

**What to steal, in order of payoff.**

1. **Cache the field, not the surface.** Their cube survives an isovalue change
   and a re-render is only a re-mesh; ours re-evaluates the whole field because
   the cache key is the finished surface and the isovalue clears it. This is the
   single biggest win available, and it makes (2) possible.
2. **Precalculate around the HOMO/LUMO with priorities.** A chemist clicks near
   the frontier; precomputing ±5 levels (their `precalcRange` default) hides the
   extraction cost for nearly every click.
3. **Get the extraction off the main thread.** They run the mesh in a `QThread`
   and the field over a thread pool, cancellably; we freeze for up to a second.
4. **Evaluate only what can contribute.** Per-shell cutoff spheres plus factored
   1D exponentials; our evaluator does a full Slater per AO per grid point.
5. **Resolution escalation** — show the finest cube already in hand while a
   better one computes. Their code does this for a first look at an orbital.
6. Skip their Laplacian smoothing, deliberately. It buys smoothness by moving
   vertices off the true contour with no re-projection, and our grid is already
   four times finer than their default — we would be trading accuracy for a
   problem we do not have.

**Where we are level or ahead.** They solve the negative-lobe normals by
reversing the winding, we by taking outward as −∇|ψ| — the same idea twice.
Both interpolate normals from the field gradient, both share vertices by
construction (no welding in either), both refuse to silently drop an orbital.
Our default grid is 0.1 Å against their 0.18-0.35, which is why we can skip the
smoothing they need. And one thing neither has: a per-view isovalue, so the
molecular and localized pictures can disagree about level.

## Why the classifier needed new rules: a valence 3d is a basis artifact (2026-09-30)

Asked whether the classifier's four deviations trace to the app putting d
orbitals in the *valence* shell while the classifier was lifted for an s/p
world. Three of the four do, exactly, and it is worth writing down because it
will recur.

**What our basis hands the classifier.** Weight of a neighbouring atom's d in
an occupied localized orbital, measured here:

| molecule | orbital | neighbour | its share | of which d |
|---|---|---|---|---|
| SI₂ | an iodine lone pair | S | 10.5 % | 100 % |
| PCl₅ | a chlorine lone pair | P | 9.6 % | 70 % |
| SF₆ | any occupied | S | — | none above 3 % |

So a sulfur 3d tail sits at 10 % of an iodine lone pair — just over the 0.10
that makes an atom a centre, and just under the 0.90 that would make it a lone
pair. Both sides of the gate were landing in the same place.

**What a converged calculation hands it.** `avo_ibo`'s own SO₃ run is
hf/cc-pVDZ — a basis that does carry a d on sulfur. Its classifier has no
main-group d branch at all (the only one is Z 21–30), and its label builder
(the `_hybrid_str` this app's Type strings mirror) does include d, dropping any
component below 1 %. Every SO₃ row names s and p alone — "100 % 2pz",
"79 % 2px + 21 % 2s" — so the dominant atom's d is under a per cent, where ours
is ten.

**That is the whole of deviations 1, 2 and 4.** A same-n d is a polarization
function in a converged basis and a first-class basis orbital here, so the
classifier's population gates were never exercised against a 10 % d tail:
`polarizationD` (not a centre), the `valenceDShell` restriction (not the
valence shell the metal rule is for), and the lone-pair rescue all say the same
thing — *the EH d may not vote on topology.*

**Deviation 3 is not this.** I₂ is s+p only in this table; its bond is
misread because both atoms are almost pure p, which is the π gate, and the gate
was calibrated on carbon and nitrogen where a p–p σ bond along the axis is
rare. That is a test-set gap, not a basis one.

**The principle, since it generalises.** The minimal-basis d is kept for the
Hamiltonian because the energies need it — SF₆ is only readable with it — and
it is roughly an order of magnitude too heavy for populations. Excluding it
from the centre count while leaving it in the matrix is the right split, and it
is the same correction the metal case already needed: NOTES records that EH+PM
puts more density on iron than SCF+IAO+PM does, which is why our ferrocene
labels differ from theirs on the orbitals they differ on.

**Why nothing organic moved.** First-row elements have no d in this table, so
C/N/O/H chemistry never met any of the four rules — which is why the organic
labels agree with theirs unchanged, and why the deviation only shows up in the
second row and the d block.

## The GFN2 discrepancy was xTB's own halogen term (2026-09-30)

*Superseded within the hour — see "Both explanations were wrong" below. The flag is a no-op on these molecules; the real cause was a geometry confound.*

OCC looked wrong against the xTB oracle: exact on water (0.15 mcal/mol), but 1.3
kcal/mol on SF₆ and **13.7 kcal/mol on PCl₅**, and the multipole switch did not
explain it. The obvious reading — that OCC is the weaker implementation — was
wrong, and A THIRD IMPLEMENTATION is what showed it.

Same geometries, energies in Eh:

| | water | SF₆ | PCl₅ |
|---|---|---|---|
| xTB 6.7.1 CLI (`--sp`) | −5.070325081194 | −31.755200382434 | −25.386588829440 |
| xTB 6.7.1 CLI `--no-halogen` | — | **−31.753151091064** | — |
| tblite 0.7.0 (via ASE, eV→Eh) | −5.070325042588 | −31.753150828355 | −25.364768816415 |
| OCC 0.9.4 (`occpy`) | −5.070324844258 | −31.753149060241 | −25.364767906319 |

**tblite and OCC agree with each other** (1.8e-6 Eh apart on SF₆) and **xTB is
the outlier**, because xTB 6.7.1 applies a **halogen-bond correction by default**
and the two libraries do not. `--no-halogen` reproduces the libraries' number.
The 13.7 kcal/mol was xTB's extra term, not an OCC defect.

So OCC's GFN2 is corroborated by the reference library — the accuracy objection
is withdrawn. It also means the two engine *families* differ by a documented,
switchable term rather than by a bug: xTBloom ≡ xTB-with-the-term (which is why
its parity test passed at 3e-7 Eh), OCC ≡ tblite ≡ xTB-without-it. If the app
ever needs to be faithful to xTB's defaults on halogen contacts, OCC cannot
supply that term; for covalent bond lengths it should matter little, which the
geometry comparison can still confirm.

**The lesson worth keeping**: my first reading of the tblite numbers compared
eV against Eh and "confirmed" the wrong conclusion in my own head before the
job printed the conversion. Two implementations disagreeing is a question, not a
verdict — and the answer here was a default setting nobody had mentioned.

**Also learned**: `occpy` has no molecular geometry optimiser — only
`CrystalOptimizer`. Molecular relaxation is the caller's loop over
`energy_and_gradient()`, which is exactly the arrangement the user chose
(mmff94-ts's optimiser driving OCC's forces), and what `xtb-wasm` does for
itself in JavaScript.

## Both explanations were wrong: the confound was geometry (2026-09-30)

The user asked whether the comparison had accidentally mixed GFN2 with GFN1. It
had not — the two methods differ by 438, 1651 and 850 kcal/mol on water, SF₆ and
PCl₅, and my three-way agreement was at 1e-3, so every run was GFN2 (and every
script names its method: `--gfn 2`, `TBLite(method="GFN2-xTB")`, and `occpy`,
whose `XtbMethod` contains only GFN2). But asking sent me back to the numbers,
where the real error was waiting.

**The error.** The xTB numbers I used as the oracle came from `--opt` runs —
energies at xTB's *own optimised geometries*. The OCC and tblite numbers were
single points on my *starting* geometries. Two different molecules' geometries,
compared as though they were one. PCl₅'s "13.7 kcal/mol discrepancy" was simply
the energy released by relaxing my hand-built trigonal bipyramid to xTB's
optimum. The 1.3 kcal/mol on SF₆ was the same thing, smaller.

**With every engine on the same geometry:**

| molecule | xTB `--sp` | xTB `--sp --no-halogen` | tblite 0.7.0 | OCC 0.9.4 |
|---|---|---|---|---|
| water | −5.070325081 | −5.070325081 | −5.070325043 | −5.070324844 |
| SF₆ | −31.753151091 | −31.753151091 | −31.753150828 | −31.753149060 |
| PCl₅ | −25.364769017 | −25.364769017 | −25.364768816 | −25.364767906 |

OCC agrees with xTB to **0.00015, 0.00127 and 0.00070 kcal/mol**, and
`--no-halogen` changes nothing — so the halogen-bond explanation was wrong too,
and the "reproduction" it appeared to give was the same confound twice.

**Verdict: OCC's GFN2 is correct**, corroborated by tblite and by xTB once the
geometries match. What remains for the engine choice is licence, capability and
maturity, not accuracy.

**Two confounds in a row, and what caught them.** The first was units — tblite's
ASE interface returns eV, and I compared against Eh. The second was geometry —
an optimised energy against a single point. Both produced confident, wrong
stories; both were caught by a *control* rather than by re-reading the numbers:
a third implementation, and a question about what exactly was being held
constant. The rule this log keeps relearning: when two implementations disagree,
list what differs between the runs before blaming either.

## The permissive route already exists: OCC, and xTB is LGPL (2026-09-30)

Asked how hard our own wasm port of xTB would be, and whether it buys anything.
Both halves have answers that change the last recommendation.

**xTB is LGPL-3.0.** `COPYING` is GPL-3 and `COPYING.LESSER` is LGPL-3 — the
standard pairing, so the library grant is the Lesser one. Reading `COPYING`
alone and stopping would have said GPL, which is wrong. Its dependencies are
now equally permissive for GFN1/GFN2: the subproject wraps are `cpx`,
`dftd4`, `mctc-lib`, `multicharge`, `tblite` and `test-drive`, and the old
`libMCTC` — the GPL part this repository used to carry — is gone in favour of
`mctc-lib`. `tblite` is LGPL-3 too.

**A port would be a toolchain project, not a task.** xTB is Fortran, so wasm
means a Fortran-to-wasm compiler (LLVM/flang with a wasm target; the community
recipes — Stagg's guide, Full-Stack-Fortran, LFortran — are recipes, not a
maintained pipeline), a LAPACK/BLAS shim for wasm (which is exactly the piece
xTBloom had to *write*, on pinned Eigen), xTB's parameter data files as another
shipped asset, OpenMP off for single-threaded wasm, and Fortran runtime I/O
quirks on top. Weeks of work and then permanent maintenance — and it is
*building the thing xTBloom's team already built*, alone.

**But it buys nothing either, because someone did the interesting half.** OCC —
"Open Computational Chemistry in C++" — is an **independent C++17 implementation
of GFN2-xTB**, and `@peterspackman/occjs` 0.9.4 ships it **compiled to
WebAssembly** on npm, under a **dual licence: `GPL-3.0-or-later OR
LGPL-3.0-or-later`**. Its own npm metadata states that. On top of it,
`cheminfo/xtb-wasm` is a library that takes a structure and returns the
optimised geometry, harmonic wavenumbers, IR intensities, Raman activities and
RRHO thermochemistry — more than was asked for.

So the choice is no longer "GPL or a port". It is **xTBloom, GPL-3 only**,
against **OCC, which offers LGPL-3** — and the LGPL grant is the licensor
saying, in the licence file itself, that a linking consumer may keep its own
terms. A dynamically loaded wasm side module is that shape, and it is the shape
xTBloom uses for its own Eigen package.

**Three things to check before this replaces the earlier recommendation**, all
honest unknowns: OCC's *accuracy* is unverified by us — it claims GFN2, and the
protocol that settled xTBloom (same geometry, same method, compare against the
xTB oracle to the readout's precision) has not been run against it; the npm
package is 61.8 MB unpacked, which is not the browser payload but means the wasm
size has to be measured rather than assumed; and OCC's README says outright that
it is in active development with an unstable API, where xTBloom pins every asset
by content hash.

## Wiring xTBloom in: what it would actually take (2026-09-30)

Asked whether the engine can be extracted and wired in cleanly. Yes — and the
answer is small enough to state exactly.

**The engine is three files**, all under one SHA-256 content version
(`f2f1123…`), with the hashes published in their own `engine-manifest.json`:

| asset | bytes | role |
|---|---|---|
| `xtbloom_web.js` | 99,376 | Emscripten glue (modularized, dynamic linking) |
| `xtbloom_web.wasm` | 1,825,284 | the CPU GFN1/GFN2 backend, wasm32 |
| `xtbloom_web.side.wasm` | 163,231 | the preloaded LP64 LAPACKE/CBLAS package (pinned Eigen 5.0.1) |

2.09 MB decoded, about 950 kB over the wire — which is the number measured here
earlier and misreported as the file size; the manifest gives the decoded bytes,
and this table is the one to quote. Downloaded glue hashes to
`1844c6c1b9e3f67121e67e5db1c390a9c12f2e177bb35fef9c13986d910ccfd3`, matching
the manifest.

**What their app layer adds, and we would not need** (total ~125 kB):
`app.js`, `app_helpers.js`, `worker.js`, `c60_case.js`, and the optional
`smiles_worker.js`/`smiles_helpers.js` — the UI, the progress ledger, the C₆₀
regression preset, and the SMILES/OpenChemLib path. The viewer (3Dmol) and the
SMILES provider are third-party CDN assets on top.

**How a host drives it** (from `web/README.md`): the engine is a
single-threaded wasm32 module whose synchronous native calls belong in a
Worker; the *host* fetches the wasm and the side package as bytes, hands them
to the module through the standard Emscripten hooks (`getPreloadedPackage`,
`instantiateWasm`), and calls it. The glue exports exactly four JS-callable
entry points — `_xtbloom_web_version`, `_xtbloom_web_compute`,
`_xtbloom_web_optimize`, `_xtbloom_web_set_optimize_step_cb` — so the wiring is
a small Worker plus a few hundred lines of TypeScript, not a port. SIMD128 is
required (universal in current browsers) and there is no Memory64 dependency.

**One design note worth having before any code exists**: the *optimiser is not
part of the stable ABI* — their L-BFGS loops over the single-point adapter,
which is exactly what `_xtbloom_web_optimize` does in the demo. Since the
analytic **forces** are stable API, geometry optimisation can equally live in
our own TypeScript, reusing our convergence handling instead of theirs. That is
a choice to make, not a blocker.

**The licence is the whole question, and it is not dodgeable.** The wasm and
the glue are the GPL-3.0-or-later work. Calling that API from our own code and
redistributing it is a combined work in any ordinary reading; "mere aggregation"
would be a stretch when the integration is the point. Their CUDA/MKL additional
permission does not apply to the CPU path we would use. So adopting it means
Valence becomes GPL-3.0-or-later — which sits fine beside the vendored BSD
`mmff94-ts`, but is a change to the project's posture rather than a detail of
it. Everything above is the material for that decision; the decision is not
this file's to make.

## The xTB oracle is installed, and xTBloom matches it (2026-09-30)

**The oracle.** Full xTB was already on lenovo — `~/opt/xtb` → `xtb-6.7.1`,
version `6.7.1 (edcfbbe)`, compiled 2024-07-22 — installed beside `janpa` and
the `mmff94-ts` sources. Not on `PATH`; the stable path is `~/opt/xtb/bin/xtb`
through the version symlink, which is how the other oracle here is addressed
(`~/yaehmop/tightbind/bind`). Verified rather than assumed: the release tarball
re-downloaded here hashes to `62a8d18778286e815292ee53d76ce447daf460a4dea3782c0f25cbac7019b5df`,
exactly the sha256 recorded in `~/opt`, so the install is intact and the copy
already there was the same artifact. Runs: water GFN2 single point
−5.070325081194 Eh.

**First reference values**, all from our own geometries, so the fixtures to come
start from something reproducible:

| | energy (Eh) | geometry after `--opt` |
|---|---|---|
| water | −5.070325081194 (sp) | — |
| SF₆ | −31.755200382434 | perfect octahedron, S–F 1.590 Å from a 1.561 Å start, spread 0.000 |
| PCl₅ | −25.386588829440 | trigonal bipyramid, axial 2.156 / equatorial 2.028 Å, symmetry kept |

**The parity check, done the only way that proves anything.** xTBloom's browser
engine and native xTB agree on *this* molecule and method, but comparing their
two optimisations compares two optimisers as well — the browser demo runs its
own L-BFGS (S–F 1.59017 Å) where xTB runs ANC (1.59047 Å). So the browser's
optimised geometry was fed back to the native binary for a single point, which
removes every other difference:

| on the *same* geometry, GFN2 | energy |
|---|---|
| native xTB 6.7.1 | −31.755200321765 Eh |
| xTBloom browser (wasm32) | −31.755200 Eh |
| difference | 3.2e-7 Eh = 2.0e-4 kcal/mol |

That is the demo's whole displayed precision — agreement to better than a
microhartree. Recorded as *our* measurement, since the project's rule is to
publish the check rather than the vendor's claim.

**A finding that argues for the same change here.** The demo's SMILES → 3D path
pre-relaxes with **MMFF94**, and on SF₆ it refuses outright: "MMFF94
pre-optimization failed". The browser stack hits the same wall this app hits,
and for the same reason — a force field cannot do hypervalent sulfur. Geometry
is the strongest case for adopting xTBloom, not the weakest.

## xTBloom: the electron repulsion this app never had (2026-09-30)

Found by the user; assessed here. GFN1/GFN2-xTB — Grimme's semiempirical tight
binding, with the SCC that extended Hückel lacks — from the Jinzhe Zeng group,
native for C/C++/Python/CUDA, and with a **client-side WASM build**.

**Verified rather than assumed.** The deployed demo was loaded in a headless
browser and its own resources inspected: `xtbloom_web.wasm` 949 kB,
`xtbloom_web.side.wasm` 39 kB, 3Dmol 152 kB, the page reporting "engine ready
v0.2.2" with no console errors and nothing uploaded. Worth recording that the
web build is a **plain WASM module plus an Eigen/LAPACK side module**, not
Pyodide — the licence manifest's mention of pyodide is for some other path, and
it would have been easy to assume the heavier architecture from that alone.

**Why it is the find it looks like.** Every limitation this log has recorded —
no splitting in eV, no high-spin/low-spin answer, no pairing energy, no
ligand-field splittings, and Phase 5 parked because "a static page cannot
produce a wavefunction" — traces to one property of extended Hückel: no electron
repulsion. GFN2-xTB has it, self-consistently, and runs unrestricted. It also
optimises geometry quantum-mechanically, which is where MMFF94 is weakest in
this app: SF₆, PCl₅ and the metal complexes run on generic parameters today, and
every one of them is a case where a force field is the wrong tool.

**Three gates, none of them mine to open.** Licence: GPL-3.0-or-later, so
vendoring or linking makes the combined work GPL (evaluating it is free — the
licence binds on distribution, not on use). Interface: the public API publishes
energies, forces, charges and dipoles, **not MO coefficients**, so the orbital
pictures stay on extended Hückel — a second engine and a second label, not a
replacement. Maturity: the *native* path is the mature one; the web path is
single-threaded wasm32 needing SIMD128, fetches Eigen at build time, and the
project's own docs call it "for exploration, not a production scientific
environment".

**Provenance, since it cuts both ways.** Three stars and 43 open issues, so
young — but the engineering discipline is not: pinned hashes, wasm32 *and*
wasm64 CI, a C₆₀ regression checked against native references, goldens against
tblite, per-issue evidence directories, and explicit AI-authorship provenance
(agents wrote most of it under human-defined goals). It builds on xTB and
tblite rather than reimplementing them, which is the honest way to start.

## Orbital energies read in kcal/mol (2026-09-30)

The solver works in eV — that is what the Alvarez and ICON8 parameters are
published in and what YAeHMOP prints — but a chemist reads orbital energies
beside bond energies and conformational gaps, and that unit is kcal/mol. So the
calculation keeps eV and the panel converts, once, in `src/ui/units.ts`
(1 eV = 23.060549 kcal/mol). Rows and the readout show one decimal, which is
finer than the three decimals of eV they replaced; the copied MO data carries
four and names the factor, since a data block is converted back by whoever
reads it.

The delocalized list is split into `Occupied · n` and `Empty · n` sections, as
the localized list is, so the two views read the same way. The headers are
written ONLY when the filling is known: an open shell — or a degenerate set the
count would only partly fill — has levels but no determined occupancy, and a
header would invent one. (The localized view already refuses in that case; here
the levels stay and the split simply does not appear.)

Two display elements went at the same time, both at the user's call: the `×2`
marker beside a degenerate set (it read as a multiplier on the orbital rather
than as a count of them — the shared energy and the readout's "degenerate with
MO 15" say it a second time, better), and the `↑↓` occupancy arrows. With the
rows ascending, occupancy is what the HOMO/LUMO tags delimit: everything below
the LUMO is filled.

## One row style for both views (2026-09-30)

The delocalized view drew an SVG ladder — ranked rows, fat hit strokes, an
energy label per row. It worked and it was clickable, but it looked like nothing
else in the panel, and two views of the same electrons should not need two
visual languages. It is now HTML rows sharing the localized list's row style:
same height, same dot, same hover and selected states.

**The rows say more than the bars did**, because a row has room: MO index, the
degenerate count, the irrep, the occupancy, the energy, and the HOMO/LUMO tag —
with degenerate partners adjacent and both carrying the set's tag. Ordering is
unchanged (ascending, lowest at the bottom, so both views read the same way up),
and each row is its own button, so a degenerate set is two rows rather than two
bars sharing one.

**What the SVG took with it**: the ranked row pitch, the hit strokes, the
frontier `scrollIntoView`, and the `ResizeObserver` that redrew the ladder when
the panel changed size — HTML reflows itself, so that observer was only ever
needed because the diagram was a fixed-size SVG. `#mo-diagram` is gone: one list
holds both views. And `.lmo-*` became `.orb-*`, since those classes are no
longer the localized view's private property — the shared style is the point.
79 lines of dead CSS went with the SVG.

## The delocalized ladder: ranked rows, ascending (2026-09-30)

The view is renamed **Delocalized** (from "Ladder" — it is the delocalized MO
view, beside the Localized one), including the internal view name, so the code
says what the panel says.

**The complaint was the geometry.** Rows sat at their true energy: didactic, but
it squashes a dense virtual block into one line, and a line is a poor click
target — the diagonal-stroke `<line>` targets had been clamped to 6–16 px, and
overlapping rows made the lower ones unreachable. Rows are now **ranked**: one
fixed 26 px row per energy, so a level is as easy to hit as a row in the
localized list (the hit stroke is 22 px, the whole row).

**What that trades, and how it is paid back.** Proportional spacing is gone, so
the energy is printed *on* the row, where the axis used to be — and the axis and
its ticks are gone with it, because a linear axis over ranked rows would be a
lie. The diagram scrolls and the frontier is scrolled into view on load, so
nothing is clipped to keep the frontier readable; the old "N levels outside the
window, stacked at the edge" band and its note are gone. Two properties stayed,
because they are why this is a diagram and not a list:

- **Degenerate orbitals share a row** as side-by-side bars, each its own target,
  with a 16 px gap so they read as separate orbitals rather than one bar with a
  seam.
- **Ascending**: lowest at the bottom, the same way up as the localized list and
  the textbook diagram, so the two views agree about which way is up.

**Found while verifying**: a HOMO or LUMO sitting *inside* a degenerate set lost
its tag, because the tag was read from the group's first member rather than from
the group. Benzene is exactly that case — its HOMO is one of the e1g pair — so
the tag had been missing on the molecule most likely to be looked at.

Dead weight removed with the windowing: `axisTicks`, the window constants, the
`PAD` box (its last user was the axis), the clipped-level style, and the SVG
overrides that would have flattened the new bars.

## The field is cached, and the level is a share of the electron (2026-09-30)

Two of the ideas taken from the other surface renderers, shipped together. The
outside review's per-AO peak scaling is **gone**: it bought one control that fit
every element by distorting the field — moving internuclear nodes, drawing a
heavy end out of proportion — and the honest way to the same end is to keep |ψ|
exact and choose the *level* well. IBOView does exactly that, and it is what
`levelForFraction` now does.

**The work has two halves, and they are cached separately.** Measured, min of
several runs:

| | field | march, per level |
|---|---|---|
| water | 25 ms | 80–113 ms |
| benzene | 89 ms | 228–286 ms |
| PCl₅ | 230 ms | 212–340 ms |

So the *marching* is the bigger half — which is not what this entry predicted
before the measurement, and it changed the design: caching the field alone saves
only 25–45 % of a level change, so the marched mesh is cached too, keyed by the
level. What the field cache buys is the thing a percentile cannot do without: a
level chosen *from* the field requires the field to exist first. It also lets a
mode switch re-march rather than re-evaluate.

**The level is a grid value, found exactly.** `levelForFraction` histograms |ψ|²,
crosses the requested share from the top down, then walks the crossing bin's own
amplitudes to return the tightest grid value that reaches it. Interpolating
between bins was wrong twice over: linearly it missed by 1.6 % at the low end,
and even a cubic within-bin model missed, because the enclosed share is a *step*
function of the level — it moves one grid point's weight at a time, and near an
orbital's core that step is per cent-sized. The marcher keeps `|ψ| > level`, so
the returned value sits just *below* the value that completes the share.

Measured back off the field, the share lands within 0.1 % of the request (and
the test asserts that, measured, not a theoretical bound). For reference, the
levels the old absolute defaults correspond to, on water: 0.04 encloses 94.7 %
of an O–H bond, 0.10 encloses 80.3 % — which is where the new defaults of 0.95
(molecular) and 0.80 (localized) come from, so the pictures stay recognisable.

**What the panel does.** A mode control — `percentile` (default) or `absolute` —
and a value control whose list is rebuilt from the constants when the mode
changes, so labels and state cannot drift. Each view keeps its own value *in
each mode*, and switching mode shows that mode's value rather than carrying a
number across, because a share and an amplitude are different quantities. The
absolute mode keeps the true-units levels (0.02 … 0.30) that Avogadro2 and
MOrbVis mean by the same word, which is how their pictures get reproduced here.

**Verified in the app**, since the reviewer could not click through: water's σ*
tightens from a lobe hugging the atoms at 0.5 to the outer skin at 0.995;
switching to absolute shows 0.04 and back shows 0.95; SF₆'s S–F σ draws its
sulfur end at the 0.80 default. The SF₆ case the per-AO scaling existed for is
answered honestly now: 0.8 of the bond's density genuinely includes the sulfur
region, and to see *more* of it you raise the share rather than inflating the
element.

## Review round: one isovalue for every shell, and SI₂ (2026-09-30)

Outside review produced commit 4f4419e, and this is the verification of it that
the reviewer could not do (they could not click through the viewer). Read the
responses as: the diagnosis is right, the fixes are right, and the residue is
documentation and UX rather than chemistry.

**Verified independently.**

- **The peak table reproduces exactly.** Computed here from `aoPeakAmplitude`:
  H 1s 0.836, F 2p 0.784, C 2p 0.430, Cl 3p 0.323, S 3p 0.273, I 5p 0.193,
  K 4s 0.035 — the table in the response, to its rounding.
- **The defaults survive the unit change.** The contour is now a fraction of
  each AO's own peak, so the numbers mean something different; measured on
  water's localized O–H bonds, reach from the oxygen, against the old absolute
  numbers in brackets: 0.04 → 1.93 Å (1.84), 0.10 → 1.59 Å (1.50), 0.20 →
  1.33 Å (1.23). Five to eight per cent fatter, which is why 0.04/0.10 did not
  need re-tuning: the reach moves on the steep part of the radial falloff, not
  linearly with the amplitude.
- **The labels, in the live panel.** PCl₅ · 20 occupied = 5 σ + 15 LP. ZnCl₂ ·
  8 = 2 σ + 6 LP — it localizes now, which it did not. Water unchanged at
  2 σ + 2 LP, in the energy-ladder order. Both ends of an SF₆ σ* are drawn at
  the 0.10 default, sulfur included.

**What the unit change costs, and it should be said out loud.** Dividing each
basis function by its own peak makes the picture a picture of *coefficients*,
not of |ψ|: water's H 1s is drawn about 1.9× smaller relative to its O 2p than
the true amplitude implies, and HI would be drawn with an iodine end about 4×
larger than it is. That is the price of the fix — the dynamic range across
elements had to go — and it buys the thing the response was after: one setting
that shows both ends. The tooltip now says "as a fraction of a full atomic
orbital's own peak", which is accurate; a clause saying the elements are drawn
at their own scales would close it. The trade also moves the location of an
internuclear node, since a node is where two scaled AOs cancel.

**What the surface costs now.** Min of three runs, baseline (7c6ef94) against
this commit, same orbitals: water 137 → 103 ms (inside the noise), benzene 357
→ 627 ms, PCl₅ 538 → 929 ms, I₂ 319 → 457 ms. Vertex counts 1.2× to 2.2×
(I₂ doubles because the iodine lobe now exists at all). So the commit adds
~1.5×, and — the part worth acting on separately — the *baseline* was never the
"~50 ms" the comments claimed: it has been several hundred ms since the grid
was refined to 0.1 Å. Clicking a new level on benzene or PCl₅ freezes the panel
for most of a second, and changing the isovalue clears the cache, so that costs
a freeze per change. The comments now carry the measured numbers instead of the
old ones, and moving the extraction off the main thread is the real fix if it
ever annoys.

**Two documentation residues, fixed here.** The tooltip lost the "0.06 to see
the overlap between two orbitals" guidance in the rewrite; and the test comment
that called the classifier "the same names, the same gates" as avo_ibo is no
longer true — there are four deliberate deviations now (a polarization d is not
a second centre, a same-n 3d is not a valence d, a neighbour under 0.10 leaves
a lone pair alone, and p density along the bond axis is σ). Our rows still read
beside an ibos.txt with those four in mind; the organic cases, where none of
them fires, agree.

**One cosmetic loss to know about.** With the polarization d set aside, an
orbital delocalized over a whole SF₆ cage now has no atom above the 0.10
carrier gate, so two rows in that list read just "σ*" with no centres named.
Honest — nothing carries it — but less useful than the old "S1-F2 σ*", and a
fallback to the top two atoms by share would fix it if it grates.

## The localized list became an energy ladder (2026-09-30)

The list was ordered **class-first** — lone pairs, then bonds, then the
delocalized set, energy only inside a class — on a 2026-09-29 measurement whose
note survives in `order-localized.ts`: ordering by ⟨φ|H|φ⟩ alone "interleaves
the classes (water is lone pair, σ, σ, lone pair)", which reads as the aufbau
picture but not as a legible list. The user asked for the energy ladder anyway,
as other programs draw it, and the old illustration **does not reproduce**:

| water, occupied, ascending ⟨φ|H|φ⟩ | |
|---|---|---|
| the two O–H bonds | −22.050 |
| the in-plane lone pair (sp) | −21.721 |
| the pure 2p lone pair | −14.800 |

So the pure-energy order is σ, σ, LP, LP — *more* legible than the note
claimed, not less, and the pure 2p lands exactly on the canonical HOMO
(−14.800 eV, the same number the ladder gives 1b1). Ethene agrees: four C–H σ
(−18.12), the C–C σ (−20.68) below them, the C–C π (−13.23) above, π* (−8.20)
as the lowest empty orbital. Benzene: the C–H σ (−19.62) below the C–C σ
(−17.94) below the ring π set (−13.37), then the π* (−7.16) and the σ*.

**What the order is now.** ⟨φ|H|φ⟩ ascending within each section — occupied
first, then the valence-virtual block — and the panel **renders it bottom-up**,
so the highest-lying orbital (an empty one) sits at the top and the deepest at
the bottom, matching the Ladder tab's own orientation. The class is still shown
as the Type string; it is a label now, not a rank. The row's `data-index` still
carries the array index through the reversal, which is what the selection and
the click handler read — the one thing a reverse-and-render is easy to get
wrong, so the panel walks *indices* reversed rather than the array.

Tests updated in the same commit: the class-order pins became a monotonicity
pin (energies non-decreasing within each section) plus the water sequence, and
the label test now asserts the classes present rather than their order — the
two concerns were entangled, and only one of them changed.

## Two isovalue defaults, and why the higher one is the safe one (2026-09-30)

Corrected later the same day (see "One isovalue has to draw every shell"): the
table below is in absolute amplitude, and the surface no longer uses that
scale. The two defaults stayed — 0.04 and 0.10 — as fractions of each shell's
own peak. The carbon counts here describe the old picture.

One level cannot serve every picture, and the user's readings from the app
turned into a rule. Measured on benzene — how many of the six ring carbons the
surface reaches within 1.3 Å of:

| isovalue | a Deloc (ring π) orbital | a C–C σ |
|---|---|---|
| 0.04 | 6/6 carbons | 4/6 |
| 0.06 | 6/6 | 4/6 |
| 0.10 | **6/6** | 4/6 |
| 0.20 | **3/6** | 4/6 |

**The failure modes are asymmetric, and that decides the default.** Set too
low, a picture is fat and shows everything — the σ bonds at 0.10 reach 1.50 Å
against a 0.96 Å bond, which reads as a slightly swollen sausage and is
recoverable by the eye. Set too high, atoms drop out silently: the delocalized
ring orbital goes from six carbons to three between 0.10 and 0.20, and nothing
about the remaining picture announces that half the molecule is missing. So the
default is the *safe* error, not the prettiest one.

Hence two levels, one per view, each remembered separately (`activeIsovalue`):

- **0.04 for molecular orbitals** — the textbook look, where a canonical MO's
  diffuse tails are what make it read as an MO at all;
- **0.10 for localized orbitals** — a single bond looks better at 0.20, but a
  Deloc at 0.20 is *wrong* while a σ at 0.10 is merely fat.

The guidance lives in the control's tooltip, where someone changing the level
is already looking: 0.06 shows the overlap between two orbitals
(hyperconjugation), 0.04 the MO default, 0.10 the localized one.

**The same trap, met from the other side (user's account, unverified here).**
At the start of the `avo_ibo` work the orbitals looked diffuse against
IBOView's, and the localization was suspected — until it turned out IBOView's
default is about 0.2–0.3. Two things follow, and the second is the one that
matters here. First: it is the second time in this
project that a display setting has masqueraded as a chemistry problem — the
earlier one is the radial-power bug in the halides' MO lobes, which took four
wrong diagnoses before the surfaces' size was traced to the radial factor — so
it is worth doubting the display before the method.
Second: **the number does not travel between programs.** It depends on the
basis, on how the amplitudes are normalized, and on the orbital normalization;
IBOView's 0.25 and this app's 0.25 are not the same threshold at all. What
travels is the shape of the rule — a localized orbital wants a threshold
several times higher than a delocalized one — and that is what the two defaults
above are built from, not a value imported from elsewhere. Comparing pictures
with IBOView means comparing pictures, not numbers.

**A bug this shook out of the control, worth remembering.** The first version
wrote the value back with `String(value)`, so the localized default of 0.1
became "0.1" — which matches no option in a select whose labels are "0.10",
and the control silently went blank while the state stayed correct. It now
matches the option by parsed value. Any select whose labels are formatted must
be driven by comparison, never by string equality with a number.

## The isosurface scale, and why the localized view is not special (2026-09-30)

The reaches below are absolute amplitudes, the scale retired the same day
(see "One isovalue has to draw every shell"). The conclusion stands: both
views call the same surface code.

A question about whether the localized-orbital view draws its orbitals badly
turned into a measurement, and the measurement killed the premise. What was
claimed: a localized orbital is a hybrid with a large s component, so the
isosurface renders it as a sphere while the canonical MO renders cleanly. What
is true: **the reach of the surface depends on how concentrated the orbital is,
by the same rule in both tabs, and the localized view is not special at all.**

Water, occupied set, distance from the oxygen to the farthest vertex of the
isosurface (Å; the O–H bond is 0.96 Å):

| isovalue | canonical MOs | localized orbitals |
|---|---|---|
| 0.04 | 1.50, 1.79, 1.51, 1.30 | 1.84, 1.85, 1.34, 1.30 |
| 0.10 | 1.16, 1.44, 1.17, 1.04 | 1.50, 1.50, 1.08, 1.04 |
| 0.20 | 0.71, 1.18, 0.82, 0.82 | 1.23, 1.24, 0.87, 0.82 |

Three things fall out.

**The rule is |c|max, and it is the same in both tabs.** The norm of every
orbital is 1 (localization is unitary), so an orbital that spreads it over more
coefficients has a lower peak and its isosurface sits further out. Water's
canonical MOs peak at 0.87, 0.72, 0.92, 1.00; its localized set at 0.51, 0.51,
0.76, 1.00. The localized bonds are fatter for that reason — 1.85 Å against
1.79 Å at 0.04 — and not because anything about them is drawn differently.

**Water's localized set is the chemistry it should be**: two O–H bonds
(|c|max 0.51), one in-plane lone pair that is an sp hybrid (0.76), and one
**pure 2p** (|c|max 1.000, i.e. one coefficient). That last one is the 1b1
orbital unchanged, and it *has* to be: symmetry forbids localizing it. Its
coefficients are identical to the canonical HOMO's, and the renderer gives them
identical measurements (1.30 Å at 0.04). Nothing to fix.

**The default is simply fat for a molecule this small, in both views.** 0.04
gives 1.3–1.85 Å of reach where the bond is 0.96 Å. That is a rendering
convenience, not an error, and it is what the isovalue control exists for — but
the control's range tops out at 0.10, where the localized bonds still reach
1.50 Å. Water comes into scale around 0.30–0.40, outside the dropdown. If the
range ever moves, that is the reason to move it.

**Consequence for PLAN.md's follow-up 6 (oriented lobes).** Its premise — that
the current draw misrepresents a localized orbital — does not hold. Drawn
schematically as one lobe on an axis it would also be *wrong* for the cases
that matter most: a lone pair the symmetry does not let localize is a two-lobed
p, and one lobe on an axis would hide that. The item's remaining value is
cosmetic, against a real cost: a single-lobe lone pair is the VSEPR rabbit-ears
picture, and the localized view exists to be the honest step *away* from it.

## The second row: ICON8 in full for Si, P, S and Cl (2026-09-30)

Follow-up 9 in PLAN.md, and it was a one-sentence fix with a real consequence.
The table carried **Alvarez s/p with ICON8 3d** for the second row — a hybrid
no paper published — and now carries **ICON8 (QCPE 517) in full**, s, p and d,
for Si, P, S and Cl. The 3d had to come from ICON8 because Alvarez's table has
none; taking only the d left each atom drawing on two different published sets.

**The values, from ICON8's own BLOCK DATA** (`forticon8.f`, QCPE 517, from the
CCL archive: `COULS`/`EXPS`/`COULP`/`EXPP` at positions 5–8 after the 230-slot
pad, symbols `SI P S CL`):

| | s | p | 3d |
|---|---|---|---|
| Si | −17.3 / 1.383 | −9.2 / 1.383 | −6.0 / 1.383 |
| P  | −18.6 / **1.600** | −14.0 / **1.600** | −7.0 / 1.400 |
| S  | −20.0 / **1.817** | **−13.3** / **1.817** | −8.0 / 1.500 |
| Cl | **−30.0** / **2.033** | **−15.0** / **2.033** | −9.0 / 2.033 |

Bold marks what the app did not have. Three things fall out:

- **Silicon needed nothing at all.** Alvarez's Si s and p are ICON8's, digit for
  digit — which is why the old Si row already looked like ICON8.
- **ICON8 gives an element's s and p the SAME exponent** (Slater's rule): P
  1.600/1.600 where Alvarez splits 1.750/1.300, S 1.817/1.817 against
  2.122/1.827, Cl 2.033/2.033 against 2.183/1.733. So this is a change of
  *character*, not only of numbers — Alvarez's second-row p functions are much
  tighter than his s for the same atom.
- **The d exponents stay ICON8's own**, and for P (1.400) and S (1.500) they do
  not match those elements' s/p. That is ICON8's choice, made in the papers it
  cites, and it is now recorded per element instead of hiding behind a hybrid.

**Why the rest of the table did not move.** ICON8 covers fourteen elements. For
the ones it carries, the two sets agree *exactly* on H, C, N, O, F, Li, Be, B,
Na and Al — worth knowing, because it means the six first-row fixtures pin the
same physics under either set. They differ on Mg (Alvarez 1.100 against ICON8
0.950), and the app keeps Alvarez there and everywhere else, because rebuilding
the table on a set that stops at argon would trade coverage for consistency
where no d shell is at stake.

**What it cost, and what it bought.** Every second-row level moved. The PCl₅
fixture was regenerated with the same ICON8 values handed to both sides
(`/tmp/eht_parms_icon8.dat`, six lines changed from the old d-injected file: P
s/p, S s/p, Cl s/p), so the fixture still pins the implementation rather than
the parameter choice — which no oracle here shares. On the occupied ladder the
shift is 1–2 eV for the P–Cl levels and up to **4.4 eV** at the bottom, which is
the chlorine 3s block: Cl's s potential moves 3.7 eV (−26.3 → −30.0) while its
exponent becomes more diffuse (2.183 → 2.033).

The regeneration **tightened** the agreement rather than loosening it:

| PCl₅ vs `bind` | before (hybrid) | after (ICON8) |
|---|---|---|
| S, all 1431 pairs | 1.07e-04 | **7.06e-05** |
| occupied ladder (20 levels) | 0.001 eV | **0.00061 eV** |
| whole ladder (54 levels) | 0.035 eV | **0.0276 eV** |

**One trap, recorded because it will bite again.** `eht_parms.dat` uses CRLF
line ends, and a text-mode rewrite that drops the terminator glues records
together — bind then reads ONE orbital per atom and reports "6 orbitals in the
unit cell" for PCl₅, which is nowhere near the 54 it should have. The rebuild
preserves the endings byte-for-byte, and the diff against the previous file
shows exactly the six intended lines. Anything that rewrites this file has to
check its line structure, not just its values.

## Spin has to come from somewhere (2026-09-30)

Tetrahedral `[NiCl₄]²⁻` arrived as an ORCA optimisation with **charge −2,
multiplicity 3** — which is the right ground state for tetrahedral Ni(II), and
which the app could not represent. Its 40 valence electrons are EVEN, so the
count alone was happy to fill them pairwise and draw a singlet the molecule is
not. A shortfall in the model, exposed by a real molecule.

`Molecule.multiplicity` is now the channel (a MOL block has no field for spin, so
whoever KNOWS sets it — an example here, a control later). It reaches the panel,
the copied MO data and the localiser, and `closedShellOccupations` refuses to
fill above 1. The panel says which case it is:

> Open shell (a triplet): extended Hückel as built here is closed-shell and has
> no spin, so no occupancy arrows and no localized orbitals.

The example's MOL block carries ORCA's ionic formal charges — Ni 2⁺, four Cl⁻ —
which is what makes the count 40 rather than 38 (the neutral-atom convention
would give the neutral molecule's electrons, not the dianion's). The ladder is
still the teaching picture: the Cl 3p / Ni 3d manifold around −15 eV, where the
e/t₂ splitting of a tetrahedral d⁸ sits.

**What adding it exposed: the app hides the atom layer by default.** `Atoms &
Bonds` is unchecked in the HTML and `moleculeGroup.visible` follows it (commit
`1b54612`, "Default: Atoms & Bones OFF, Metal style, dark navy background" — an
aesthetic that has since changed twice). For an organic molecule this is
invisible: the orbital lobes trace the skeleton, so benzene still reads as
benzene. For a metal complex it is not, because the electron-domain model has no
lobes to draw on or toward a metal centre — the view came up as four green
labels and a violet one. Examples containing an element outside the valence
model now turn the molecule layer on as they load. **The global default is
unchanged, and probably wants a decision**: the evidence is that its original
rationale (a dark "metal" look) is gone, and its only visible effect today is on
the molecules this app just learned to draw.

**The pair is the lesson, and it now runs on both branches.** Square-planar
`[Ni(CN)₄]²⁻` arrived from ORCA as charge −2, **multiplicity 1** — the singlet
the textbook expects for a d⁸ square plane, and the diamagnetic partner of the
tetrahedral triplet. Its 48 electrons fill pairwise and localize: 24 occupied,
17 valence-virtual, reading `N3(LP)`, `Ni1(LP)` ×4, `C2-N3 σ`, the CN π pairs,
and the metal d interactions as `C2-Ni1 δ` (avo_ibo's metal override types a
d-block atom by its dominant d, so an in-plane d reads δ — right for their
ferrocene HOMO, and for a *non-bonding* filled d it says more about the d's
shape than about the interaction; worth revisiting when the VSEPR/metals
question comes up).

## Diborane, and the s+p exception for d¹⁰ metals (2026-09-30)

**Diborane** joins the examples, from the wB97X-D/6-31G(d,p) geometry in
`avo_ibo/examples`. It is the molecule the classifier's `2e3c` gate exists for,
and it reads the way their table reads:

    B1-B6-H5 2e3c | B1-B6-H3 2e3c | B1-H2 σ | B1-H4 σ | B6-H7 σ | B6-H8 σ

Two bridges at three centres, four ordinary terminal B–H, and the atom order
inside the bridge label is theirs (element, then index). Its MOL block carries
**only the eight B–H bonds**. The B···B contact looked like a bond by distance
and was drawn as one at first, which gave each boron five VSEPR domains and made
it read sp³d where MMFF94 types it tetrahedral — the MMFF94 oracle test caught
it (B: valence sp³d, mmff type 1 → expected sp³). The B···B line is a
consequence of the bridges, not a bond; the standard drawing has eight.

**Zn and Cd are the deliberate exception to "no d, no MOs".** The table carries
no d row for Zn at all and only a placeholder for Cd, but both are d¹⁰ ions
where the closed shell is core-like and the bonding runs on 4s/4p (5s/5p) — so
they are carried **s+p only**, and the app says so rather than leaving the
absence silent:

> Zn run on s and p only — the parameter table has no 3d for it, and a d¹⁰
> shell is core-like. Their d orbitals are absent, not hidden.

Y, Ag and Hf stay refused: they are not d¹⁰ in the same way, and their d rows
are zero-filled placeholders rather than absent by the table's own convention.
`zncl2.xyz` from the same corpus is the example that demonstrates it (22
orbitals: Zn 4s+4p, and both chlorines with their 3d).

## The classifier was avo_ibo's, lifted — and now deviates in four places (2026-09-30)

`order-localized.ts` no longer invents its own classes. Every threshold and the
name of every class now comes from `avo_ibo`'s `_classify_orbital`
(`src/avogadro_ibo/analysis.py`), which is the accumulation of a lot of thought
about what a localized orbital *is*: **LP** (one atom > 0.90), the two-centre
bond gate (> 0.75 shared, the second atom > 0.02), **LP-s** (one atom > 0.70 and
s-rich), **2e3c** (a third atom > 0.10, no fourth above 0.03), **Deloc**
otherwise; and for the empties their looser ladder (σ*/π*/δ*, then a
three-centre π* at 0.08, then a two-centre anti* at 0.60, then `(virt)` above
0.50). Their σ/π/δ typing is theirs too, including the metal override — when a
d-block atom carries majority d, the dominant d decides: z² σ, xz/yz π, xy and
x²−y² δ.

Three places where a direct lift was not possible, each measured:

- **The 2e3c gate has to run before the two-centre gate.** Their populations are
  IAO and put diborane's bridge at 0.72 on its two top atoms, so their bond test
  misses it; ours are overlap-weighted Mulliken and put the same bridge at
  **0.79**, so with their order the one molecule the 2e3c rule exists for comes
  out a plain σ. The gate is theirs; the order is not, and the comment says why.
- **`Core` is not ported.** Their rule is "one atom > 99%, s-character > 0.75,
  dominant s is n = 1" — in a full basis that finds an oxygen 1s. This basis is
  valence-only, so the same test could only ever fire on a hydrogen 1s, i.e.
  mislabel a hydride. There are no core orbitals here to find.
- **The bond population's sign still splits a bond from its antibond**, on top
  of the occupancy split they use: an *occupied* localized orbital that comes
  out out-of-phase between its two atoms is an antibond whatever its occupancy.

**Where our labels still differ from theirs, and why it is not the classifier.**
Ferrocene is the case, and it is worth recording because it looks like a
disagreement and is not one. For the same molecule:

| | the metal-based occupied orbitals |
|---|---|
| avo_ibo (SCF + IAO + PM) | 6 orbitals at **Fe 84%** + C 3–12% → `Deloc` ×6, and the HOMO a `Fe-C δ` (100% 3dx²−y²) |
| this app (EH + PM) | **3 at Fe 93–100%** (the non-bonding d set) **+ 6 at Fe 21%** with the carbons spread 25–45% |

So the two pipelines partition the same nine metal-based orbitals differently —
EH's contracted d and its lack of electron repulsion put more density straight
on the iron. Their classifier applied to OUR orbitals says LP/2e3c/Deloc, and
that is the correct reading of our orbitals. The lesson for the panel: a row can
be compared with an `ibos.txt` row only once the densities agree, which for a
transition-metal complex they do not. The energies, though, are still the
oracle's (see below).

## The d block: ferrocene, and what the table needed (2026-09-30)

The transition metals are in. Twenty-five of them — Sc–Cu, Zr–Pd, Lu, Ta–Hg —
extracted from the same shipped table, each with its s, p and a CONTRACTED 3d
(two exponents, one coefficient each). Five d-block elements are refused rather
than half-supported: Zn has no d row at all, and Y, Ag, Cd and Hf carry
zero-filled placeholders. An element whose d shell would be a guess gets no MOs.

**The oracle needed no parameter injection this time.** Unlike the second row,
`eht_parms.dat` ships the d-block rows, so bind computes ferrocene from the same
numbers the app does. The fixture (`tests/references/eht/tm-reference.json`) is
the ORCA geometry from `~/Code/avo_ibo/examples/ferrocene.xyz`, aligned:

| what | measured |
|---|---|
| S, all 3481 elements of a 59-AO basis | max &#124;diff&#124; **1.0e-04** — the 4-decimal floor |
| occupied ladder (29 levels) | max 0.0007 eV |
| whole ladder | max 0.018 eV, in the highest virtual |
| **eigenvectors** — the check the other fixtures do not make | max &#124;diff&#124; **0.0049** over all 59 MOs; the HOMO term by term: 3d x²−y² 0.8518 = 0.8518, 3d z² 0.4919 = 0.4919, 4s 0.1511 = 0.1511 |

That last row is the strongest evidence in the whole extended-Hückel layer: the
overlaps, the contraction, the Hamiltonian and the solver all agree with the
oracle coefficient by coefficient, not merely in the eigenvalues.

**The table's two-zeta coefficients are not all normalized, and we renormalize.**
A contracted orbital's on-site overlap is c₁² + 2·c₁·c₂·S(ζ₁,ζ₂) + c₂², and
across the table's 31 two-zeta rows that runs from 0.9955 to **1.2457** (Ta):
eighteen rows are normalized, thirteen are 1–25% out. Iron — the fixture — is
1.000000, so the comparison above is untouched by the adjustment. We divide each
pair by √(that norm) on the way in, because a basis function of unit norm is
what the S matrix's unit diagonal means, and a test now asserts every
contracted row we ship satisfies it.

**Two more traps in the quadrature test, both the same trap.** Sizing the
integration box by `zeta` alone is wrong for a contracted orbital: the LOOSEST
term (Fe's ζ₂ = 2.00, not its ζ₁ = 5.35) sets the tail, and getting that wrong
cut the slow component off and reported a 8.5e-5 "discrepancy" in the code. With
the box sized by the loosest term the contracted case agrees to 1.2e-5 — and
the tight term (decay length 1/ζ ≈ 0.19 bohr) now limits the rule rather than
the box, which is why the contracted comparisons carry a looser tolerance than
the rest of that file. The file says so.

**The electron-domain model was lying about iron, and ferrocene exposed it.**
Adding the example surfaced two wrong labels immediately: iron read "sp³d²" (ten
contacts clamped into the six-domain ceiling) and every cyclopentadienyl carbon
read "sp³" (two ring bonds + one C–H + two haptic Fe contacts = five domains).
The model now describes only the main group: a bond to an element outside it is
not a domain, and an atom outside it is marked undescribed — no label, no lobes.
So the ring carbons read **sp²** with a p orbital, which is right, and iron
reads nothing, which is honest. The MMFF94 oracle test's corpus excludes the
metal example for the same reason, by element set rather than by a deviation
entry.

## The 3d parameters, checked at the source (2026-09-30)

The second-row 3d values were taken from a secondary report of ICON8; they are
now checked against ICON8 itself. QCPE 517's Fortran is fetchable
(`https://server.ccl.net/cca/software/SOURCES/FORTRAN/EHT/forticon8.f`, 4124
lines), and its BLOCK DATA carries

    DATA EXPD/234*0.0D0,1.383D0,1.4D0,1.5D0,2.033D0,12*0.0D0/
    DATA COULD/234*0.0D0,-6.0D0,-7.0D0,-8.0D0,-9.0D0,12*0.0D0/

with `ND` = 3 for exactly four elements, in the SYMBOL order SI, P, S, CL. So
Si −6.0/1.383, P −7.0/1.400, S −8.0/1.500, Cl −9.0/2.033 are **verbatim** what
this app ships, and `C1`/`C2`/`EXPD2` are all zero — ICON8's 3d is
single-zeta, so the app's single-zeta `OrbitalParameters` shape is the right one
for it.

**What the same file says about the s and p, and it is not what we use.** Our
s/p rows are Alvarez's:

| | this app (Alvarez s/p) | ICON8 |
|---|---|---|
| P    | s −18.6/1.75, p −14.0/1.30 | s −18.6/1.60, p −14.0/1.60 |
| S    | s −20.0/2.122, p −11.0/1.827 | s −20.0/1.817, p −13.3/1.817 |
| Cl   | s −26.3/2.183, p −14.2/1.733 | s −30.0/2.033, p −15.0/2.033 |

So a molecule with a second-row d (SF₆, PCl₅) is running Alvarez s/p against
ICON8 d — a hybrid, as `parameters.ts` says, and now a *measured* one rather
than a caveat. Two things follow. ICON8 gives an element's s and p the SAME
exponent (Slater's rule) while Alvarez splits them, so the two sets differ in
character and not only in numbers. And the "ζ alternatives" recorded for d
(P 1.600, S 1.817) turn out to be exactly ICON8's own s/p exponents — the
d-consistent Slater-rule choice — while ICON8's shipped d (1.400, 1.500)
deliberately does not match its own s/p. Worth knowing before anyone "fixes"
one of the two.

## The 3d basis: what shipped, and what it cost (2026-09-30)

Second-row 3d orbitals are in: Si, P, S and Cl carry five d functions each,
after s, px, py, pz (the order `R_overlap_mat.c` lays its d projection matrix
out in — x²−y², z², xy, xz, yz — so the oracle comparison is element by element).

**The parameter decision.** Neither reference the app validates against
parameterizes second-row d; ICON8 (QCPE 517) does, with a paper behind each
number, so the table now carries Alvarez for s/p and ICON8 for 3d, named in
`parameters.ts` per element, along with the two ζ values the literature
disagrees about. The user's call, made knowingly: a PCl₅ or SF₆ number now
corresponds to no single published table, and that is said out loud in the file,
in the panel's model line and in the copied MO data.

**Verification is the strong part.** `bind` is built and runnable on lenovo and
its `lovlap.f` covers l = 2, so the fixture was generated by handing it a copy
of `eht_parms.dat` with the same four d lines injected (`BIND_PARM_FILE`), both
sides computing identical physics:

| what | measured |
|---|---|
| S, all 1431 pairs of PCl₅ (54 AOs) | max &#124;diff&#124; **1.07e-04** — the 4-decimal rounding floor the older fixtures document |
| occupied ladder (20 levels) | inside 0.002 eV |
| whole ladder (54 levels) | max 0.035 eV, in the highest virtuals |

bind prints only the UPPER triangle of S and leaves the rest zero, which is
worth knowing before comparing matrices: the lower triangle reads as a wall of
zeros, and a first pass mistook that for a 0.47 error in S(s,p) — the app's own
matrix is symmetric by construction, so compare against the triangle the oracle
fills. The fixture stores the mirrored matrix and its provenance says so.

**The picture.** The d functions needed three more things beyond the overlaps:
the isosurface amplitude (the normalized real harmonics and their gradients —
`∇[f/r²] = ∇f/r² − 2f d/r⁴`, which the mesh normals are built from; pinned to
10 decimals against the analytic value and against finite differences), the AO
view (four lobes per function, and for z² the two axial lobes plus the collar —
a p dumbbell would have been a lie about the shape), and the symmetry
machinery. `representationMatrix` had matched AOs by axis, and a d function has
none: its five are an l = 2 basis, so the rotation now acts through the 5×5
matrix built from the quadratic forms the five functions *are*. That test found
a real inconsistency — the numerators are the doubled cross terms (2xy, not xy),
so their normalizers are uniform apart from z²'s, and the first version was not
orthogonal.

The d character pin is the textbook one: a rotation by θ has character
1 + 2cosθ + 2cos2θ.

**A classifier lesson from SF₆.** Its 18 fluorine lone pairs sit at F 0.975 /
S 0.026, and the label was reading "lone pair F2–S1" — the 2.6% tail counted as
a second centre because the atom list used a 0.02 cutoff. The list now uses the
same `ATOM_CARRIER` (0.10) threshold the character test does, so a lone pair
reads as one atom and a bond reads as two. SF₆'s localized set came out as
6 F 2s lone pairs + 12 F 2p lone pairs + 6 σ S–F, with 3 S-centred nonbonding
virtuals and 6 σ* above them — a chemically correct picture that the s+p basis
could not have produced.

## The 3d question: what the references actually ship (2026-09-29)

The plan's Phase 2 premise is that yaehmop's basis should be taken wholesale,
"s+p+d for second-row", because "EH without 3d on S gives qualitatively wrong
MOs" for SF₆ and sulfones. Read the reference and that premise does not hold:

- **`~yaehmop/tightbind/eht_parms.dat` has no 3d line for Si, P, S or Cl.**
  (`AL` has one, zero-filled; `AR` has none.) The d entries it does carry are
  transition metals, lanthanides and actinides.
- **WebMO ships the same table.** Its EHT *is* internal — the help page says so
  ("low-level quantum chemistry calculations can be performed by a web browser
  without having to use an external computational chemistry engine"), matching
  the plan's note, and one of its `moledit_js` bundles carries an
  `;EHParameters` block byte-for-byte the same Alvarez data, same absence of
  second-row d. (A first reconnaissance claimed WebMO had no Hückel solver at
  all; reading `help/HuckelOrbitals.html` and the parameter block disproved it.
  Keep the plan's WebMO entry.)

So every fixture in `tests/references/eht` — and the app today — is an s+p
calculation for the second row, and the oracle *agrees* with s+p there. Adding
3d means leaving the oracle behind for exactly those elements.

**The machinery is verifiable even though the parameters are not shipped.**
`bind` is built and runnable on lenovo; `lovlap.f` covers l = 2 and the angular
step is `R_overlap_mat.c`'s `d_trans_mat` (d order x²−y², z², xy, xz, yz — which
is also the order a basis would have to use to stay comparable). A fixture can
be generated with a d-enabled parameter file given identically to both sides,
so the *integrals* can be pinned even when the *parameters* cannot.

**A citable source exists, but it is a different parameter set.** ICON8
(QCPE 517) ships second-row 3d defaults, each traceable to a paper:

| element | Hii (eV) | ζ (bohr⁻¹) | source | documented alternative |
|---|---|---|---|---|
| Si 3d | −6.00 | 1.383 | ICON8; Mollere & Hoffmann, JACS 97, 3680 (1975) | — |
| P 3d | −7.00 | 1.400 | ICON8; Boyd & Hoffmann, JACS 93, 1064 (1971) | ζ = 1.600 (Slater rule) |
| S 3d | −8.00 | 1.500 | ICON8; Chen & Hoffmann, JACS 98, 1647 (1976) | ζ = 1.817 (Slater rule) |
| Cl 3d | −9.00 | 2.033 | ICON8 BLOCK DATA | — |

The two ζ disagreements are real and unresolved in the literature. Mixing them
in would also mean one molecule carrying Alvarez s/p and ICON8 d — a hybrid no
paper published — and the app's SF₆/PCl₅ output would stop corresponding to any
single table. The opposite reading is defensible too: Alvarez's s+p-only second
row is a deliberate position, and the 1990s "no-d" result for hypervalency
supports it. **This is a parameter-provenance decision, not an implementation
one, so it is parked for the user to call** (PLAN.md's follow-up list).

## Localized orbitals: what the Hamiltonian can and cannot order (2026-09-29)

Phase 4b's chemistry: `chem/localized-orbitals/` — `mulliken-populations.ts`,
`localize-pm.ts`, `order-localized.ts` — the MO panel's **Ladder | Localized**
toggle, and `tests/localized-orbitals.test.ts`. Every number below was measured
before the code that depends on it shipped.

**The topology pins, as shipped** (order as displayed; energies are ⟨φ|H|φ⟩ in
eV, sort keys only, never shown):

| molecule | localized orbitals |
|---|---|
| water | 2 lone pairs (O, −21.72 / −14.80), 2 σ O–H (−22.05 each) |
| ethene | 1 σ C–C (−20.68), 4 σ C–H (−18.12), 1 π C–C (−13.23) |
| benzene | 6 σ C–C (−19.62), 6 σ C–H (−17.94), 3 delocalized π (−13.37) |
| N₂ | 2 lone pairs, 1 σ, 2 π |

That is PLAN.md's list exactly: water's two bonds and two lone pairs, ethane's
kind of bond set, and benzene's local σ framework under a π system that stays
delocalized. The localized energies sum to the sum of the occupied canonical ε
(Δ ≤ 7e-14) and the set stays S-orthonormal (CᵗSC = I, ≤ 1e-9) — invariants,
not the eV numbers, are what the tests pin.

**The ordering question, answered with numbers.** Localized orbitals are not
eigenstates, so there is no eigenvalue to sort by. Three findings decided the
scheme:

1. **The diagonal expectation ⟨φ|H|φ⟩ is always defined** and is the mean of the
   canonical energies the orbital spans. Sorted by it, water reads
   *lone pair, σ, σ, lone pair* — the aufbau picture, but not a legible list.
   Class first, energy within the class, is both: the class comes from the
   Mulliken populations alone (one atom and no bond → lone pair; two bonded
   atoms → σ or π by the perpendicular-p weight, bonding or antibonding by the
   sign of the A–B overlap population; three or more centres with parallel p
   axes → delocalized π).
2. **Fock-diagonalizing a pair is strictly stronger than the diagonal**, and is
   the only thing that works where PM is flat. Take ethene's C–C σ/π, mix them
   45° into two "banana" bonds: both bananas have ⟨φ|H|φ⟩ = −16.958349 — a tie,
   no order — while the 2×2 H block is off-diagonal by 3.7291 eV. Diagonalizing
   it recovers −20.687490 (σ) and −13.229208 (π). The block knows; the diagonal
   does not. `resolveFlatPairs` is that move (avo_ibo's), and it runs *after*
   the sweeps.
3. **It is empty on an exactly degenerate set, and that is a symmetry fact, not
   a limitation.** N₂'s π pair: ε = −15.591903366 both, and for arbitrary
   mixtures at 0°, 30°, 45°, 77°, 120° the H block is [[ε, 0], [0, ε]] to
   machine precision (|H₁₂| ≤ 8.9e-16) and the two expectations differ by
   0.00e+0. No rotation is defined and none is needed — the members are
   symmetry-equivalent, same class, same energy.

**The resolver is a guard, not a workhorse.** Across water, methane, ethene,
benzene, N₂, ethyne and pyridine, the number of pairs that are *both* PM-flat
(relative |L(0) − L(45°)| ≤ 1e-6) *and* H-coupled is **zero**. N₂ has three
exactly flat pairs and none of them is coupled; every other molecule has none
at all. EH's s+p Slater basis never quite produces the avo_ibo case: exact
flatness wants an exactly 50/50 split, and the σ/π partners then differ in s
character (ethene's pair is flat only to 3.55e-4, so PM has a weak opinion and
takes σ/π on its own). The pass stays, because it is what makes the pairing
canonical when symmetry does deliver a flat manifold, and
`tests/localized-orbitals.test.ts` pins it on a hand-built four-orbital case
(two shells, no s/p overlap, binding levels lowest) that is flat by
construction. Without it, that test's pair comes out as two equal-energy
bananas.

**Don't let H into the sweep.** The first cut let a flat pair take H's angle
*inside* the PM sweeps. It converges, but to a worse maximum: water's objective
fell from 3.212326667 to 2.6696 (three "lone pairs" on oxygen and a σ O–H with
0.49/0.19), because an objective-preserving rotation mid-sweep redraws the
landscape for every pair after it. PM's sweeps must run to convergence on PM's
own angle; H gets a separate pass.

**Two bugs the invariants caught, and the topology tests did not.**

- *The cross population must be symmetrized.* The row-wise Mulliken convention
  gives n_A(i,j) ≠ n_A(j,i), and the rotation's cross term carries their MEAN.
  Using the one-sided value makes the sweep descend — the first water run
  produced three lone pairs and no O–H bonds.
- *The rotation mixes rows, not columns.* `result.coefficients` is
  orbital-major (`coefficients[mo][ao]`), so rotating orbitals i and j rewrites
  rows i and j across every AO. The column-convention version is not even a
  similarity transform: CᵗSC = I broke to 0.38 on the first sweep, and the
  energies no longer summed. Both are pinned now — the analytic angle is
  checked against a brute-force scan of the same objective.

**Benzene's π came out on four centres, and that is not a convergence artifact.**
Each of the three π orbitals holds 0.50 / 0.24 / 0.20 / 0.05 on a ring
subsequence and ~0 on the other two carbons; the three are cyclic shifts of one
another. Twenty random S-orthogonal starting mixtures of the occupied space all
converge to the same objective, 7.324346593 — so the landscape has one maximum
here and the picture is what PM gives, not what the start gave. The label reads
"delocalized π · 4 centres" rather than pretending the sextet is uniform.

Refusals follow the house ladder: an open shell gets no list at all — an odd
count, or a degenerate set the count would only partly fill (O₂'s π*), both
from `closedShellOccupations`. Rendering is the existing picture unchanged: a
localized orbital is a combination of the same basis in the same frame, so the
isosurface and the AO-lobe view both draw it from a one-row coefficient matrix.

### The valence-virtual block (2026-09-29, later the same day)

Antibonding orbitals are the instructive half of the picture — a σ* or a π* is
what a chemist reaches for to show *why* a bond is where it is — so the list
now carries both blocks: an **Occupied** section and an **Empty —
valence-virtual** one, split by the `occupied` flag the classifier carries.

**The IAO/VVO screening step is a no-op here, and the code says so.** Derricotte
& Evangelista get valence-virtuals by projecting a full-basis virtual space
onto the minimal one by SVD and keeping the n_min − n_occ directions the
density can reach. Extended Hückel's basis IS minimal: the virtual space is
already n_min − n_occ dimensional and already spans that complement, so the
cross-overlap matrix is square and orthogonal and its singular values are all
one — degenerate, so the SVD selects nothing. What is left is the localization
itself, on the canonical virtual block. The module documents this rather than
labelling the result "VVO/IAO", which would imply a screening step that does
not exist. (PLAN.md predicted exactly this: "the screening has nothing to
reject — what remains of the step is basis orthogonalization".)

**What it produces** (measured before the code shipped, on the app's examples):

| molecule | empty block |
|---|---|
| water | 2 × σ* O–H |
| methane | 4 × σ* C–H |
| ethene | 4 × σ* C–H, 1 × π* C–C, 1 × σ* C–C |
| benzene | 6 × σ* C–H, 6 × σ* C–C, 3 × delocalized π* |
| N₂ | 2 × π*, 1 × σ* |
| ethyne | 2 × π*, 2 × σ* C–H, 1 × σ* C–C |

Every listed orbital has a *negative* strongest bond population, which is what
the σ*/π* labels key on, and the orthonormality of each block holds to 1e-15.
The energies are the textbook ordering too — ethene's π* (−8.2 eV) sits well
below its σ* (43.6 eV), N₂'s π* pair below its σ* — which is why both sections
sort by character and then by energy.

**A ring orbital must not be called a two-centre bond.** The old two-centre
test was "the top two atoms hold ≥ 0.80 of the orbital", and benzene's π* holds
0.49 / 0.31 / 0.14 — 0.80 on two of its carbons — so it came out labelled a
two-centre π* while its occupied partner (0.50 / 0.24 / 0.20 / 0.05) came out
delocalized. The test is now the *count of real carriers* (atoms above 0.10):
two carriers make a bond, three or more make it delocalized. Both benzene
orbitals now read "delocalized π", which is the same chemistry.

**The empty section needed its own asterisk.** With both sections in one list,
six rows read "delocalized π · 4 centres" twice — the occupied ring π and its
empty π* — which is exactly the ambiguity the section header cannot fix on its
own. The character therefore carries the out-of-phase sign for delocalized
orbitals too (`delocalized pi antibond` → "delocalized π*"), keyed on the same
strongest-bond-population sign the two-centre case uses. The asterisk means
"out of phase", not "empty": the section says which is which.

### Comparing two orbitals: the hyperconjugation picture (2026-09-29)

Clicking a second row adds it to the picture instead of replacing the first —
the interaction a chemist wants to *see* is a filled orbital and the empty one
it reaches into (a C–H σ and a π*, a lone pair and a σ*), and it cannot be seen
one orbital at a time.

- Each picked orbital takes its own phase pair from `MO_PHASE_PAIRS`, in the
  order picked: blue/orange (the long-standing default) first, then
  green/magenta, amber/violet, teal/pink. Both of its phases stay
  distinguishable, and so do the two orbitals.
- The list row carries the same colour as a dot, so the list and the picture
  cannot drift apart.
- The composition line describes the **last** orbital picked. Two orbitals have
  no joint composition, and the latest pick is the one being read.
- The isosurface cache became a keyed map (`mo:<i>` / `localized:<i>`, cleared
  on a new molecule and on an isovalue change) so picking, dropping and
  re-picking while comparing costs one extraction each, not one per frame.
- Multi-select is scoped to the localized view. The ladder's levels are
  canonical MOs, where "look at two at once" is the degenerate-set case the
  panel already draws side by side; a hyperconjugation pair is a localized-
  orbital idea.

## Extended Hückel: the solver and its oracle (2026-09-29)

**Shipped: the whole Phase 2 core, pinned against an independent oracle.**
`chem/extended-huckel/` holds the basis (`parameters.ts` — the Alvarez table,
extracted from YAeHMOP's `eht_parms.dat` rather than retyped, 31 main-group
elements; `assign-basis.ts`), the integrals (`slater-overlap.ts`), the
Hamiltonian (`hamiltonian.ts`) and the calculation (`solve.ts`), with the
generic `Hc = εSc` solver in `utils/eigen.ts` (Cholesky reduction + Jacobi).
No UI yet — that is Phase 3's level diagram.

**The oracle.** YAeHMOP `bind` 3.1.0b2, built from source on lenovo
(`~/yaehmop/tightbind/bind`; gcc+gfortran, `-DUNDERSCORE_FORTRAN`, an
`f77`→gfortran symlink because the Makefile hardcodes `f77`). WebMO's
built-in extended Hückel turned out to be **the same implementation**: its
parameter table is byte-identical text to `eht_parms.dat`, so WebMO is a
visual cross-check, not a second oracle. Fixtures for six molecules on the
app's own example geometries live in `tests/references/eht/` (the raw `.out`
files plus a distilled JSON), regenerated with:

    title / geometry (count, then "idx element x y z" in Å) / electrons N /
    molecular / nonweighted / printing overlap hamil wave functions
    orbital mapping end_print

then `bind <input>`; the output `<input>.out` carries the parameters it used,
the distance matrix, the S and H matrices, the wavefunctions and the
occupancies.

**Four things the oracle taught us the hard way.**

1. **Coordinates are Å, integrals are bohr.** `bind.h` carries
   `#define BOHR .52918` and converts; our overlap must do the same (we use
   the CODATA 0.529177210903 — the 2004 constant differs by 5e-6 relative,
   invisible at the fixtures' 4 decimals).
2. **`bind` defaults to the ABTH-weighted Hij form** (`fileio.c`:
   `weighted_Hij = 1`), not Hoffmann's plain K=1.75. The plan chose the plain
   form, so the fixtures are generated with `nonweighted` — without that
   keyword the comparison is off by up to 1.5 eV in H and 5 eV in the ladder,
   which is exactly how this was caught.
3. **The Fortran's `FACT(I)` is `(I−1)!`**, not `I!`. In `lovlap.f`'s
   binomial prefactors that convention is load-bearing: using true factorials
   made every l=1 integral exactly 3/4 of its correct value — a constant
   factor, which is what pointed at the prefactor rather than the sum.
4. **`bind` prints the upper triangle only** (the lower entries are zeroed),
   and the wavefunction block that follows has MO indices where AO labels
   would be — a naive matrix reader walks straight into it.

**Validation.** Two analytic pins (the textbook 1s–1s
`e^-ρ(1 + ρ + ρ²/3)`; the 1s–2pσ integral derived independently in prolate
spheroidal coordinates as `(ζR)⁴/8·[2A₃ − (2/3)A₁]`) plus the six-molecule
fixture comparison: S to 2e-4, H to 5e-3 eV, occupied levels to 0.002 eV —
the floor being the oracle's 4-decimal printing, since its H entries reach
~70 eV. The eigensolver is pinned separately (closed-form 2×2, trace,
orthonormality, S-orthonormality, and the residual `‖Hc − εSc‖`).

**Refusals.** An element outside the table (a transition metal, whose d shell
this basis does not have) gets no orbitals; an odd electron count, or an even
count that would fill only part of a degenerate set, gets no occupations
(`closedShellOccupations` returns null) while the solver still reports the
levels — the filling refuses, the maths does not lie. O₂ is the second case:
twelve electrons, and the π* pair is one set. The valence-electron table
moved to `chem/valence-electrons.ts` because the VSEPR picture and the EH
solver now both read it.

**Known limit, deliberately.** The s+p basis is what this table has for
main-group elements: Si/P/S/Cl get no 3d, so hypervalent molecules (SF₆,
PCl₅) run without d participation. Adding Alvarez's published d parameters is
a later step, and the oracle can still pin it — `bind` reads the parameter
file at runtime, so it can be fed the same extended table.

## The MO picture: diagram, phases, and what it refuses (2026-09-29)

**Phase 3 shipped.** `ui/mo-diagram.ts` is a fifth panel tab ("MO"): the
extended-Hückel ladder drawn as SVG — energy up the left, one line per
orbital, occupied levels solid with their α/β pair, HOMO/LUMO tagged — and
clicking a level draws that MO over the molecule through
`render/mo-lobes.ts`.

**The second orbital picture, named by model.** The VSEPR/hybrid lobes were
`render/orbitals.ts`; with MO lobes in the app the ambiguity was real, so the
constitution's own rule applied: `hybrid-orbitals.ts` (VSEPR hybrids, lone
pairs, one colour per type) and `mo-lobes.ts` (EH MOs) now sit side by side,
and the functions are `renderHybridOrbitals` / `renderMoOrbitals`. The two
never draw together — an MO and the hybrid lobes are two answers to the same
question, so selecting a level takes the stage and the hybrid group returns
when the selection clears (the Build tab's checkbox records the *intent*;
`rebuildDisplay` resolves visibility).

**Phases are the point.** An MO lobe is an axis-aligned dumbbell — the p axis
it was computed on — with its two halves in opposite colours (the app's π
blue against a warm orange). Sizes are relative to the largest coefficient in
the MO and contributions below 8% of it are dropped, so a delocalised MO
stays readable. Measured on benzene's HOMO (MO 15, −12.797 eV): the
coefficients are C2/C3 = −0.457 and C5/C6 = +0.457 with C1/C4 = 0 — the e1g
partner with nodes through two opposite carbons, so the picture shows four
dumbbells and *nothing* on the nodal atoms, which is exactly the teaching
point. The deepest MO, by contrast, is all six C 2s in phase.

**The axis is windowed, never truncated.** Deep σ levels and very high
virtuals sit tens of eV from the frontier and would flatten everything
between, so the axis spans the occupied ladder ±4/+6 eV; levels outside it
are drawn as dashed edge markers carrying their energy, and the count of
them is stated. Nothing is silently dropped — the same rule the rest of the
app follows.

**Refusals.** An open shell shows its ladder with no occupancy arrows and
says why: "extended Hückel as built here has no spin, so occupancies are not
shown." That covers an odd electron count and an even count sitting in only
part of a degenerate set. Verified with a methyl radical (7 electrons): 7
levels, zero arrows, the note. O₂ (12 electrons, the π* pair only partly
filled) gets the same note. A molecule with an element outside the parameter
table gets no ladder at all, just the reason.

**Cost of the feature:** one render module, one UI module, a tab, and the
`moIndex`/`showOrbitals` display state. No chemistry changed — the solver was
already pinned against the oracle, so the picture is only a view of numbers
that were already verified.

## The frame decides what "pz" means (2026-09-29)

**Reported:** MO 15 of a benzene — the π HOMO — came out with lobes slightly
skew to the ring plane and extra p orbitals mixed in, where WebMO shows a
clean π system. The coefficients explained it: on the user's local-pipeline
geometry, 6 of the 12 drawn AOs of that MO were **not pz** (C2 2px −0.063,
C3 2px −0.090, C3 2py +0.055, …).

**Cause.** The AO basis is tied to the *coordinate* axes: "2pz" means the p
orbital along z. That is only chemistry when the molecule's symmetry planes
are coordinate planes — true of the hand-written examples, false of anything
fetched or locally embedded, where a ring lands in whatever plane the
algorithm produced. Measured on three geometries: the example benzene (ring
in xy) → 4 significant AOs, all pz; the same molecule *rotated* → 12 AOs, 8
of them not pz; the local pipeline's benzene → 10 AOs, 4 not pz. The
calculation was right, the frame was arbitrary, and the picture made that
look like a wrong orbital.

**Fix.** Run the calculation in the molecule's own frame: `align-principal-axes.ts`
diagonalizes the inertia tensor and puts the largest principal moment along
z. For a planar molecule the perpendicular-axis theorem puts the plane normal
there (the largest moment is the sum of the two in-plane ones), so a ring
lands in xy and its π system is pz — the textbook picture. The basis axes are
mapped back to the molecule's coordinates for rendering
(`frameDirectionToWorld`), so the displayed structure is untouched: the
calculation frame is a private matter of the solver.

The frame is deterministic — axes ordered by moment, signed so their largest
component is positive, completed right-handed — so the same molecule always
gives the same labels.

**Verified.** The reported geometry: 6 of 6 drawn AOs are now pz, and the
drawn pz lobes are perpendicular to the ring plane (cos = 1.000000). A
rotation of any molecule moves no level (max |ΔE| = 4e-13 eV) — the physics
is frame-free, which is the invariant the tests now pin. The fixture
generator (`scripts/eht-fixtures.ts`) aligns its coordinates the same way, so
the oracle still speaks the same language; the fixtures were regenerated and
all six molecules still match to 2e-4 (S), 5e-3 eV (H) and 0.002 eV
(occupied levels).

**Also fixed in the same pass:** the composition line now lists exactly the
AOs the lobes are drawn for (`MO_SIGNIFICANT`, 8% of the MO's largest
coefficient). It had been listing numerically-tiny coefficients as
contributions — a π MO claimed "+24 more", all rounding noise.

## Degenerate sets: canonical orbitals (2026-09-29)

**Reported:** the same benzene, still. With the frame fixed the π HOMO drew
only pz lobes, but as an arbitrary mixture of the two members — where WebMO
shows the textbook pair (one member with nodes through two opposite atoms,
the other through two opposite bonds). The reporter also pointed at WebMO's
**symmetrizer**, which snaps a geometry to its point group *before* the
calculation; that is why WebMO's e1g pair is exactly degenerate (−12.656
twice) where ours splits by 3e-4 eV on the local embedder's geometry.

**Cause.** A degenerate set is a *subspace*. The solver returns *an*
orthonormal basis of it, and any orthogonal combination inside it is the same
physics — so two programs hand you different representatives of the same
answer. Comparing them one-to-one compares arbitrary choices. Neither the
frame fix nor a more accurate solver changes this; it is a property of the
question being asked.

**Fix.** `canonicalize-degenerate.ts`: after solving, group the levels that
sit within `CANONICAL_TOLERANCE_EV` (1e-5 eV — the diagram's 5 meV grouping
is a separate display choice, see "Two tolerances" below) and, inside each
group, diagonalize x², then y², then z². Those operators are
diagonal in the AO basis (an AO sits on one atom) and, whenever the molecule
has symmetry, they *are* symmetry operators — so their eigenvectors are the
symmetry-adapted combinations, without detecting any point group. The
operators use the *framed* atoms, so "x²" means the same x the labels do.
A final deterministic pass signs every MO so its largest coefficient is
positive (phase colors stop flipping between molecules).

**Measured.** The reporter's benzene: MO 15 → four pz coefficients
(nodes through two opposite carbons), MO 14 → all six (nodes through two
bonds) — the textbook pair, and what the app now draws. An isolated O atom's
p set comes out as pure 2px / 2py / 2pz. Canonicalizing twice changes nothing
(idempotent), and the subspace projector is unchanged to 1e-12 — the rotation
is strictly *inside* the set.

**The residue.** The reporter's ring is a few 1e-4 Å off perfect symmetry, so
its "nodal" coefficients are 0.056 rather than 0 — the canonical member sits
about 3° off the ideal atom-nodal combination, because the frame's in-plane
axes (arbitrary for a six-fold ring) are decided by that very asymmetry. The
drawn picture is unaffected: 0.056 is far below `MO_SIGNIFICANT` (0.08), so
the member still draws as four lobes. The test asserts the *drawn* signature
for exactly this reason.

**Not done, and why.** A symmetrizer (snap the geometry to its point group,
as WebMO does) would remove that residue and make our degenerate pairs
exactly degenerate, matching WebMO's numbers digit for digit. It is a
separate feature with its own risks — it *moves the user's structure* — and
nothing here needs it: the canonical orbitals are the right shape either way.

Phase 4 will want the same machinery: the PM localization diagonalizes a Fock
matrix inside each degenerate set (`avo_ibo`'s "degeneracy resolution"), which
is this pattern with a different operator.

**Two tolerances, not one (same day).** The solver's rotation and the
diagram's grouping had been the same constant, which is wrong in a way that
only shows up on accidental near-degeneracies: pyrrole has two levels from
*different* irreps 4.3 meV apart, under the 5 meV grouping, so the solver
rotated two states that are not degenerate — replacing two eigenstates with a
mixture. Right energies, wrong orbital. The solver now uses
`CANONICAL_TOLERANCE_EV = 1e-5` (a symmetry-required degeneracy on a snapped
geometry is exact to ~1e-9 eV, so this separates real from accidental by five
orders of magnitude) and the diagram keeps `DEGENERATE_TOLERANCE_EV = 0.005`
as the display choice it always was. The π orbitals of pyrrole were checked
against the C2 permutation directly (impurity exactly 0 or 2 — one parity or
the other, never a blend).

## Symmetry: detect the point group, snap the geometry (2026-09-29)

**Reported:** "a student or a novice would expect a structure which their mind
ought to be perfectly symmetric to come out perfectly symmetric, even though
PubChem/CACTUS/MMFF94 doesn't return it as such." Their earlier hint — WebMO
symmetrizes *before* the MO calculation — is why its degenerate pairs are
exactly degenerate and ours split by 3e-4 eV.

**How far off are we?** Measured through the app's own paths:

    molecule   local pipeline (embed → MMFF94)      fetched (PubChem)
    benzene    C–C spread 0.08 mÅ, planar 0.18 mÅ   spread 0.16 mÅ, planar 0.08 mÅ
    water      O–H spread 0.02 mÅ                   0.00 mÅ
    methane    C–H spread 0.02 mÅ                   0.00 mÅ
    PCl₅       Cl–P spread 32 mÅ (generic params — axial/equatorial are
               inequivalent, so this is chemistry, not noise)

Bond lengths are tight, but the *positions* are not: benzene's atoms sit
1.1 mÅ from exact D6h, and pyridine's ~2.5 mÅ, because MMFF94 converges on the
energy and a ring's angular positions are a soft mode. Phenol drifts ~20 mÅ —
an unconverged O–H torsion, which also costs almost nothing.

**Design** (`geometry/symmetrize.ts`). Candidate axes and mirror normals come
from the atoms themselves (atom directions, pair sums, differences, cross
products); an operation is accepted only if it maps every atom onto an atom of
the *same element* within the tolerance, which is what keeps a
para-disubstituted ring from averaging its two different substituents; the
accepted set is closed under composition so the average is a projection; the
symbol comes from the census of the closed group. Nothing assumes which point
group a molecule "should" have — no symmetry, no snap (C1, untouched).

**Two bugs the measurements caught, both worth remembering.**
1. The candidate directions include ~100 near-duplicates (the cross product of
   two nearly-parallel atom vectors is a noisy version of the plane normal), so
   benzene's seed had 135 operations that are each genuine but differ by
   ~1e-3. Comparing matrices at 1e-6 made every one of them "new", the
   composition closure drifted and hit the 120-operation cap, and *every*
   symmetric molecule came back C1. `sameMatrix` now compares at 1e-2, where
   genuinely different operations (~1 apart) are still distinct.
2. One projection leaves the geometry symmetric only as well as the accepted
   operations were exact — ~1 mÅ, which would split a degenerate pair by
   ~1e-3 eV, the very thing this exists to remove. The projection therefore
   runs to a fixed point: re-detecting on the projected geometry finds the
   same operations exactly and the second projection lands on the subspace.
   Re-snapping a snapped molecule now moves atoms by ~1e-15 Å.

**Tolerance: 0.02 Å, and it is a permission, not a force.** An operation is
only accepted if the geometry already satisfies it that well, so the actual
movement is the geometry's own deviation (0.8 mÅ for benzene, not 20). The
margin below real chemistry is ~2.5×: a Jahn–Teller bond difference, a
puckered ring, a twisted biaryl are all ≥0.05 Å, and no source we have (all
force-field geometries) produces a meaningful distortion in the 0.005–0.05 Å
band.

**Measured results** (local pipeline, 20 mÅ):

    methane Td, ethene D2h, benzene D6h, water C2v, N₂/O₂/ethyne D∞h,
    pyridine C2v, pyrrole C2v, imidazole Cs, but-1-en-3-yne Cs, phenol Cs
    shifts: 0.03–2 mÅ, phenol 8.6 mÅ — all far under the permission

The payoff: **benzene's e1g pair splits 2.27 meV before and 1e-9 meV after**
(methane's t₂: 0.36 meV → 1e-9), the dipole of a symmetric molecule comes out
exactly 0.00 D, and the canonicalization can then use its tight tolerance
because the degeneracies it rotates are now exact.

**Two molecules it does not get right, deliberately.** SF₆ comes back C1 (the
closure refuses rather than trust a spurious set) and PCl₅ snaps to C4v —
both run on generic MMFF94 parameters, which wreck the geometry outright
(PCl₅'s Cl–P–Cl angles come out 82.8/110.8/138.4°, nothing like a trigonal
bipyramid). The app already warns about those parameters; a symmetry label
describes the geometry we drew, and for those two the geometry is not worth
describing.

**Not done:** an eight-fold axis is not tried (S₈, cyclooctatetraene's D₄d) —
missing an operation only means a smaller group is found; the cubic families
are covered (T, Td, Th, O, Oh) but not the icosahedral ones. The snap is on by
default with a "Snap to point group" toggle next to "Force local lookup", and
it is always reported in the Info log, never silent.

## What the symmetry is actually used for (2026-09-29)

Asked the day the symmetrizer landed: "are our MO calculations taking
advantage of this?" The honest answer is *the result is, the solve is not*.

Exploited today:
- **Exact degeneracies.** On a snapped geometry a symmetry-required
  degeneracy is exact to ~1e-9 eV (benzene's e1g pair: 2.27 meV split before,
  1e-9 after), which is what lets the canonicalization use a 1e-5 eV
  tolerance and still find them.
- **Canonical orbitals.** The x²/y²/z² diagonalization lands on the textbook
  member because the geometry has the symmetry the operators are testing for;
  on an unsnapped geometry it can only approximate it (the 0.056 residue
  measured on the reporter's ring).
- **The calculation frame.** The principal axes are exact, so "pz" means the
  symmetry-correct axis to the last digit.

Not exploited, and deliberately:
- **No irrep blocking.** The solver is one dense generalized eigenproblem
  (`solve.ts`), not a block-diagonalization by irreducible representation. The
  speed is not the reason to do it — the basis is 30-200 functions and the
  Jacobi solve is 1-30 ms, while the *surface* of an MO costs 50 ms. The
  reason would be **labels**: "MO 15 is e1g" is the single most useful thing a
  level diagram can say, and it is the feature to build next if it is wanted.
  Cost: a character table for each detected group (the symmetrizer already
  hands over the operations, and χ_basis(g) is the trace of a signed
  permutation matrix — cheap), then either label the solved MOs by their
  characters or project SALCs and solve block by block. A day, not an
  afternoon, and worth its own commit.

## The MO picture, smoothed: the isosurface (2026-09-29)

**Asked for:** "we're showing individual AO's in our molecular orbitals. Let's
'smooth' them so they appear as in other programs, with an option to not have
them smoothed... it's very informative to see how the MO's are composed of
AO's, but show smoothed MO's by default."

Both views now exist and read the same coefficients. `mo-lobes.ts` is the
per-AO view (which AO, which phase, how much — the composition line in the
panel describes exactly the set it draws); `mo-surface.ts` +
`render/mo-isosurface.ts` are the smooth one, `|ψ| = c` extracted by marching
tetrahedra with the phase as a per-vertex color. Default on, toggle in the MO
panel, cached per selected level (`ctx.moSurface`) because it costs ~50 ms.

**The convention is the whole correctness story.** A surface is a statement
about *relative* amplitudes, so it is only as right as the Slater
normalization behind it — and it has to be the one the overlap integrals
assume: ζ in bohr⁻¹, the Mulliken normalization of `slater-overlap.ts`, i.e.
(2ζ)^(n+½)/√((2n)!)·r^(n−1)e^(−ζr)·Y. The test pins a 1s to its textbook value
to ten digits. The evaluation runs in the *calculation frame* (where "pz" means
what the coefficients mean) and the vertices are mapped back to the molecule's
coordinates on the way out, so the displayed structure is untouched.

**Two bugs worth remembering, both found by looking at the picture:**
1. The crossing interpolation was the *zero*-crossing form `fu/(fu−fv)` —
   correct for the ESP's field, which crosses zero, and an extrapolation for
   an isovalue. Every vertex landed outside the grid (the surface measured
   18 Å across on a 3 Å molecule) and the phase split came out 94/6. It is
   `(iso−fu)/(fv−fu)` here.
2. The phase was read from |ψ| — which is never negative — so the first
   version painted everything positive.

**Calibration.** The isovalue is a *fraction of the MO's own grid peak* (0.2),
not an absolute number: every MO is then drawn at the same fraction of its own
peak, which makes a bonding/antibonding pair read as a shape difference rather
than a size difference as the user clicks down the ladder. At 0.2 a pz lobe is
~1.2 Å long, which is what the STO actually gives at 20% of its peak (checked
by hand against ζ = 1.57 bohr⁻¹). 0.1 was tried first and swallowed the
molecule.

**Performance.** The naive evaluator was 158 ms per MO, which is a visible
stall on every level click. Two fixes: precompute the per-orbital constants
(the normalization involves a power and a factorial — it was being recomputed
at every one of ~2M grid points) and write out the r^(n−1) powers (n is 1 or 2)
instead of `Math.pow`. 54-70 ms now. The grid is bounded by the atoms the MO
actually uses (coefficients ≥2% of the largest) and coarsens itself above
400k points, so a large delocalized MO cannot stall the frame.

*[Corrected 2026-09-30 — the level is no longer a fraction. A fraction fails
when one centre dominates an orbital: 20% of the sulfur peak in a sulfur HOMO
draws the halogen lobes so small they vanish, so 2585917 capped the fraction
and 49a02ec replaced it with an absolute amplitude in bohr^-3/2, which is what
the panel's control sets today. The shape-versus-size reasoning below no longer
describes the code; the "Two isovalue defaults" entry above has the
measurements that replaced it.]*

**Verified:** benzene's e1g HOMO is four lobes on alternating carbons with a
49.6/49.4 phase split, the mesh is closed (every undirected edge in exactly
two triangles, 12,756 of them), the analytic gradient matches a central
difference to 9 digits as h → 0, and the app draws both views with the toggle.

**Follow-up, same day: "they're a bit jagged", and an opacity slider.**
Reported with a water screenshot, plus the fair question of *which*
isosurface: it is `|ψ| = 0.2 × that MO's own peak on the grid` — a fraction,
not an absolute value, so every MO is drawn at the same fraction of its own
peak and clicking down the ladder compares shapes rather than sizes. The
screenshot was water's MO 4 (the 1b1 lone pair, −14.80 eV, `O1 2pz +1.00`),
whose surface has a radius of 0.94 Å — the size is right, the facets were not.

The grid only ever *coarsened* (a fixed 0.25 Å cap), which gives ~0.14 Å
facets — a dozen flat faces on a 1 Å lobe, and that is what the eye reads as
jagged. The step is now chosen from an evaluation budget (4M amplitudes,
floored at 0.1 Å): water lands at 0.135 Å and 0.056 Å facets, benzene's HOMO
at 0.15 Å, and a large delocalized MO coarsens rather than stalling. The finer
grid multiplies the tetrahedra, so the extraction loop was rewritten to drop
its per-tetrahedron allocations — the same water run went from 2.75 s to
0.69 s for six surfaces.

Opacity is now a slider in the MO panel ("MO Opacity", 0.15-0.9, default 0.85
— the old effective value was 0.6, which is what "bring the transparency down"
was about). It drives both MO views: the isosurface uses it as given, the AO
lobes pass it through their style transform as before. Note for whoever
touches these next: the ESP's sibling slider is *labelled* "ESP Transparency"
but its value is the opacity and it goes up as the surface gets more solid —
this one is labelled for what it does, so the two read differently on purpose.

**Follow-up: "the MO Opacity slider isn't working."** It was not, in the
default configuration. The app's default orbital style is **metallic**, and the
first implementation keyed transparency off the *style*: metallic built an
opaque material, so `opacity` was inert and the slider did nothing. My own
check missed it because the style had been switched to glass while probing for
something else — a verification confounded by state I had changed. The rule is
now the one the slider's label implies: **the opacity is the slider's, in every
style and both MO views; the style sets only the gloss.** The two-pass
far-side-depth trick is selected by `alpha < 1` rather than by the preset, so
"opaque" and "translucent" are properties of the opacity, not of a style name.

Two related affordances came out of the same report: the smooth toggle and the
opacity slider are now disabled while no level is selected (dragging a control
that cannot do anything reads as a bug), and the AO view takes the same opacity
the isosurface does, so switching views does not change how solid the orbital
looks.

**Follow-up: "something dreadful happened to water's isosurface — it looks
like the surface clipping from carbon tetrachloride."** It was my bug, and my
*first* diagnosis of it was also wrong. Correcting the record, because the
wrong version was in this file for an hour:

The outward direction of the |ψ| = c surface is **−∇|ψ|**, i.e.
**−sign(ψ)·∇ψ**. A gradient points toward *increasing* values, and |ψ|
increases *inward*, so the gradient points inward and the outward normal is its
negative. The first isosurface commit compared the winding against ∇ψ alone,
which wound the positive sheet inside out; the "fix" I then wrote compared
against sign(ψ)·∇ψ, which wound *both* sheets inside out. Symptoms, in order:

    winding vs ∇ψ            positive sheet inverted, negative sheet correct
                             → with the metallic (opaque, DoubleSide) default
                               this looked fine; the moment the surface became
                               translucent it took the FrontSide path, the
                               positive sheet was culled, and the big orange
                               (negative) lobe showed a "bite".
    winding vs sign(ψ)·∇ψ    both sheets inverted → the FrontSide pass drew
                             nothing but the silhouette, and the far-sheet
                             depth pass hid even that: "the barest hint".

The vertex normals were inverted the same way all along (they used the same
sign), which is why the surfaces still shaded plausibly under DoubleSide —
THREE flips the normal for back-facing fragments, so two wrongs made a
right-looking picture.

**Why the test I wrote did not catch it.** It compared each triangle's winding
against its own vertex normals — but both are derived from the same ∇ψ, so it
was tautological about the global sign and could only ever detect
*inconsistency*. The test that does catch it judges the mesh against a shape
whose outside is known independently: a single 1s orbital's isosurface is a
sphere centred on the nucleus, so every triangle's geometric normal must point
away from the origin, and every vertex normal with it. That test now exists,
for both a positive and a negative coefficient.

**One more real bug found on the way.** The evaluator skipped any orbital
within 1e-6 Å of its nucleus, which is right for the 1/r singularities of p
orbitals but wrong for a 1s: it is *finite* at the nucleus — it peaks there —
so the field dipped below the isovalue at a point the surface should enclose,
putting a spurious little sphere at every hydrogen (72 stray vertices, radius
0.02–0.5 Å, inside the real surface). Handling that point exactly fixed it, and
the sphere test now pins the radius to within the interpolation error (0.0104 Å
across 24,264 vertices, which is the marching-tetrahedra chord error, not a
defect).

**Verified:** for a lone 1s, 8,088 of 8,088 triangles wound outward, vertex
normals 100% outward, radius 0.848–0.859 Å (hand-checked against
ln(1/0.2)/ζ = 0.851 Å, which also confirms the normalization chain end to end),
and in the app water's MO 2 draws as two complete closed lobes in opposite
phases.

## The linear-molecule p labels: left alone on purpose (2026-09-29)

N₂'s σ HOMO is the p orbital *along* the molecular axis, and the panel calls it
"2py". That is correct for the frame the calculation ran in — it is just not
the textbook convention, and the reviewer's call was to leave it that way.

The frame is genuinely arbitrary for a linear molecule: the two non-zero
moments of inertia are equal, so "largest moment along z" has nothing to
distinguish the perpendicular axes and the choice between them carries no
chemistry. The tempting fix is to align the molecular axis with z, which would
make the σ orbital read 2pz and (through the canonicalization) give the π pair
as px/py.

**Why we did not do it.** The oracle fixtures in `tests/references/eht/` are
YAeHMOP's own output for coordinates aligned by `scripts/eht-fixtures.ts`, and
they are frame-tied. Re-aligning them means editing the ground truth, and a
fixture edited by hand compares our code against our edit: the independence
from YAeHMOP — the entire point of pinning against an oracle — is gone unless
the oracle is rerun, and it cannot be rerun here (it was built on another
machine; see "Extended Hückel: the solver and its oracle"). I had argued the
edit was "sign-free" and mechanical: the transformation is in fact a *signed*
permutation (a proper rotation about x sends y→z, z→−y, so new-py = −old-pz),
and while the matrix *entries* are sign-invariant — the affected couplings are
exactly zero for a linear molecule — that is a much weaker statement than it
sounds and it does not touch the real argument, which is about provenance.
Oracle data stays verbatim.

**What we did instead**, since the label is only confusing, never wrong:
- a caveat in the composition readout, where the labels are, whenever the
  molecule is linear (N₂'s σ HOMO now reads "… (linear molecule: the
  perpendicular p axes are degenerate, so these px/py/pz names are the
  calculation frame's choice)");
- a comment at the fixture comparison in `tests/extended-huckel.test.ts`
  warning against "fixing" the alignment;
- this entry.

**A layout bug fell out of it.** The composition block is a flex item with
`min-height: 0`, so a note that made it wrap was squeezed below its content and
the overflow landed on the controls underneath (the checkbox drew straight
through the sentence). It now keeps its own height and `#mo-body` scrolls, as
it was always meant to.

## Mulliken irrep labels, computed not tabulated (2026-09-29)

"MO 15 is e1g" is the most useful thing a level diagram can say and the thing
a student writes down. `chem/extended-huckel/irrep-labels.ts` produces it —
with no character tables, which is what keeps it small enough to be worth
having.

Two facts carry it. First, the character of an operation in the AO basis is
nearly free: each AO is carried onto another atom by the operation's
permutation, so only the atoms it *fixes* contribute to the trace — an s
orbital contributes 1 and the p set contributes trace(R). (A p orbital is a
polar vector, so it transforms by R itself; that is why an inversion gives the
p block −3 and the s block +1.) Second, a *set* of MOs has a basis-independent
character — Σ ψᵀ S D(g) ψ over the set is the trace of g on that subspace —
so it does not matter which mixture inside a degenerate set we happen to hold.
Naming is then the operational Mulliken rules: a/b from the sign under the
principal rotation, e/t by dimension, 1/2 from a reference operation, g/u from
the inversion, ′/″ from a mirror perpendicular to the axis, and e_k from
χ(Cₙ) = 2cos(2πk/n).

**Measured against the textbook** (all six examples, occupied sets):
water a1 b2 a1 b1; methane a1 t2 t2 t2; N₂ σg σu πu πu σg; ethyne σg σu σg πu
πu; benzene's π ladder a2u / **e1g (the HOMO pair)** / e2u (the LUMO) / b2g.
In the app: "MO 15 · −12.804 eV · e1g · occupied".

**Three bugs the first pass had, all worth remembering.**
1. The p coefficient used the *source* AO's axis instead of the target's, so
   the matrices were not representations at all (methane read t1, and every
   linear π came out g). The invariant that catches this class is
   D(g)D(h) = D(gh) — a representation, checked directly.
2. The linear path divided the character by 2 for a single orbital: χ(C₄) is
   cos(mπ/2) for one orbital and 2cos(mπ/2) for a degenerate *pair*. And an
   individual π partner's diagonal character is basis-dependent, so the linear
   path now groups degenerate sets before taking characters, exactly as the
   rest of the module does.
3. The linear inversion pairing demanded 1e-6 Å of exact opposition, but the
   linear snap puts atoms on the axis without centring them on the inversion
   centre — so opposite atoms sit a few 1e-4 Å off and every atom "inverted
   onto" itself, making every π read g. Match the nearest opposite instead.

**On the conventions.** The letter, the degeneracy, g/u, ′/″ and e_k are
convention- and orientation-independent. The *numeric* subscripts (a1 vs a2,
b1 vs b2, t1 vs t2) depend on which reference operation the convention picks,
and the standard's tie-break is "the axis through the most atoms" — which is
what makes water's out-of-plane lone pair b1 and benzene's π labels come out
as the textbook prints them. Candidates that tie are related by the group's own
symmetry, and a character is a class function, so the choice among them is
harmless. A source that uses a different orientation for the same molecule may
therefore number its subscripts differently while agreeing on everything else —
worth knowing before "fixing" a label against one reference.

Also renamed the ESP slider to "ESP Opacity": its value always was the opacity
and it goes *up* as the surface gets more solid, so the old label described the
opposite of what the control did.

## The halides' MO lobes: it was the isovalue (2026-09-29)

**Corrected the same day, in the next entry.** The isovalue reading below is
the fourth wrong diagnosis. The surfaces were small because the radial factor
was the 2p formula for every shell. The panel control stays; it was not the bug.

**Reported:** sulfur dibromide's HOMO draws the sulfur lobes whole but the
bromine's as slivers, worse down the group — SF₂ and SCl₂ fine, SBr₂ crescents,
SI₂ almost nothing, and iodine invisible even in I₂. The reporter's guess
(atomic radii) pointed at the right variable.

**The answer, now that the isovalue is a user-facing control:** the level was
simply too high. At 0.04 the iodine's lobes are a sliver; at 0.02 they are
whole lobes. These HOMOs peak on sulfur, so a fraction of the *global* peak puts
the halogens' contributions near the level, and a level set that close to an
amplitude's peak is a scrap.

**Three wrong diagnoses, all from reasoning instead of measuring the right
thing.** Worth recording because the pattern is the point:

1. *Grid clipping.* Measured: the closest vertex to a box face was 0.9 Å. The
   resemblance to the CCl₄ ESP clipping was a trap.
2. *Bad shading normals.* 19% of triangles had geometric and shading normals
   disagreeing by >60°, which looked decisive. Replacing the trilinearly
   interpolated ∇ψ with the analytic gradient changed nothing (3,137 → 3,035).
   Kept anyway — exact instead of interpolated, and it drops a 4.8 MB array.
3. *The atom's drawn sphere hiding the lobe.* Measured on SBr₂, the bromine's
   amplitude falls below 0.045 at 0.55 Å from the nucleus and the sphere is
   0.555 Å, which fit perfectly. But the "hiding the atoms" test that was
   supposed to confirm it never applied — the control-panel toggles go through a
   `requestAnimationFrame` debounce, and in the headless tab that frame never
   ran, so I was reading a stale screenshot. The reporter, who does hide the
   atoms, then reported the lobes still absent, which rules the sphere out.

The lesson is narrower than "measure first": all three of these *were* measured.
What was missing was measuring the thing the user actually controls — the
isovalue — and noticing that my confirming test had produced no change at all.
A test whose result is "nothing happened" is not a confirmation.

**Shipped instead:** the isovalue is a panel control (`MO Isovalue`), offering
0.02, 0.03, 0.04, 0.06 and 0.10, defaulting to the 0.04 that was calibrated
against other programs' pictures. Changing it re-extracts the surface (the
cache is keyed on the level). It is the honest knob for this: how much of an
orbital you see is exactly what the level decides, and no single number suits
both a compact bonding orbital and a diffuse halogen's contribution to a MO
that peaks elsewhere. The earlier 20%-of-peak-with-a-cap rule is gone — it was
a guess at a display preference, and the user is better placed to make it.

## The halides' MO lobes, corrected: the radial power (2026-09-29)

**The bug.** `evaluatePrepared` wrote r^(n−1) e^(−ζr) as "1 or r".
That is the 1s/2p formula, and the comment said so: "n is 1 or 2 in this
basis". The basis is not. Alvarez's table, which the overlap integrals use
in full, gives chlorine and sulfur n = 3, bromine n = 4, iodine n = 5. The
normalization (2ζ)^(n+½)/√((2n)!) was computed with the real n and then
multiplied by the wrong power, so every shell above 2p was a 2p shape
wearing a heavier atom's normalization. The overlap matrix was never wrong —
YAeHMOP's radial integrals already carry n — only the picture.

**What that does to a lobe.** The radial maximum of r^(n−1) e^(−ζr) sits at
(n−1)/ζ. For iodine 5p (ζ = 2.322) that is 0.91 Å, and the amplitude there
is 0.193. The 2p formula peaks at 0.23 Å instead, and at 0.91 Å it is
smaller by r³ ≈ 5, about 0.038. A π coefficient of ~0.7 then leaves ~0.027
where the lobe should be, which is why I₂'s π sheet dies at isovalue 0.03
and at 0.10 is a scrap. The outer radius of a lone 5p at |ψ| = 0.10 was
0.58 Å. Iodine's ball-and-stick sphere is 0.3 × 1.98 = 0.59 Å, so the sheet
lived inside the sphere — white space once the atoms are hidden, a sliver
when they are not.

The same ratio is r^(n−2). Fluorine is n = 2, so SF₂ was untouched.
Chlorine is n = 3 and the lobe region is only about 15% low, which is why
SCl₂ looked fine. Bromine is n = 4 (r² ≈ 2 at its true maximum, 0.74 Å) and
iodine n = 5. A σ MO is the smaller amplitude of the two, so it drops
through a given isovalue first. That is the split reported on Br₂: the σ
sheet at 0.06, the π sheet at 0.10.

**Checked after the fix.** The value and the analytic gradient of a 3p, 4p
and 5p match the Slater formula (the gradient against a central difference).
A lone iodine 5p at isovalue 0.10 reaches past 1.2 Å; the old sheet was
inside 0.58 Å. Br₂ and I₂, every valence MO, at isovalue 0.10: 40–50k
vertices, the furthest of them 1.24–1.45 Å from a nucleus. Water and benzene
are n ≤ 2, so their surfaces do not move.

The surface and the overlap integrals now share one Bohr radius
(`BOHR_RADIUS` = 0.529177210903 Å). The surface had been using an older
reciprocal, 1.8897259886, which differs in the eighth digit. No lobe moves
at the precision a picture has; the 1s pin is what notices.

## The representation, the mirror, and O₂'s filling (2026-09-29)

Three bugs left after the textbook labels were already green. Each one is
invisible to a character that only reads a diagonal.

**The p block was the transpose.** An operation R sends a p orbital of axis
û to one of axis Rû on the image atom, so the matrix element onto a target
axis v̂ is (Rû)·v̂. The code rotated v̂ instead and dotted it with û. The
diagonal of R equals the diagonal of Rᵀ, so every trace came out right —
water's a1 b2 a1 b1, methane's t2, benzene's π ladder — and a C3 that mixes
px with py was not a representation. On methane the product rule
|D(a)D(b) − D(ab)| was 6; with the source axis it is 0, over all 24×24
products of Td. The same contraction is now cᵀ S D c. Skipping a row whose
coefficient happens to be zero dropped neighbours that S couples in.

**σh disappeared once the ring lay in xy.** M − I = −2nnᵀ, so every column
is parallel to the mirror normal and the first column is zero when that
normal is perpendicular to x. The calculation frame puts a planar molecule
in xy, which makes σh's normal exactly z. `detectPointGroup` on those
framed atoms then called benzene D6d and ethene D2d, while
`symmetrizeMolecule` on the unaligned geometry — the path the existing
tests use — still said D6h and D2h. Inversion is recognized from the trace,
so the g/u suffix survived the wrong symbol. Both the Schoenflies name and
the irrep census now take the long column. Framed benzene is D6h, framed
ethene D2h, and the pinned labels are unchanged.

**O₂ is not a closed shell.** Twelve valence electrons is an even count, so
the filling put two electrons in one partner of the π* pair and none in the
other, and the diagram tagged one HOMO and one LUMO. That is the triplet
drawn as a singlet. When the energies are passed, a set inside
`CANONICAL_TOLERANCE_EV` that the count would only partly fill returns null,
the same refusal as a radical, and the panel shows the open-shell note. The
numeric checks that pass no energies still see only the odd count.

**Left as they were.** The plain Wolfsberg–Helmholz K = 1.75. The diagram's
5 meV grouping, which only decides which levels share a pixel; the
"canonicalized against x², y², z²" note is now limited to partners inside
the solver's own 1e-5 eV. D2h's Mulliken names in the a1/b1 scheme (ethene's
subscripts are the convention's, and they are not pinned). PCl₅ coming out
C4v and SF₆ coming out C1, which is the generic-parameter geometry already
recorded above. A marching-tetrahedra sheet can miss a double crossing of
|ψ| on one edge; benzene's π HOMO still closes, and no molecule on hand
showed a hole.

## Stereochemistry: the drawn wedge and hash

**The bug.** `parse-mol.ts` read three fields per bond line and stopped at
column 9, so the V2000 stereo flag was never parsed: (R)- and (S)-2-bromobutane
drawings embedded identically, both (R). The app feeds JSME's `molFile()` (not
its SMILES), so a drawn wedge does reach the parser; the online path gets its
stereo from JSME's `@@`-carrying SMILES.

**The fix.** `parse-mol.ts` reads columns 10–12 into `Bond.stereo` (1 = wedge,
6 = hash), and `geometry/stereo-wedge.ts` enforces it: the 2D cross product of
two plain neighbors is the page-plane reference, the flag says which side the
wedged atom is on, and a center whose 3D configuration disagrees has the wedged
atom swapped with a terminal plain neighbor — a hydrogen when there is one,
since that is the only substituent free to move. Exchanging two ligands is what
inverts a tetrahedral center, and each takes the other's slot, so they cannot
collide. The branch moves rigidly, so no bond stretches and any stereocenter
nested inside it is untouched.

**Calibration.** Against PubChem's own 3D conformers: (R)/(S)-2-bromobutane
(CIDs 637147 / 12236140) and L-alanine, each from the 2D SDF and from a
heavy-atom sketch whose H's are implicit. `required = flag === 1 ? +reference :
−reference`. Pins in `tests/stereo-wedge.test.ts`, fixtures in
`tests/references/stereo/`.

**The chirality invariant.** `chiralitySign` = the signed volume of the wedged
atom with two plain neighbors: `sgn(dot(cross(n1−c, n2−c), wedged−c))`. A triple
built from the three *plain* neighbors looks like a chirality label but is not —
around a regular tetrahedron the four choices of three vertices alternate in
sign (+, −, +, −), they do not share one, and the invert swap moves one of that
triple's own atoms (the partner takes the wedged atom's direction), so its sign
does not transform cleanly. The diagnostic has to track the labeled wedged atom
— the only one whose crossing of the (n1, n2) plane is the flip. (Added
2026-09-27: earlier note wrongly claimed all four triples share a sign.)

**The flip is re-checked (2026-09-27).** The swap flips the sign exactly only
while the two swapped ligands sit on opposite sides of the (n1, n2) plane —
guaranteed near a regular tetrahedron, not for a badly distorted center.
`applyWedgeStereo` now checks `chiralitySign` after the move; a failure undoes
the swap and returns a warning ("C<n>: drawn wedge/hash not honored…") that
`embedAndRefine` threads out with the molecule and the status popup shows
alongside the parameter-gap warnings. The warning path also re-asserts the
sketch on the *unrefined* fallback geometry, whose own enforcement previously
ran before `separateOverlaps` could push a nonbonded pair through a
stereocenter. Test pins: the distorted-center undo/keep cases in
`tests/stereo-wedge.test.ts`.

**How the inversion got here — two wrong turns, both instructive.**
1. *Swapping whole branches* tore rings apart. In a ring "the branch on the
   other side" is reachable the long way round, so it is the rest of the
   molecule: a drawn all-cis hexol came back with ring bonds of 5.06 Å and
   5.96 Å. → turn one branch rigidly instead.
2. *Turning the branch onto the mirror of its direction* flips the sign exactly,
   but the mirror is chosen from geometry alone, with no idea that something is
   already sitting there: a drawn all-cis hexamethylcyclohexane came back with a
   ring hydrogen and its methyl 6° apart — 0.46 Å — sharing one axial slot. →
   swap ligands instead, so a collision is impossible by construction.

**It runs twice.** At the end of `place3D` (after `optimizeTorsions`, which can
otherwise carry a wedged atom along with a plain neighbor) and again on the
refined geometry in `embedAndRefine`. The second pass is not redundant: MMFF94
walks to the *nearest* minimum, and for a strained drawn stereoisomer that
minimum can be a different stereoisomer — the drawn all-cis hexol (whose chair
carries three 1,3-diaxial hydroxyls) came back with one hydroxyl trans. The
sketch is the specification; re-assert it after the refinement. A
chirality-preserving optimizer would be the deeper fix, and that belongs in
mmff94-ts, not here.

**Pinned cases.** (R)/(S)-2-bromobutane and L-alanine against PubChem; the
all-cis hexol exactly as drawn (every hydroxyl on one face, ring closed); an
alternating 1,3,5-up/2,4,6-down control that a fix forcing one face would fail;
and the all-cis hexamethyl (every ring carbon's hydrogen and methyl more than
60° apart — the mirror-rotation inversion put them 6° apart in one slot).

**Still open.** The atom-parity field is ignored (the wedge alone fixes a 2D
sketch), and `v3000-convert.ts` drops parity — a *2D* V3000 input from CIR would
lose its wedge, while V3000 3D (the usual CIR case) carries it in the
coordinates. cis/trans, E/Z and ring substitution never depended on flags
(user-verified with cis/trans-dimethylcyclohexane).

**SDF export round-trips stereo (2026-09-27).** `moleculeToSDF` used to write
the V2000 bond stereo column as 0, so after the M  CHG charge fix (2026-09-23)
charges survived export → re-import but a drawn wedge/hash didn't. The flag now
rides in columns 10-12 — the same column `parseMolBlock` reads — so the sketch's
configuration survives the round trip. Pinned in `tests/controls.test.ts`.

## The fallback embedder's two frame bugs

Found by the all-cis hexol; invisible until a molecule needed its drawn
stereochemistry preserved.

- `optimizeTorsions` rotated a subtree about the bond but subtracted the pivot
  atom's position without adding it back, re-homing every rotated subtree into
  the origin's frame.
- `place3D` rooted its graph walk on the first *unplaced* heavy atom — and in a
  ring molecule that is a substituent, which got parked at [0,0,0] while the
  ring kept its drawn coordinates, splitting the molecule across two frames. The
  hexol's first oxygen sat 5.06 Å from the carbon it belongs to, and the
  refinement dragging it back inverted a neighbouring center.

The walk now roots on a ring atom when there is one (the ring was just seeded
from the drawn coordinates), falling back to the old behaviour for ringless
molecules and lone atoms. The tell is ring C–C bonds of 5–6 Å in the pre-refine
geometry.

## Aromatic bond order 4

`kekulizeSmiles` rewrites only the SMILES query string, so a pasted or imported
aromatic molfile arrives as order 4 and comes out wrong: no H's filled, sp
carbons, a second π lobe. Drawn JSME rings are Kekulé — `tests/jsme-input.test.ts`
pins a real JSME benzene. Parked; it is a paste/import-only gap.

## Kekulization

JSME's `smiles()` emits aromatic lower-case, and we Kekulize only *monocyclic*
aromatic rings before the query reaches PubChem. The case that forced it: JSME
emits "c1ccc1" for a drawn cyclobutadiene, which PubChem canonicalizes to
cyclobutane (CID 9250); the Kekulized "C1=CC=C1" resolves to the diene. Fused,
charged, or otherwise ambiguous SMILES pass through unchanged and rely on
`validate-structure.ts` to reject any wrong structure at fetch time.

## The online path's stereo safety (the MolView case)

MolView's author documented the failure our guard cannot see: a drawn
cis-1,2-dimethylcyclohexane resolving to the *trans* 3D structure, because the
SMILES reached PubChem without explicit hydrogens on the stereocenters and
PubChem matched the stereo-*unspecified* entry (CID 11416), whose conformer is
trans. Re-tested against PubChem directly, 2026-09-24:

| query SMILES | resolves to |
|---|---|
| `C1CC[C@](C)[C@](C)C1` (Ketcher style, no explicit H) | CID 11416 — unspecified |
| `C[C@@H]1CCCC[C@@H]1C` (explicit H) | CID 16628 — cis |
| `C[C@@H]1CCCC[C@H]1C` (explicit H) | CID 23313 — trans |

So PubChem's identity search *is* stereo-sensitive — but only when the query
writes the stereocenters with an explicit hydrogen. The Ketcher-style form
still collapses to the unspecified entry today, so MolView's bug is live for
that input. Valence is clean because `applet.smiles()` (JSME) writes the
explicit-H form and `kekulizeSmiles` passes non-aromatic SMILES through
unchanged. Verified end to end 2026-09-24: cis and trans
1,2-dimethylcyclohexane, PubChem path and forced-local path, all four correct.

**This safety is implicit.** Nothing in our code asserts that the query SMILES
declares stereo, and `structuresMatch` compares bond multisets only — it cannot
see a stereoisomer, and (being a multiset, not a graph) it also cannot separate
constitutional isomers with equal bond counts, e.g. butane vs isobutane. A
sketcher swap (Ketcher, OpenChemLib) would import MolView's bug silently. If we
harden it, the cheap structural guard is: when the query SMILES contains `@`
and the resolved PubChem record's canonical SMILES contains none, reject the
fetch and fall through to the local pipeline. (Proposed, not implemented.)

## Charges are part of the identity (fetch guard, 2026-09-28)

`structuresMatch` now also compares the net formal charge, and the fetch path
adds a second, geometry-trust stage: a fetched structure whose ion the MMFF94
type space cannot represent at all (`unrepresentableCharge`, the same
`chargeModelResult` residual the dipole uses) is rejected and falls through to
the local pipeline.

The case that forced it: methyl anion. PubChem *does* carry the −1 charge on
methanide (CID 881), but its OMEGA→MMFF94 conformer is essentially planar (C
~0.001 Å in the H plane — the neutral CR type has no carbanion lone pair, so
the optimizer found the planar saddle). Measured 2026-09-28 with the residual
rule in place: the pubchem record's dipole is 0.0004 D (a "0.00 D" readout
that made it look like the charge was lost) while the local pipeline embeds a
pyramidal methanide (pyramid height ~0.39 Å) with 0.36 D. The guard's two
stages are distinct: identity (charged sketch vs neutral or differently
charged fetch — methane must never serve methanide) and geometry trust
(charged sketch whose ion the remote conformer was built for with neutral-type
parameters — its shape is an artifact even when the charge made it through).
Representable ions (ammonium N⁺ → type 34, carboxylate O⁻ → type 32) keep
their PubChem conformers.

## 3-ring sp² planarity (the cyclopropenyl cation, 2026-09-28)

MMFF94 has no reference angle for the SUBSTITUENT of a trigonal center inside
a 3-membered ring: the generic H–C(sp²)–C(sp²) θ₀ (mmff94 angle `1-2-2-5`,
≈118°) collides with the ~150° a planar ring forces, so the force field's
true minimum puckers the exocyclic bond out of the ring plane. Measured on
the vendored mmff94-ts: cyclopropenyl cation optimizes to 41.5 kcal/mol with
all three C–H bonds ~54° out of plane (vs 47.9 kcal/mol for a
planar-constrained minimum); neutral cyclopropene is even worse (41.5
pyramidal vs 67.9 planar). The planar form is a local minimum, not the
global one — a descent from a planar seed stays planar (39 iterations), the
pipeline's pyramidal seed finds the lower puckered one. This is FAITHFUL
MMFF94, not an mmff94-ts bug — the transcription of the parameter table is
correct, and the same result reproduces on the WebMO frontend driving
mmff94-ts. But the puckered 3-ring is a parameterization artifact, not the
chemistry: a trigonal center in a small ring is planar, and the app's job is
the chemistry.

**The remedy (in Valence, not the library).** `restoreThreeRingPlanarity`
(src/geometry/ring-planarity.ts) runs inside the local pipeline after the
MMFF94 refinement: it finds 3-atom rings and projects the exocyclic
neighbors of every sp² ring atom back into the ring plane (bond length
preserved; an exocyclic atom sitting exactly on the ring normal lands on the
outward bisector — the ring bonds' bisector TOWARD the centroid is the wrong
side). The sp² test reuses the charge-aware electron-domain count
(chem/hybridize.ts), the same one the renderer uses: the cation's three
carbons flatten, cyclopropene's two alkene carbons flatten while its sp³ CH₂
keeps its genuine tilt, and a 3-ring carbanion C⁻ (3 σ + lone pair → sp³)
stays pyramidal — a methyl-anion-style context is NOT a planar center. The
stereo enforcement still runs after it, so a drawn wedge wins.

**Force-field strategy (decision 2026-09-28).** MMFF94s is parked, and
SMIRNOFF/OpenFF is out of scope. The pathological cases Valence throws at
MMFF94 (cyclopropenyl cation, and any future small-ring trigonal artifact)
are a bounded, known list, and a classical force field cannot express the
electron delocalization that keeps those rings planar — MMFF94s changes only
the out-of-plane and stretch-bend terms, not the angle references that drive
the 3-ring pucker, so it would not fix the cation. The plan: handle the
shortlist as targeted Valence-level corrections behind the sketch-is-the-spec
rule (`restoreThreeRingPlanarity` is the first), each with a test, zero new
dependencies. Real electronic structure (xTB-class) is a separate,
much-larger conversation (GPL/WASM vs the pure-TS house rule) and is only
worth starting after Phase 2 extended Hückel lands — it would be the 
geometry fix that *understands* the molecule, not just corrects it.

## Prior art: who else does 2D→3D (surveyed 2026-09-24)

- **RDKit** (server/desktop) — ETKDG; the de-facto standard.
- **RDKit.js** — *no 3D at all*. The shipped package (2026.03.6, 7.3 MB wasm)
  wraps RDKit's MinimalLib; `RDKit_minimal.d.ts` has zero symbols matching
  `3d|conformer|embed` and every coord function in it is 2D (CoordGen).
- **Open Babel `--gen3d`** — OBBuilder: rules ("sp3 = tetrahedron") + fragment
  templates ("cyclohexane = chair") → MMFF94 steepest descent → rotor search →
  conjugate gradient. Architecturally our embedder's big sibling.
- **CORINA** (commercial) — rule-based, assembles from experimental crystal
  structures; it is what CIR uses for SMILES→3D.
- **OMEGA** (OpenEye, commercial) — what generates PubChem's conformers:
  MMFF94s minus Coulomb, 25 kcal/mol window, tuned toward protein-bound
  geometries (why SF₄ comes back tetrahedral rather than see-saw).
- **CDK ModelBuilder3D** (Java) — template/rule-based.
- **OpenChemLib** — ships a `ConformerGenerator` (4 strategies) + MMFF94 + a
  crystal-derived torsion/bond-length library (1.1 MB JS + 1.35 MB
  resources.json). It only constructs after `Resources.register`, and then
  throws a minified `undefined is not an object` in a headless probe —
  unconfirmed, not disproven.
- **MolCalc** — RDKit + GAMESS behind a Python server.

Valence's niche: the only one of these that does 2D→3D in a static page with no
cheminformatics dependency, honouring the drawn wedge.

## The sketcher bench (dev-only)

`playground/sketchers.html` + `sketchers.ts` compare JSME, Ketcher (standalone
iframe) and OpenChemLib at the app's real panel size. Vendor assets are
gitignored — unzip `ketcher-standalone-3.18.0.zip` from epam/ketcher releases
into `playground/vendor/ketcher/`, and copy `dist/openchemlib.js` +
`dist/openchemlib.d.ts` + `dist/resources.json` from the `openchemlib` npm
package into `playground/vendor/ocl/` (the bundle fetches resources.json at
runtime — the editor's UI needs it). The `playground-vendor` plugin in
`vite.config.ts` serves that tree raw in dev (Vite's transform mangles the
classic Ketcher bundles) and never copies it to `dist/`.

Measured cold: JSME 0.5 MB / 1.5 s, Ketcher 28.8 MB raw (8.4 MB gz) / 4.2 s,
OpenChemLib 1.1 MB / 0.27 s — all three export benzene as Kekulé. OpenChemLib's
canvas never initialises in a headless browser (it needs a visible tab), so the
bench prints that diagnosis instead of a blank panel.

## Lone-pair inequivalence at bent AX₂E₂ centers (intentional)

Bent AX₂E₂ atoms are drawn with two equivalent VSEPR lone pairs — the
undergraduate picture (e.g. oxirane's O, whose real orbitals are inequivalent
σ + π, confirmed by IBO analysis). A didactic choice; true σ/σ*/π/π* lobe mixing
is a planned future phase (user-selectable lobes).

## Hypervalent centers and parameter warnings

MMFF94 has no types for hexacoordinate S (SF₆) or pentacoordinate P (PCl₅), so
local refinement falls back to generic parameters and the refined geometry is
approximate. The status popup warns via `parameter-warnings.ts` (the library's
`parameter_gap_report`, validated against the 761-molecule suite: zero false
positives on covered chemistry). The PCl₅/SF₆ examples sidestep this by carrying
the textbook geometries — they render as authored, never refined.

## The implicit-H filler

`CHARGED_VALENCE` targets the usual charged valences (C⁺/C⁻ trivalent, N⁺
tetravalent, O⁻ monovalent, halide X⁻ zerovalent); an unlisted (element, charge)
pair keeps the neutral bond target rather than guessing (C²⁺ fills as neutral C).

## The dipole (charge model, MMFF94 BCI)

**What it is and isn't.** `computeDipole` (src/chem/dipole.ts) evaluates the
vendored `mmff94-ts` BCI partial charges (`assign_atom_types` +
`assign_bci_charges(mol, { round: false })`) on the *displayed* molecule and
turns them into μ = Σ qᵢ(rᵢ − r_com). The visible readout is a bare
"Dipole: X.XX D"; the hover explains it is a charge model, not a
wavefunction-derived value, and the popup caveat names the model whenever
the charges run on generic parameters. Charges are geometry-independent, so
the dipole is computed once per molecule, not per frame.

**Numbers measured (fixtures in tests/dipole.test.ts).** Water (BCI):
O −0.86, H +0.43 → 2.42 D, exactly along the H–O–H bisector — the
experimental 1.8546 D with a documented ±0.6 D band that covers BCI's ~30%
overshoot (charges tuned for MMFF94's full ε=1 electrostatics, not water
alone). Acetate (wB97X-D3/def2-TZVP geometry, user-provided 2026-09-28):
4.45 D, δ− at the oxygens. Ammonium (user geometry, N–H 1.022 Å): 0 D by
symmetry. He (outside the type space) → no dipole at all. Methyl anion: the
BCI model's charges are all exactly 0 (see the residual rule below), so the
reported dipole is the residual rule's own — 0.51 D on the hand-built
pyramidal fixture, 0.36 D on the local-pipeline geometry (measured
2026-09-28); the sign convention puts the δ− end at the carbanion's lone
pair.

**Carboxylates delocalize by themselves (measured 2026-09-28).** The input
formal-charge distribution on acetate's oxygens does not matter: one O at
−1 (what a sketcher sends), both at −½, or no charges at all give the
bit-for-bit same BCI result — the typer assigns type 32 (carboxylate O, q⁰
−0.5) to BOTH oxygens from the C(=O)(O) environment alone, and the sharing
rules delocalize to −0.9/−0.9 (with +0.906 on the carboxylate carbon, net
−1). The fixture states −½/−½, the honest resonance picture; a hand-drawn
−1 on one oxygen is provably equivalent.

**Origin.** Center of mass over the shared standard-atomic-weights table
(src/chem/assign-mass.ts, same table the MW readout uses; unknown elements
are skipped, documented). COM matters only for ions — μ of a neutral molecule
is origin-independent — and the translation-invariance tests pin it for both.

**Conventions.** Physics p points δ− → δ+; the rendered arrow is −p̂ (δ+ →
δ−, chemistry convention), the UI says so in one line, and the "+" marker
sits at the δ+ tail. Tests check `vector === −p̂`.

**Degradation.** A molecule whose element is outside the MMFF94 type space
gets *no* arrow and an "n/a" readout — never a generic fallback charge.
Hypervalent centers (PCl₅, SF₆) still get the arrow, but the status popup
gains "Dipole (MMFF94 charge model) is approximate…" next to the existing
parameter-gap warnings.

**The residual rule (ions the type space cannot represent, 2026-09-28).**
The BCI model carries a formal charge only through atom types that have a
primary q⁰ (ammonium N⁺ → 34, carboxylate O → 32, …). MMFF94 defines no
carbon-anion type, so a drawn methyl anion types its carbon as the neutral
CR (1) and the C–H bond's BCI is exactly 0 (`0-1-5` in mmffchg.par) — the
library would return all-zero charges for a molecule whose sketch carries a
−1. *Never ship a silently wrong structure* applies to numbers too: the
drawn charge may not be dropped. When Σ q_BCI ≠ net formal charge (the
measured signature, |residual| > 1e-9), the residual is placed on the
atom(s) the sketch charged, in proportion to their formal charge, and the
`residualCharge` flag makes the Info log add the
`DIPOLE_RESIDUAL_CHARGE` caveat line — a silent 0.00 D is exactly the bug
this rule and its test exist to prevent. Representable ions (water,
acetate, ammonium) have residual exactly 0 and never trigger it.

**Info log (bottom of the right panel, 2026-09-28).** The residual-charge
caveat is a full sentence and the molecule header is one `white-space:
nowrap` line — it was unreadable there. Verbose model prose now lives in an
Info log as the last entry within the controls panel: `#panel-info`, hidden
until a molecule raises a note, showing each caveat on its own wrapped line
(the dipole-on-generic-parameters note, the residual-charge note, and the
parameter-gap warnings). The header keeps the short structural warnings
(stereo-enforcement notes) only.

**Per-atom charge labels (2026-09-28).** A "Partial Charges" mode in the
labels dropdown shows each atom's charge-model partial charge — WHITE text on
the same darkened shadow, placed at the atom center and camera-pushed like
the element symbols (the two label modes are mutually exclusive, so they
share one spot; the first browser pass rendered them as floating text above
the atom, which read as detached). It consumes the same resolved values the
dipole arrow uses: `resolveCharges()` (src/chem/dipole.ts) returns the BCI
charges with any residual placed on the charged atoms, so a label and the
arrow always agree — and a drawn −1 on a carbanion shows as −1.00, never
0.00. `resolveCharges` is the single resolution for the dipole, the labels,
and (next) the Phase-1 ESP surface; `computeDipoleOrThrow` was refactored to
consume it so the residual rule has one copy.

**Hybridization labels got the same treatment (2026-09-28).** They were the
same floating-offset text, in a group that never received the per-frame
camera push — doubly detached. All three atom-centered label modes (element
symbols, partial charges, hybridization) now share one shadowed, pushed
label layer; the separate `hybridizationLabelGroup` is gone and the `hybrid`
palette token with it (shadowed labels are white-on-dark by construction).

**Dipole arrow = the textbook crossed-arrow symbol (2026-09-28).** The old
arrow carried a floating "+" text sprite at the δ+ tail (and no "−"), which
read as a label the student could lean on instead of the convention. The
"+"/"−" sprites are gone; the δ+ end is now marked by a small cross drawn in
3D geometry, the shaft/cone pointing at the δ− end — the standard molecular-
dipole symbol (not bond-only), with the group's per-frame sprite push retired
since nothing in it is a sprite anymore. A later tweak gave the shaft a 0.2 Å
stub past the cross (it reads `shaft ─ cross ── ▷`, not a cross dangling at
the tip) and shortened the cross arms 15% per side, still centered on the
axis.

## The ESP surface (Phase 1, charge model)

**Shipped 2026-09-28 in two passes.** First a translucent per-atom vdW–sphere
overlay; then — the user's correction — the INDIVIDUAL spheres were resolved
into a **united (fused) vdW molecular surface** before the charges were
probed. `computeEspSurface` (chem/esp.ts) extracts the fused surface with
marching tetrahedra (cube + center → 12 tets) over the signed-distance field
f(p) = min_i(|p − aᵢ| − rᵢ) of the union: < 0 inside, 0 on the boundary.
The potentials are then probed at the FUSED boundary, V(r) = Σ qᵢ/|r − rᵢ|
(e/Å, a 0.35 Å floor so a surface vertex on a nucleus can't blow up) — not
at the individual spheres' vertices, where a sample can sit inside a
neighbor. The charges are the resolved BCI values from `resolveCharges`,
shared with the dipole and labels; an untypeable molecule gets no surface
("no arrow, no lie"). The refusal is uniform too, after an external review
(2026-09-28) caught the gap: the guard for an element outside the MMFF94
type space lives in `resolveCharges` itself, so the dipole (n/a readout),
the charge labels (nothing printed) and the ESP (no surface) all refuse from
ONE place — a generic fallback type would otherwise hand helium "0.00"
labels and a fake surface while the dipole correctly refused. The surface
mesh is cached per molecule and extracted lazily on first ESP render, so
opacity changes never reextract it (the vdW radii moved to src/chem/radii.ts
so both the field and space-filling share one table).

**Textbook colors, flipped to textbook sense.** The plan's draft said white at
zero; the user's correction is what ships: **negative red, neutral green,
positive blue**, piecewise-linear RGB between the three stops (chem/esp.ts
`espColor`). The scale is symmetric about zero and percentile-clipped on |V|
(90th percentile, `espVmax`) so an ion's near-field can't wash out the
surface.

**Translucency.** The surface is a translucent overlay — the atoms (and
orbitals) remain visible beneath it — with an ESP Transparency slider
(0.15–0.9) in the Build tab. `depthWrite: false` on the front pass keeps the
surface from occluding atoms it must show through; a **depth-only back-face
pass** precedes it (paints nothing, writes the far side's depth) so the
surface occludes ITSELF — otherwise its far side bled through the near side
as a wash.

**The DMS cracks — corrected diagnosis (2026-09-28).** The reported white
sawtooth patches over dimethyl sulfide were NOT solved by the transparency
pass alone. Two intertwined causes, found with external review:
(1) the per-triangle orientation reference picked the nearest atom CENTER,
but the union field's gradient is radial from the argmin of |p − aᵢ| − rᵢ —
the two disagree at heteronuclear cusps (C vs H), flipping triangles inward
(71 of 23,848 on the reviewer's trimethylamine), which backface culling then
punched out as cracks; (2) the degenerate-sliver skip in `emit` left
zero-width slits, so the mesh wasn't closed. Fixes: `outwardNormal` now
takes the argmin of the signed distance (the analytic gradient — this also
fixed cusp shading), the slivers are emitted instead of skipped, and the
winding itself now comes from each tet's own sign (see the CCl4 paragraph
below). Tests: directed-edge consistency on DMS (watertight + one traversal
per edge direction) and an FD-gradient oracle on a C–H fused pair (every
area-bearing triangle outward).

**The half-inverted CCl4 mesh (2026-09-28).** Reported as "the surface
closest to the viewer is completely unrendered": carbon tetrachloride's ESP
surface showed only rim slivers and the far side, the whole near side white.
The separating data point came from the reporter — the same molecule renders
fine from the PubChem geometry and breaks only on the mmff94-ts (local
pipeline) one. Measured on the extraction alone: the local geometry's mesh
had a signed volume of **3.17 Å³** against the correct 84.5 (four fused Cl
spheres, 89.8 Å³ as the ceiling, the carbon buried), i.e. **46% of its area
was wound inward**; a 256²-pixel harness driving the app's own `renderEsp`
left 6.8% of the silhouette painted, against 93% for the PubChem geometry.
The mesh itself was innocent — closed, 227 Å² of area and the same
per-triangle area distribution on both geometries, and the nearest hit
matched the analytic union surface for 3985 of 3995 camera rays. The
orientation pass was the cause. Instrumented: the per-triangle rule flips
the usual ~50% of triangles (the 12-tet decomposition's corner order carries
no consistent winding), and then the **BFS over shared edges inverted
11,930 of 25,392 triangles (46%)** on this geometry, while the PubChem one
needed just 39 flips. A global majority vote cannot repair a PARTIAL
inversion: the vote stayed positive, the inverted half kept its winding,
and backface culling removed it — the seam between the two halves also
showed up as 290 same-direction edges in the mesh (0 after the fix). The BFS
was a heuristic that could only override a correct local decision, and on a
geometry with a Cl sitting on the +z axis it did so at scale (the earlier
"10 same-direction edges" reading was this same mechanism, not engine
sensitivity). Orientation now comes from the tet the triangle was cut from:
the corner the field samples deepest INSIDE is on the molecule's side of the
crossing plane by the linear interpolation itself, so pointing the triangle
away from it is exact — no sampled gradient, no crease ambiguity, no
propagation across the mesh, and the BFS is gone with it. Regression test:
the local-pipeline geometry must give a signed volume above one Cl sphere
(22.45 Å³) and below four — it read 3.17 Å³ before the fix, 84.5 after. The
test embeds a drawn sketch with `embedAndRefine` rather than pasting the
exported SDF: the 4-decimal export rounds its way out of the failure.

**On layer 0** so the scene's ambient + directional give it a lit look
without touching the atom rig (layer 1). Tests pin the physics (water sides,
monopole far-field V → Q/R, cutoff), the color endpoints, the percentile
clip, and the fused surface itself (single atom → closed sphere at r_vdw,
watertight edge counts, fused vs individual spheres, water's O/H sidedness).

**Copying without leaving the canvas (2026-09-28).** Convention over
configuration has to start somewhere, but a molecule plus a screenshot is
what every bug report needs, and hunting through the Export tab for each
half is friction. `setupContextMenu` (src/ui/context-menu.ts) puts
right-click → Copy as XYZ / SDF / PNG on the molecular display. The payloads
are the Export tab's own writers (`moleculeToSDF`, `moleculeToXYZ`,
`capturePng`), so a pasted structure is byte-identical to a downloaded one —
wedge and hash columns included, which is the point of not re-serializing in
the menu. `capturePng` renders one frame at 2× and takes the pixels in the
same task (the context has no `preserveDrawingBuffer`, and that stays true);
that one helper now serves both the menu and the export button, so the two
cannot drift into different images. The PNG goes to the clipboard as a *promise* inside
`ClipboardItem`: Safari only accepts a clipboard write started by the click
itself, never one awaited behind a render. The menu is fixed-position chrome
appended to `body` (it has to sit over the WebGL canvas, outside the panel's
stacking context), clamps itself into the viewport, and closes on Escape,
outside click, or window blur. An empty display gets no menu rather than a
menu of dead items, and the JSME panel keeps its own native menu.

**Shares.** The Valence→mmff94-ts adapter lives once, exported from the
mmff94-ts bridge (src/geometry/mmff-refine.ts; formal charges passed only
when present) and the parameter-gap check exposes a categorized
`parameterGapInfo` so the dipole consumes the same untyped/coordination
interpretation as the warnings, not a second copy. The dipole and arrow are
off by default and the arrow draws without depth testing — an overlay you
toggle on must be visible through the molecule's own geometry.

## Gotchas

- **Restart the dev server after touching the geometry pipeline.** The pipeline
  runs in a Web Worker and Vite holds the old chunk in memory, so a stale worker
  keeps producing the old behaviour.
- **JSME's `readMolecule` is a no-op** — the working call is `readMolFile`, and
  the bench global is `window.jsmeApplet`.
- **`file://` breaks the bench page** (it blocks the TS script, the JSME assets
  and OpenChemLib's ES module) — serve it from the dev server.
- **The bond-perpendicular uses Gram-Schmidt**, not a bare cross product; a bare
  cross product degenerates for bonds parallel to the reference axis.
- **The toolchain is Bun, not Node.** `bun.lock` is the lockfile (no
  `package-lock.json`), `node_modules/.bin/` holds `.bunx` + `.exe` pairs (Bun's
  install layout), and two scripts call `bun` directly (`sync-version`). The
  *test runner* is still Vitest — `bun run test` invokes `vitest run`, and there
  is no `bun:test` usage anywhere. `npm`/`npx` still work but are not canonical.
- **There is no `serve` script** in `package.json` — the dev server is
  `bun run dev` (Vite's default port is 5173; pass `--port` to change it).

## GFN2-xTB: a geometry tier that is worth its download

The local pipeline answers "what shape is this?" from VSEPR vectors and then
MMFF94. Both stop being an answer when the force field has no parameters, and
the failure is measurable: for PCl5, `place3D` builds a textbook trigonal
bipyramid (90° axial-equatorial angles, five equal bonds, verified by calling
it directly) and `refineWithMMFF94` then distorts it to 138° with the *axial*
bonds the shortest — worse than not refining at all. The tier above both is
GFN2-xTB: OCC's in-tree extended tight binding compiled to wasm, vendored in
`vendor/occ-wasm/` (LGPL-3; OCC is dual GPL/LGPL and Valence takes the LGPL
branch), driven from `src/geometry/gfn2-refine.ts` +
`.worker.ts`.

**Numbers, against the Fortran xTB oracle on identical geometries.** Water
−5.070324844258 Eh vs −5.070325081194; PCl5 −25.3865870766 vs −25.3865883312;
optimised PCl5 axial 2.1559 Å / equatorial 2.0271 Å vs the oracle's 2.1556 /
2.0271, from a crude start. Agreement is under 10⁻³ Å and under 10⁻³ kcal/mol
on energies. Methane optimises to Td, which the app's own symmetry snap then
confirms to 0.05 mÅ — an independent check that the engine's geometry is real.

**It is a fallback tier, not a replacement.** GFN2's water angle is 107.2°
against experiment's 104.5°, while MMFF94 is parameterised for water and is
better there. The Info log says this in as many words (`GFN2_NOTE` in
`gfn2-refine.ts`), because a number that looks authoritative is exactly the
kind that gets misquoted.

**Single-threaded, deliberately.** Threaded wasm needs `SharedArrayBuffer`,
which needs COOP/COEP headers, which GitHub Pages cannot serve. The first build
was linked with pthreads and leaned on `setNumThreads(1)`; the vendored build
now links without `-pthread` at all (`occ-valence.patch`), so the module never
asks for shared memory and `setNumThreads(1)` is a leftover that leaves an idle
TBB at one thread (corrected 2026-10-13: the worker's header still called it
load-bearing). Verified in a real browser with `crossOriginIsolated === false`.

The engine is 3.2 MB of wasm plus 0.33 MB of preloaded data (≈1.1 MB gzipped;
measured on the build, 2026-10-13), loaded in the background at startup so the
first optimisation does not wait on it. The ~22 MB of the first build was before
the trim (see the occ-wasm trim probes).

## GFN2-xTB gotchas

- **OCC's units are not uniform, and mixing them silently ruins a geometry.**
  `new Molecule(IVec, Mat3N)` and `Molecule.fromXyzString()` take **Ångström**;
  `XtbCalculator.updateStructure()` and `.positions()` use **bohr**. Feeding
  bohr to the constructor inflates every bond by 1.89×, and the SCF then
  diverges into unphysical charges. The gradient is **Eh/bohr**, indexed
  `Mat3N.get(coordinate, atom)` — confirmed against `gradientNumerical`.
- **`XtbCalculator` has no `new`.** It is move-only, so the bindings expose
  static factories returning raw pointers: `XtbCalculator.fromMolecule(mol)`
  (and `.fromDimer()`, `.fromCrystal()`), and the caller owns the handle.
- **Vite rewrites dynamic imports inside a worker**, appending `?import`; its
  dev server answers that with **HTTP 500** for anything under `public/`, since
  a public asset is not in the module graph. That is why the glue is a *static*
  import (bundled). The wasm and its data are `?url` imports from
  `vendor/occ-wasm/`, which Vite emits as hashed assets, so nothing of the
  engine lives in `public/`; `locateFile` maps the glue's requests onto those
  two URLs (and, in the tests, onto the vendored files on disk). The first
  build copied them into `public/occ-wasm` instead; that copy is gone.
- **The worker must build as ES, not IIFE.** The glue uses top-level await for
  its Node-detection branches; `worker.format: 'es'` in `vite.config.ts` is
  load-bearing, not a preference.
- **Copying into `public/` at `buildStart` is invisible until a restart.**
  Vite builds its public manifest at startup, so the first run that *creates*
  a `public/` folder serves none of it — the paths fall through to the SPA
  index.html and module loads fail with a MIME/parse error. Measured on the
  old `public/occ-wasm` copy; it still holds for `public/jsme`, the one thing
  `copyDir` copies now. The helper tolerates a missing source, so a fresh
  clone is fine; after upgrading jsme-editor, restart the dev server.

## GFN2-xTB is the default geometry engine

Decision (2026-10-01): the local pipeline refines with GFN2-xTB rather than
MMFF94; MMFF94 stays only as the last resort for when the engine cannot run.
The argument that had been keeping MMFF94 in front — its water angle (104.5°)
beats GFN2's (107.2°) against experiment — is a single data point, and the
structural cases go the other way emphatically: MMFF94 has no parameters for a
hypervalent centre, and distorts PCl5's trigonal bipyramid to 138° with the
*axial* bonds the shortest. GFN2 recovers 2.156/2.027 Å.

Both engines now share the embed step (`embed3D`), because a refiner needs a 3D
start: GFN2 receives place3D's idealised VSEPR geometry and optimises from
there. The MMFF94 path is behaviourally unchanged — `embedAndRefine` keeps its
sequence and all 328 of its tests still pass — and the remote PubChem/CACTUS
fetch still runs first: it is fast, already validated against the sketch, and
sometimes carries experimental geometry. GFN2 is what the app does when that is
unavailable.

The app labels what ran: `EmbedResult.engine` drives the header label
("GFN2-xTB" vs "Local MMFF94"), and the MMFF94 parameter-gap warnings are
suppressed on a GFN2 geometry, since "refined geometry approximate" would be a
statement about an engine that did not run. The charge model still uses MMFF94
either way, so the dipole caveats still apply.

### The starting geometry has to be scaled, and it is not MMFF94's output

Two traps, both found by measuring rather than reasoning:

1. `place3D` emits a **unit skeleton** (`BOND_LENGTH = 1.0`). MMFF94 scales it
   itself through its bond terms; a quantum method cannot. GFN2 handed 1 Å
   P–Cl bonds stalled near 1.5 Å instead of reaching 2.0+.
2. Scaling it by running MMFF94 first is worse, because MMFF94's *shape* is the
   problem for exactly the cases GFN2 exists for: from MMFF94's 138° PCl5, GFN2
   settled at 1.98/2.11 Å — a different basin, not the verified minimum.

The fix is `scaleSkeleton` (`place3d.ts`): one uniform factor, the mean
covalent-radius sum over the molecule's bonds, applied to the embedder's
skeleton. The *shape* is what decides a refiner's basin, and the embedder's
shape is right (a real trigonal bipyramid for PCl5); only the scale was wrong.
Measured after the fix: PCl5 axial 2.1557 / equatorial 2.0269 with 180° and 90°
angles, methane C–H 1.0821 Å at 109.5° — the oracle's numbers, from a crude
sketch.

### Trimming the bindings: 21.4 MB → 14.6 MB of wasm, no science code touched

The wasm was ~90% code the app never calls, and the reason was one file:
`src/occjs.cpp` registers *every* module to JavaScript. A registered binding is
reachable code, so the linker cannot drop what it pulls in — DFT (libxc, 9 MB of
archive), Hartree–Fock/SCF (17 MB), coupled cluster (4.3 MB), crystallography,
elasticity, DMA, crystal growth. Commenting out twelve of fifteen registrations
kept `core` (Molecule, Mat3N, threads), `xtb` (the engine) and `solvent`
(COSMO-RS), and the linker dropped the rest: **21,390 → 14,629 KiB raw, 6,762 →
4,868 KiB gzipped** (~3.2 MiB brotli, from ~4.5 MiB), for a relink that took 85
seconds. Uncommenting a line restores a capability.

The risk going in was that embind resolves types by name at *registration* time,
and the xTB binding names types from the stubbed modules (`Wavefunction` via
`toWavefunction`, `Crystal` via `XtbCalculator.fromCrystal`). It did not bite —
`tests/gfn2.test.ts` passes unchanged, with GFN2 producing the same energy
(−25.3865870766 Eh) to the last digit. If it ever does bite, those two bindings
are unused here and can be trimmed as well.

Measured composition of what the app actually needs, from the build's archives:
`libocc_xtb.a` 1.7 MB, `libocc_core.a` 1.3 MB, `libocc_solvent.a` 1.2 MB —
against `libocc_qm.a` 17 MB, `libxc.a` 9 MB, `libocc_main.a` 11 MB,
`libocc_driver.a` 4.5 MB and `libocc_cc.a` 4.3 MB. The engine is the small part.

### The second trim: correct, but only 88 KiB, and my estimate was 20x off

Dropping the nine bindings in `src/js/xtb_bindings.cpp` that named `Crystal`,
`Dimer`, `Wavefunction` and periodicity was supposed to free a megabyte or two.
Measured: **14,629 → 14,541 KiB** raw, **4,868 → 4,839 KiB** gzipped. The reason
is instructive rather than embarrassing: patch one had already made `libocc_qm`
and `libocc_crystal` unreachable, so what remained was the thin glue of those
entry points themselves — the crystal constructor and `to_wavefunction` as
functions, with nothing underneath left to strip. The linker had already done
that work.

Kept anyway, because it removes genuinely dead bindings rather than for the
bytes. Verified afterwards by `tests/gfn2.test.ts` (330 tests pass, GFN2 energy
identical to the last digit) and by the app's own default path (PCl5 axial
2.1557 / equatorial 2.0269 Å, unchanged, 534 ms).

**Lesson to keep: `.a` archive sizes say where code lives, not what the binary
contains.** The build tree holds 76 MiB of archives against a 14.5 MB wasm, so
summing them answers nothing; reachability from the exports is the only thing
that matters. The way to attribute it honestly is to stub one registration at a
time and measure the delta (85 seconds a round) — which is also why the first
trim's 6.6 MB is trustworthy: it was measured, not estimated. Both of my
per-module estimates in this area were wrong (1–2 MB predicted, 88 KiB
delivered), so treat any remaining estimate here as a guess until a relink says
otherwise.

**Where the trees live.** Two checkouts of the same commit (`826d769`):

- `C:/Users/mccan/Code/third-party/occ` on Windows — **pristine**, the reference
  to diff a patch against.
- `~/Code/occ` on Lenovo — the build tree, carrying both patches, because emsdk,
  CMake and Ninja live there (Windows has no emsdk).

Use the desktop clone to `edit` and `scp` when a patch is needed: the `edit` tool
handles only local paths, so a remote file has to go through `write`, and
rewriting a whole file over ssh risks a silent transcription error. (I once
concluded this clone was missing because my probe passed a POSIX `/c/Users/...`
path to a native Windows `git`, which cannot translate it. It was a bad probe,
not a missing tree.) Every patch in `vendor/occ-wasm/README.md` is verified with
`git diff` against upstream before building, which is what makes the `write`
route safe when it is used.

## 2026-10-01 — right-dock ergonomics (pre-revamp)

- The controls panel never scrolled: `overflow: hidden` sat after
  `overflow-y: auto` in `#controls-panel` and won, so the Build tab's lower
  sections were unreachable. Removed; tabs are sticky now.
- Build tab sections fold into Display (open) / Sizes / Options `<details>`
  groups — same disclosure pattern as the PubChem record.
- The MO panel collapses to a slim right-edge rail (+ button, vertical title),
  persists in `localStorage valence:mo-collapsed`, toggles with `O`.
- Measure tab clipped by 4 px at 9 px caps — tabs are 8 px now, all fit.
- `#mo-panel min-height: 420px` pushed the dock off short windows; it is 0
  with the list scrolling inside.

## 2026-10-01 — controls panel regrouped by task (pre-revamp)

- Tabs are Build/Style/Export/Measure no longer: Molecule (examples, GFN2
  refine, force-local, symmetrize), View (Show/Sizes/Materials/Modes groups),
  Analyze (dipole/ESP overlays, measure, annotations), Export (unchanged).
- The three "which orbitals do I see" controls lived in two tabs (Orbitals
  toggle in Build, All/σ/π/LP presets in Style, Highlight π in Build) — all
  three now sit in View > Show. No IDs changed, so controls.ts is untouched;
  tab switching is data-driven and needed nothing.
- Panel max-height 34% → 42%: the open Show group alone is ~300 px, and 34%
  scrolled on ordinary windows.

## 2026-10-01 — sketcher docks to a Build rail (pre-revamp)

- #jsme-panel collapses to a 40 px rail (« in the brand bar, +/BUILD rail,
  B shortcut, splitter drag undocks). Persists as valence:jsme-collapsed.
  Same pattern as the Orbitals rail; JSME repaints on expand.

## 2026-10-01 — linear-water GFN2 fix (symmetric-start trap)

- A drawn H-O-H embeds EXACTLY linear (place3D's LINEAR_VECTORS ±x for any
  2-coordinate center — lone pairs are not coordination sites). The GFN2
  path never perturbed the start (the MMFF94 bridge always kicked 0.05/0.1),
  so steepest descent relaxed the symmetric stretch and reported converged
  at 180°: measured start 180.0° → end 180.0°, 5 iterations, E -5.02063 Eh.
  The ~0.05 Eh gap to the bent minimum is water's barrier to linearity
  (~11,000 cm-1) — the saddle's identity, confirmed by its own number.
- At exactly-linear D∞h the bend gradient is exactly zero by symmetry: not
  small, zero. No gradient method can leave without a transverse nudge.
- Fix: breakSymmetry() exported from mmff-refine.ts (refineWithMMFF94 is
  behavior-identical — its old ternary was always truthy), applied in the
  refineWithGfn2 manager so both the pipeline and the Refine button kick.
  Regression pins: linear-start water → bent 95–115° AND below the saddle
  energy (gfn2.test.ts); nudge/bounded/deterministic/non-mutating unit pins
  (mmff-refine.test.ts). Same mechanism explains linear SF2 (S is also
  2-coordinate); true linear molecules (CO2) relax back — the kick is 0.05.

## 2026-10-01 — occ-wasm trim probe R1: solvent registration costs ~12 MB

- Map attribution of the shipped 14.5 MB wasm (relink with `-Wl,-Map`, local
  rebuild bit-identical at 14,890,934): libxc 8.3 MB, qm 2.0 MB (integral
  engines, split_ri_j, SCF stack), libcint 1.0 MB, ecpint 0.67 MB, xtb 0.5 MB
  (incl. periodic path), gau2grid 0.39 MB, core 0.37 MB, ints/esp 0.34 MB,
  disp/D4 0.26 MB, tbb 0.25 MB, gto 0.22 MB, solvent 0.22 MB, driver-cosmors
  0.11 MB, scnlib 0.16 MB, spdlog 0.13 MB, mimalloc 0.13 MB, ...
- Anchor: the solvent BINDING names driver `cosmors_solvation_free_energy`,
  whose object references HF/SCF/DFT/Wavefunction — the COSMO-RS driver runs
  a quantum calculation for surface charges, anchoring the whole stack.
- Stub experiment (comment one registration, relink): wasm 14,890,934 →
  3,021,167 (gzip 4.96 → 1.02 MB). Both water GFN2 tests pass on the
  trimmed build (bent-start energy + linear-start bends). NOT shipped:
  vendor/ restored byte-identical, lenovo tree reverted to baseline patches.
- Decision point: keep `register_solvent_bindings` (~15 MB total, COSMO-RS
  available later) or drop it (~4 MB total, one line + rebuild to restore).
  XtbCalculator.set_solvent (CPCM-X/SMD, xtb-side) is bound separately and
  may survive the drop — unverified.
- Queued levers, unmeasured: dead binding .o files still linked (~0.5 MB:
  dft 216K + qm 164K + ... — patch 2 kept them in SOURCES);
  MALLOC=mimalloc→default (~130K, free single-threaded per upstream note);
  .data drop share/dftd3 (656K, read only by disp/d3) + sgdata.json (92K,
  crystal readers); unbind from_xyz (app never calls it; io+scn ~0.3 MB);
  -Oz/-flto (full rebuilds); tbb serial fallback (invasive).

## NBO-style E(2) from the localized orbitals: a probe (2026-10-14)

No code shipped; the probe script was a scratch test. Recipe: each Pipek–Mezey
orbital (filled and valence-virtual) cut back to the AOs of its own atoms
(`orbital.atoms`), the set Löwdin-orthonormalized (S metric), GFN2's Fock
matrix taken into it, E(2) = 2F²/Δε between filled "Lewis" and empty
"non-Lewis" members. H–Ne only (the set spans the basis there; a polarization d
would not be covered).

| molecule | strongest E(2), kcal/mol | Lewis occupancy |
|---|---|---|
| ethane | σ(C–H) → σ*(C–H) anti 3.1 | 99.67 % |
| methylamine | n(N) → σ*(C–H) anti 8.3 | 99.56 % |
| formamide | n(O) → σ*(C–N) 32.1, n(O) → σ*(C–H) 26.8 | 98.90 % |
| phenol | n(O) → π*(ring) 30.7, π → π* ~10 | 98.26 % |

Ethane and methylamine land in NBO's range (roughly 2.5–3 and ~8 at DFT,
from the literature, not re-run). Occupancy-weighted orthonormalization (empty
weight 0.05) shrank everything 3–4×; plain Löwdin is the one that looks like
NBO.

**Formamide's catch:** PM put the π pair as an N–C π plus an O π lone pair,
the zwitterion O⁻–C=N⁺, so there is no n(N) → π*(C=O) at all. PM chooses its
own resonance structure. NBO picks the structure with the highest Lewis
occupancy (or takes one by $CHOOSE). Proposed: take the Lewis structure from
the sketch, which Valence already treats as the specification.

## The Lewis-structure orbitals and E(2), built (2026-10-15)

`lewis-orbitals.ts`, the Localized view's "Lewis structure" method. The probe
of 2026-10-14 truncated Pipek–Mezey orbitals and so inherited PM's resonance
structure (formamide as O⁻–C=N⁺). This takes the drawn structure instead,
NBO's recipe in miniature: Löwdin AOs; lone pairs as top eigenvectors of
one-atom density blocks (count from valence electrons − drawn bonds − charge);
bonds from two-atom blocks of the LP-depleted density, σ the most s-rich;
per-atom Löwdin of the hybrids; bond/antibond from each hybrid pair's 2×2
density; leftovers per atom diagonalized in the Fock block, d-heavy (> 0.5)
ones Rydbergs (unlisted). No IAO step was needed: the leftovers complete the
set, so P, S, Cl work (PCl₅: 29 Rydbergs unlisted).

Exact bookkeeping (tests/lewis-orbitals.test.ts): orthonormal, occupancies sum
to the electron count, and the Fock matrix in the set diagonalizes back to
GFN2's ladder.

| molecule (GFN2 geometry) | E(2), kcal/mol | occupancies |
|---|---|---|
| formamide O=C–N | n(N) → π*(C=O) 45.5 (42.6 on PubChem's conformer); n(O) → σ*(C–N) 24.3, → σ*(C–H) 21.0 | n(N) 1.71, π* 0.29; Lewis 97.5 % |
| BF₃ | each n(F) → LP*(B) 49.2 | LP*(B) 0.53 |
| phenol | n(O) → π*(ring) 24.5 | Lewis 96.4 % |
| methylamine | n(N) → σ*(C–H) anti 7.0, the other two 0.5 | |
| ethane | σ(C–H) → σ*(C–H) anti 2.0 | Lewis 99.7 % |
| PCl₅ | n(Cl_eq) → σ*(P–Cl_eq) up to 60 | Lewis 94.7 % (hypervalence shows) |

Occupancy-weighted orthogonalization of the 2026-10-14 probe shrank E(2)
3–4×; this build uses plain Löwdin throughout. A d-heavy leftover on a
hypervalent centre (PCl₅'s P) is not listed; E(2) into it is not shown.
Refused: diborane (three-centre bridges), any d-block or s-only metal, an
open shell, a drawing whose electron count is not GFN2's.

UI: the Lewis list keeps PM's mixing tick (same section, no number) and adds
E(2) across sections as an accent number beside the energy plus an underline
whose length is the share of the strongest (NBO's 0.5 kcal/mol threshold).
The PM rows went back to the tick alone (the "↔ 36.1" number came off).

## The smoke test on a locked workstation (2026-10-15)

With Windows locked (LockApp.exe running, the GPU idling in P5), the
headless Edge renders a drawn molecule at seconds per frame: one 8-event
pointer sweep over the scene took 40 s, on HEAD and with the Lewis work
alike. The full run went from 113 s to ~1160 s, and two timing-bound
checks failed (the drag chip's 200 ms removal; formamide's build, JSME
not having read the SMILES). Run the smoke test with the session
unlocked. `build()` now waits for `jsmeApplet.smiles()` before pressing
Build: right after `readGenericMolecularInput` it reads empty even on a
fast machine.

## The anchor and the E(2) table (2026-10-19)

Reported: in benzene's Lewis list, drawing C1–C6 π showed its two π*
acceptors (11.4 each); drawing one of them then swapped the numbers for the
π*'s own donors, and each look became a new question. The cues now belong to
the anchor, the first orbital drawn (outlined), and stay while partners are
added. Removing the anchor hands it to the next orbital drawn: following a
thread is one deliberate click, with no new gesture. The readout names what the
anchor alone gives or takes (strongest four and the total; benzene's π:
22.1 kcal/mol into the other two π*), and a donor–acceptor pair reads as an
arrow with its E(2).

The E(2) table (`rankDonations`, `#mo-e2`) is the other way in: every donation
≥ 0.5 kcal/mol, strongest first, collapsible, ~7 rows visible and scrolling.
An entry sets the selection to [donor, acceptor], so the donor is the anchor;
clicking the drawn entry clears. Formamide: 11 entries, n(N) → π*(C=O) 42.6
first. BF₃'s three F → B donations agree to 0.03 kcal/mol, not exactly (the
optimised structure is D3h only to tolerance). Hidden under Pipek–Mezey and
Delocalized.

## E(2) against NBO's own published tables (2026-10-19)

NBO's tutorial outputs (RHF/3-21G; methylamine at the Pople–Gordon geometry,
nbo.chem.wisc.edu/ch3nh2.html; formamide at a B3LYP/6-311++G** geometry,
nbo6.chem.wisc.edu/pert.pdf) against ours (GFN2, our own geometries):

| interaction | NBO RHF/3-21G | Valence | ratio |
|---|---|---|---|
| methylamine n(N) → σ*(C–H) anti | 8.13 | 7.0 | 0.86 |
| methylamine n(N) → σ*(C–H) gauche | 1.46 | 0.5 | 0.34 |
| methylamine σ(N–H) → σ*(C–H) | 2.85 | 2.7 | 0.95 |
| methylamine σ(C–H) → σ*(N–H) | 3.03 | 1.9 | 0.63 |
| formamide n(N) → π*(C=O) | 93.0 | 45.5 (42.6 PubChem) | 0.49 |
| formamide n(O) → σ*(C–N) | 37.2 | 24.3 | 0.65 |
| formamide n(O) → σ*(C–H) | 27.4 | 21.0 | 0.77 |
| formamide σ(N–H) → σ*(C–O) | 4.41 | 4.4 | 1.0 |
| ethane σ(C–H) → σ*(C–H) anti | 3.2 (Imperial page, level unstated) | 2.0 | 0.63 |

Rankings agree within each molecule; magnitudes run 0.5–1.0× NBO's, lowest
for the strong π resonance. The parts: methylamine anti, NBO F 54 / Δε 709
kcal/mol, ours F 35.5 / Δε 355 — our gap is half (GFN2's low virtuals, a
minimal basis) and our coupling two-thirds, and the two largely cancel in F²/Δε.
Formamide n(N) → π*: NBO F 127 / Δε 351, ours F 53.6 / Δε 108. HF/3-21G is
itself one level of theory; a DFT/large-basis NBO table would be the fairer
reference and was not found online.

## Valence virtuals by IAO (2026-10-19)

The Pipek–Mezey empty section took the canonical virtual block as it stood,
on the claim (localize-pm.ts) that GFN2's basis is "nearly minimal". It is not
once a polarization d is there: PCl₅'s 34 canonical virtuals localized as 9
σ*-like orbitals and 25 "(virt)" rows of d, several with no atom to name (the
classifier sets polarization d aside as a centre). SF₆: 9 empties, a one-atom
σ*, three (virt), an anti* at −154 kcal/mol.

`valence-virtuals.ts`: Knizia's IAOs (JCTC 2013) with the basis's own s/p
(plus d on the d block) as the reference; since that is a subset of the basis,
P₁₂ = S₁₁⁻¹S₁₂ is a column selector. Depolarized occupied = S₂₂⁻¹S₂₁C,
re-orthonormalized; IAO a = OÕe + (1−O)(1−Õ)e; valence virtuals = (1−O)·IAO
span, Gram-orthonormalized, keeping the n_min − n_occ nonzero directions (the
rest must be ~0 relative, or the canonical block is returned). GFN2:

| molecule | canonical virt | valence virt | empties |
|---|---|---|---|
| water | 2 | 2 (identical) | 2 σ* |
| PCl₅ | 34 | 4 | 3 eq P–Cl σ*, axial Cl–P–Cl σ* (P .61, Cl .18 + .18) |
| SF₆ | 9 | 4 | a₁g (S .21, each F .13), 3 t₁u (S .82, F .08 + .08) |
| SO₂ | 8 | 3 | 3-centre π*, 2 S–O σ* |
| PCl₃ | 23 | 3 | 3 P–Cl σ* |

Orthonormal to 1e-8, orthogonal to the occupied to 1e-15, d share ~0;
1–10 ms. The occupied block is unchanged (PM on Mulliken populations, as
before; this is not full IBO).

Labels: the empties' atom shares across every example — ordinary σ* put ≤
0.017 on a third atom, ring π* 0.2 on a third and ≤ 0.065 on a fourth, PCl₅'s
eq σ* 0.046 on each axial Cl, SF₆'s t₁u 0.079 on each F. No carrier threshold
separates the t₁u's F from benzene's ring tails, so the classifier is
unchanged and the t₁u read "S1 σ*" (82 % S 3p, honest). The label bug was
the two-atom slice: a σ-type orbital now names all its centres (Cl2-P1-Cl3
σ*, "S1 + 6 F anti*"); π keeps its Kekulé pair. An orbital with no centre
(all polarization d, only if the projection falls back) names its top atom.

## Thermochemistry against the xtb oracle (2026-10-20)

Reached lenovo over Tailscale (the route is in `AGENTS.local.md`: the LAN
name times out off-LAN, and the Tailscale address's host key is not in
known_hosts — a host-key alias checks it against the LAN entry, same
machine). xtb 6.7.1 `--gfn 2 --ohess` on the app's water,
methane, benzene and SF₆ examples; its xtbopt geometries and vibspectrum
frequencies are the fixture.

Fed xtb's own geometry and frequencies, thermochemistry.ts agrees on σ (2,
12, 12, 24), ZPE (1e-6 Eh), S_rot (0.005 cal/(mol K)), S total and H
(1e-5 Eh). S_trans runs 0.015–0.018 cal/(mol K) above xtb's in all four —
argon's Sackur–Tetrode (154.737 J/(mol K) at 1 atm) pins ours to CODATA
2018, so it is xtb's constants — and G inherits it as T·ΔS = 7.5e-6 Eh
(0.005 kcal/mol). None of the four has a mode under 255 cm⁻¹, so xtb's
quasi-RRHO and our plain RRHO coincide; a soft torsion would not.

The app's own water (local GFN2 build): ZPE 12.63, H − E 15.00, G − E 1.57
kcal/mol, S 45.05 cal/(mol K) (34.61 + 10.44 + 0.01); experiment's S° is
45.1.

## The JSME probe: Move and Clean (2026-10-20)

JSME's tooltip table (in the compiled `*.cache.js`, function with
`case 113:return YN(a,"Move atom")`) gives action codes: 103 add new molecule,
104 delete, 106 delete smallest fragment, 107 SMARTS box, 112 spiro ring,
113 move atom, 201 stereo, 205 chain, 1201 other atom type, 1301 R group.

- **Move (113)** — `setAction(113)` then a drag on an atom moves that atom
  alone (MOL coordinates: the other atoms shift by one common vector, which
  is JSME re-anchoring, not motion). A drag on empty space does nothing.
  No lasso or selection in JSME. Shift-drag on empty space ROTATES the
  molecule (shape kept), with any tool; Shift-drag on an atom with the bond
  tool draws a bond. JSME ignores the first press on its drawing after a page
  load: the first drag did nothing, every later one moved (real click, scripted
  click or setAction alike).
- **Compute 2D coordinates** exists (string table, beside "Change atom charge"
  and "Delete hydrogens") in the molecule context menu, built only when the
  `useopenchemlib` option is on (default), and dispatches a deferred internal
  command (`qx(7, new xP(a))`). Not on the public API, and the menu did not
  open for us — the right-click on an atom gave the copy/paste menu.
- **Clean = MOL with zeroed coordinates.** `readMolFile` of JSME's own MOL
  block with every x, y, z = 0 makes JSME lay it out (synchronously). Kept:
  atom order, drawn H (H–Ni–H keeps 3 atoms; `readGenericMolecularInput(
  smiles())` folds them to [NiH2] implicit), charges, metals, Xe, E/Z, ring
  stereo, chirality (trans-2-methylcyclohexanol same SMILES). JSME's Ctrl+Z
  after a MOL read does nothing, so the toolbar keeps the pre-clean MOL for
  one Undo. JSME rescales any MOL it reads to its standard bond length: a
  drawing with one long dragged bond came back ×0.7794, uniformly.

## Why the smoke test sometimes took 20 minutes (2026-10-20)

Not the machine, not the app, not a locked screen as such: Edge's headless
profile signs in to the Windows account by itself (edge://sync-confirmation-
dialog at launch), syncs the user's extensions, and ~10 s in Dark Reader
opens darkreader.org/help in a new foreground tab (plus the Copilot sidebar).
The tab under test went visibilityState "hidden", requestAnimationFrame
stopped, and CDP input events waited seconds for frames that never came
(a moveTo of 8 events: 222 ms fresh, 40–200 s after). Intermittent because
sync timing varies. Fix: `--disable-sync --disable-extensions
--disable-component-extensions-with-background-pages`, plus occlusion and
background-throttling off. After: one target, visible at 145 fps for 25 s;
full suite 39/39 in 131 s. Diagnosis method: the tab list at
`http://127.0.0.1:<port>/json/list` at the moment the page went hidden.

## Functional groups, and JSME's nitro (2026-10-20)

JSME's substituent actions, each attached to methanol's O by `setAction(code)`
and a click (SMILES after): 233 tBu, 234 NO₂ (N(=O)=O, five bonds), 235 COOH,
236 CF₃, 237 CCl₃, 238 C≡CH, 239 SO₃H, 240 CO₂Me, 241 OAc, 242 CN, 243 NMe₂,
244 NHSO₂Me, 245 C≡CMe, 246 Et, 247 Pr, 248 Bu, 249 CHO, 250 =O, 251 PO₃H₂,
252 SO₂NH₂, 254–257 F Cl Br I, 258 NH₂, 259 OH, 260 CONH₂, 261 NHCHO,
221 2-furyl, 223 3-furyl. 218–220, 222, 224–229 build rings THROUGH the atom
(O⁺ in the ring) — not substituents; nor is the benzene tool (209) on an atom.
`setSubstituent(name)` selects the same mode by name. `setTemplate(smiles,
name)` (mapped attachment atom, any of [X:1]-bonded, C-mapped, [*:1]) attached
nothing on a click — dead end.

JSME rewrites nitro to N(=O)=O whatever it is given, including
readGenericMolecularInput('C[N+](=O)[O-]'). Before charge-separate-nitrogen.ts
every nitro sketch failed the fetch guard's charge check (PubChem: N⁺, O⁻)
and was built locally; the Lewis orbitals refused the N. After: nitrobenzene
takes PubChem 3D, and its top E(2) are O⁻ LP → N=O π* 90.9 and ring π → N=O
π* 29.7 kcal/mol.

Testing trap: JSME redraws a molecule it has read only on a later pointer
event, so a label's SVG box can still be where the previous drawing was
(16 px off measured) — re-read positions between clicks.

## SeF₄: GFN2-xTB makes it a square pyramid (2026-10-20)

Reported: CIR's seesaw SeF₄ optimised in Valence to a square pyramid (C4v,
Se 0.70 Å above the F₄ plane, Se–F 1.78 Å, trans F–Se–F 134°). Experiment
is a seesaw (C2v, like SF₄): ax–ax ≈ 169°, eq–eq ≈ 100°.

Fortran xtb 6.7.1 on lenovo (`--gfn 2 --ohess vtight`) from both CIR's
seesaw and Valence's result: the same C4v minimum, −22.107722 Eh, no imaginary
modes (lowest 55 cm⁻¹). The seesaw is not even a stationary point on GFN2:
held at 169°/100° by constraints it lies 0.0061 Eh (3.9 kcal/mol) above.
So it is GFN2's parametrisation, not OCC — Valence's geometry and energy are
the oracle's. GFN1-xTB from the same start gives the seesaw (C2v minimum,
ax–ax 177°, eq–eq 102°, Se–F 1.77/1.71 Å); GFN2 gives SF₄ a seesaw. A
selenium-specific GFN2 failure. Files: lenovo `~/sef4/`.

**TeF₄ too, and GFN1 does not rescue it.** GFN2 (oracle −22.106740 Eh, Valence
−22.106738) gives TeF₄ a C4v square pyramid, trans 128°, cis 79°; so does
GFN1 (oracle, `~/sef4/tef4-gfn1`). Gas-phase TeF₄ is a seesaw. GFN1's SeF₄ win
is one element, not a better method for the heavy chalcogens.

**The shape check (compare-shape.ts) against GFN2 structures, built locally in
the app 2026-10-20.** Flagged: SeF₄, TeF₄, and neutral "ICl₄" (below). Passed,
with no false alarm: SF₄, TeCl₄, ClF₃, BrF₃, BrF₅, IF₅, XeF₄, XeF₂, XeOF₄,
I₃(+, below), ICl₂⁻, H₂O, NH₃, H₂S, H₂Se, H₂Te, PH₃, SbH₃, SnCl₂, PbCl₂, BiCl₃,
SbCl₃, AsF₃, SCl₂, SeCl₂, SOCl₂, SeOCl₂, DMSO, PCl₅, SF₆, N(SiH₃)₃, B(OH)₃,
ethanol, acetamide, pivalic acid, cyclopropane, cyclobutane, benzene,
nitrobenzene. The 30° bar sits above VSEPR's own squeezes (SF₄ eq 101.5° vs
120°, H₂Te ~90° vs 109.5°, SnCl₂ ~95° vs 120°) and below a change of shape
(SeF₄ 134° vs 180°). It does not catch a planarised AX₃E (120° vs 109.5°:
trisilylamine passes).

## JSME and the charges of hypervalent centres (2026-10-20)

**JSME infers a charge from the bond count, and its rule wins over the one
given.** Read as SMILES (`readGenericMolecularInput`, OpenChemLib on or off;
the `valenceState` option changes nothing), and the same for a MOL block:
- right: FB(F)(F)F → [B-]; FP(F)(F)(F)(F)F → [P-]; CN(C)(C)C → [N+];
  CS(C)C → [S+]; explicit [Al-], [Sb-], [Sn-2], [Ge-2], [Te-], [Xe-], [As-] kept
- wrong sign: III → I[I+]I and ClICl → [I+] whatever was written (I₃⁻ and
  ICl₂⁻ are the teaching species); F[Si-2](F)… → [Si+2]
- lost: a halogen with 4 or 6 bonds and S with 5 come out neutral — ICl₄⁻,
  BrF₄⁻, ClF₄⁻, IF₆⁻, IF₆⁺, BrF₆⁻, SF₅⁻; charge-separated perchlorate
  [O-][Cl+3]… reads as a neutral Cl with four O⁻ (net 4−)

**The charge tool (action 108) is hard-coded JME** (`kS` in the GWT bundle):
a halogen takes a charge only with no bonds ("Charge change not possible on
the halogen !", to JSME's status line, which our layout hides); C refuses
past 3 bonds, N/P past 3, O/S/Se past 2, B past 2. So none of the species
above can be drawn with it. The only unchecked ±1 path is the `polarnitro`
nitro group.

**The X atom carries a charge, but only out of JSME, not back in.** The X box
set to `[I-]` and pressed over ICl₄'s I gives SMILES Cl[I-](Cl)(Cl)Cl; the
V2000 molFile() writes the atom label "I-" with no M CHG, and a two-character
charge ("[Si-2]") as "Q"; molFile(true) (V3000) and jmeFile() keep "Si-2".
Reading any of them back (readMolFile, readMolecule) gives a plain neutral
atom — so Clean, and Undo after a Clean, would drop it.

**`polarnitro`** (options('polarnitro')) makes JSME keep nitro as N⁺–O⁻
(C[N+](=O)[O-] read and written) — an alternative to charge-separate-nitrogen.ts,
untested on the drawn group. JSME options are additive: options('newlook')
does not clear it.

Testing traps: the X box lives in a closed dialog, out of the document; a
synthetic hover does not move JSME's hover box (real pointer input does).

**The fix (asked for 2026-10-20): the charge tool falls back to the X atom.**
JSME takes the click first; when the drawing (jmeFile) is unchanged and its
status line says "Charge change not possible…" / "Use X button…" — or the atom
is Si, which JSME's charge table skips without a word (its element codes run
H B C N O Si P S F Cl Br I Se; every one but Si has a rule) — the toolbar
reads the drawing back as a JME string with that atom's label set to "[I-]".
Not the X key: pressed on JSME's own I⁺ (I₃) it kept the inferred +1 and
added the label's −1 — SMILES "[I-+]". The atom's index comes from the labels:
JSME draws one per atom not labelled plain "C" in the JME string, in atom
order (checked on I₃, ICl₄, SiF₆). The next charge: on JSME's own atom, a
cation flips to the anion (I₃ → I₃⁻, SiF₆²⁺ → SiF₆²⁻) and neutral goes to
−1; on our X atom −1 → +1 → 0 (JSME's own atom again). JSME's undo cannot
step back over a read, so the drawing before goes in Clean's one-step Undo
slot. Clean re-applies charged X atoms after its MOL read; the build reads
their charges from molFile(true). Built: ICl₄⁻ D4h, I₃⁻ D∞h, SiF₆²⁻ Oh, each
closed shell.

**polarnitro is the whole of charge-separate-nitrogen.ts, and more.** With
options('polarnitro'), JSME polarises every five-bonded N, read or drawn —
nitro (SMILES, the NO₂ group 234 on methanol's O, and nitro drawn bond by bond
all give C[N+](=O)[O-] with M  CHG lines), nitrate, amine and pyridine
N-oxides, nitrone, N₂O₄, five-bonded azide (CN=N#N → C[N-][N+]#N) and diazo —
and leaves the rest as written: sulfone, DMSO, phosphate, SOCl₂, SO₃, XeO₃,
SF₆, PCl₅, nitroso, isocyanide, N₂O, HONO. A half-drawn CN(=O)O becomes
C[NH+](O)[O-] on the way.

## NaOH drawn as Na–O–H (2026-10-20, ISSUES.md "Other?")

Geometry: GFN2 (oracle = Valence, ~/naoh on lenovo) has a bent Cs minimum,
Na–O–H 155°, Na–O 1.81 Å, −4.780675 Eh; the linear point is 0.40 kcal/mol
higher with a bend of ~0.06 cm⁻¹ — flat. GFN1 gives a linear minimum (bend
411 cm⁻¹), as experiment does (gas-phase NaOH is linear).
The views: sigmaNeighbors counts Na–O as a donor σ bond, so O reads AX₂E₂ and
its lone pairs are drawn tetrahedral against a 155° angle; the new shape check
then reports "O2 … AX₂E₂, bent 109°; GFN2 155°" — the count, not GFN2, is the
wrong side. Pipek–Mezey already gives the ionic picture (O: three lone pairs
+ O–H σ, no Na–O bond); its empty Na-centred orbitals are named "Na1 σ*",
"Na1 π*", "Na1-O2 σ*". Lewis structure refuses (Na is a metal). The ESP
surface misses Na: GFN2's density is valence-only, Na⁺ keeps almost none,
and its core electrons are part of the nuclear point charge, so the 0.001 au
contour never reaches the Na sphere.

**The ESP surface's core densities (2026-10-21).** GFN2's density is valence
only; the 0.001 au surface now adds each atom's free-atom core:
ORCA 6.1.1 UHF/X2C/x2c-TZVPall atoms Li–Rn, the lowest Z − n(GFN2 valence)
spin orbitals, spherically averaged (in an atom each orbital is R(r)·Y_lm,
so ORCA's angular conventions drop out). Every core integrates to its
electron count (1e-4). Where each core falls to 0.001 au: O 0.45, C 0.56,
Cl 0.76, Li 0.96, Na 1.32, I 1.31, K 1.76, Rn 1.42, Hg 1.92, Cs 2.15 Å — so
organics' surfaces do not change and NaOH's now wraps the Na⁺. Traps: Ce as
a singlet went 5d²6s² with no 4f (rerun as the triplet, 0.17 Eh lower); the
first table, starting at 0.02 bohr, lost half an electron of iodine's 1s
(starts at 0.001 bohr now). Runs archived in ~/orca_calcs/core-densities.

## NaOH's localized orbitals (2026-10-21)

Pipek–Mezey on GFN2's NaOH (oracle geometry): filled O–H σ (−12.66 eV) and
three O lone pairs; empty Na orbitals at 0.91–1.00 on Na. Before: the empty
branch tested two-centre first (BOND_SHARE 0.75, second ≥ 0.02), so a 0.03 O
tail made them σ*, π*, σ*, "virt". Now an empty orbital above LP_SHARE (0.90)
on one atom is 'lone vacancy' (LP*) — the filled branch's first test; no
other molecule in the suite changed label.
Lewis structure with the ionic count: O–H σ 1.969, O lone pairs 1.771 /
1.923 / 1.928, Na 3s LP* 0.205 e, three 3p Rydbergs; Lewis share 94.9 %.
E(2): O LP → Na 3s 29.0 and 16.3 kcal/mol, O–H σ → Na 3s 1.7. The alkali's
leftover space is its own Löwdin AOs, not Fock-diagonalized: mixing would
make sp hybrids toward the O, half valence, half Rydberg.

## Bromonium ions and the bonding guard (2026-10-23)

The user drew the bridged bromonium of 2-phenylbut-2-ene (Br⁺ bonded to both
alkene carbons) and Valence set GFN2's converged result aside: "the C3–Br5
bond came apart (2.60 Å)". It had not. GFN2 (Berny, 36 steps, 27 s of the 30 s
budget — close) and the Fortran xtb oracle (`--gfn 2 --chrg 1 --ohess vtight`
on lenovo, from the user's start and from Valence's result; ~/bromonium) agree
to 0.006 Å on a true minimum, lowest mode 39 cm⁻¹:

| | C2–Br | C3–Br (benzylic) | C2–C3 | C3–C(ipso) |
|---|---|---|---|---|
| distance, Å | 2.045 | 2.601 | 1.480 | 1.421 |
| Wiberg (xtb) | 0.84 | 0.20 | | |

An unsymmetrical bridge, mostly opened toward the benzylic carbon — the
picture the Markovnikov lesson draws. The guard's cut is 1.3 × the radii sum
(C–Br 1.96 Å → 2.55 Å); 2.60 Å is 1.33 ×. The structure the student saw was
the embedder's start (every ring C–C 1.55 Å, C–Br 1.55/1.66 Å).

**Every drawn bond in the examples is under 1.15 ×, Wiberg ≥ 0.49** (GFN2,
Valence's own optimised examples): diborane's bridging B–H 1.14 × / 0.49,
PCl₅ axial 1.03 / 0.96, SF₆ 0.98 / 0.68, [NiCl₄]²⁻ ≤ 1.02 / ≥ 0.59, ZnCl₂
0.95 / 0.96, benzene C–C 0.91 / 1.44; NaOH's Na–O (xtb) Wiberg 0.63. So
distance decides whether to ask, and the Wiberg order what a stretched bond
is: ≥ 0.1 a partial bond (shown, dashed), < 0.1 come apart (set aside, a
header button shows it). xtb itself lists no bond below 0.10. A bond that
formed still sets the result aside — the signature of a bad start (the user
suspects a wrong 2D structure or a spontaneous isomerization; ISSUES.md).

**The fully open case: 1,1-diphenylethylene + Br⁺** (~/bromonium-dpe). xtb
from the user's start: C1–Br 1.997 Å (Wiberg 0.92), Ph₂C···Br 2.750 Å —
1.40 ×, Wiberg 0.085 (OCC's single point at xtb's geometry: −39.701383 Eh
against xtb's −39.701396, Wiberg 0.085). The open benzhydryl cation: just
under the cut, as it should be.

**But Valence's own run from that start went wrong**: Berny converged in 18
steps to −39.496268 Eh with C1–C2 broken (2.53 Å, Wiberg 0.06) and both C–Br
bonds whole (1.90, 1.96 Å) — 129 kcal/mol above xtb's minimum from the same
start (xtb re-optimising Valence's point stays in a basin 80 kcal/mol up,
C1–C2 3.02 Å). The guard rightly set it aside; not yet understood. The start
is poor (phenyl C–C 1.22 and 1.81 Å, C–Br 1.50/1.61 Å).

Fixtures: tests/references/bromonium-ions.ts (both xtb minima, the sketch's
bonds).

## Geminal diphenyls: the embedder tore the rings (2026-10-23)

1,1-Diphenylethane drawn in JSME came back "GFN2-xTB found no usable
geometry": the start had C–C 1.85/1.26 Å in the rings and C–H 0.65 Å. Two
causes in place3d.ts, then the overlap pass (embed.ts) made them worse —
pushing a too-close nonbonded pair apart to 1.2 Å moves a ring carbon:
1. Ring H's pointed "outward" from the centroid of EVERY ring atom. With two
   phenyls on one carbon that centroid lies between the rings, and the inner
   atoms' H's pointed into their own ring (H24 0.35 Å from C11). Now: outward
   along the bisector of the atom's own two ring bonds — no centroid.
2. Rings are seeded flat from the page, so both phenyls lay in one plane and
   their inner ortho H's met (H23···H24 0.61 Å). Now: a ring on a single
   bond is turned about it, in 30° steps, to the most room when its side
   clashes (< 1.5 Å) with the rest — the smaller side turns.
The start is then whole (closest contact a methyl's geminal H···H, 1.75 Å);
GFN2 converges in 12–18 steps (2 s) to xtb's minimum (−37.094641 against
xtb's −37.094671 Eh from Valence's point, 13 steps; all real).

**The 1,1-diphenylethylene bromonium, from JSME's own sketch** (before the
fix GFN2 bonded the two phenyls' ortho carbons, C5–C15 1.45 Å): Berny now
converges to C3–Br 2.64 Å, Wiberg 0.15 — a "partial bond" — at −39.688288 Eh.
Not a minimum: xtb from that point goes on 44 steps to the open ion (2.749 Å,
−39.701396 Eh, 8.2 kcal/mol lower). The cause is OCC 0.9.4's analytic
gradient (peterspackman/occ#58): at 27 atoms the ion is past
MAX_NUMERICAL_GRADIENT_ATOMS (24), so the exact-gradient check is skipped.
With it allowed (and the budget lifted) Valence reaches 2.75 Å, Wiberg 0.09,
and the guard sets the result aside as it should — but in 111 s. So in the
app this ion reads as partial until the engine is rebuilt on OCC 0.9.6. **(Corrected the same day, below: on the rebuilt engine, with an exact gradient, Berny still stopped at 2.63 Å — the cause was Berny's false convergence, and the restart is what reached 2.75 Å.)** The
3-ring also starts compressed (C–Br 1.50/1.61 Å): ring atoms share one scale
factor, set by the C–C bonds.

## The engine rebuilt on OCC 5644eaf; Berny held to the Cartesian gradient (2026-10-23)

**Is 0.9.6 out?** No: no tag, GitHub release, PyPI `occpy` or npm `occjs`
past 0.9.5. Main's version string was bumped to 0.9.6 on 2026-10-15
(f721a6a) and the D4 fix (5644eaf, #58) landed the same day; main has moved
on since (coupled-cluster work, a SAP data race). Pinned at 5644eaf with the
user, to take the fix and nothing past it. Built in C:/Users/mccan/Code/occ-096
(occ-win, the v0.9.4 tree, kept); `git apply --3way` clean on all 13 files;
emsdk 6.0.10, the recipe's flags. wasm 3,032 KiB (was 3,173).

**The gradient is exact now** — |analytic − numerical|, Eh/bohr: anion
4.6e-4 → 2.3e-7, phenol 2.5e-4 → 3.1e-7, the bromonium ions 2e-4 → 3e-7.
Single points move toward xtb (the anion +6.8 → +0.36 µEh, the
diphenylethylene bromonium +13 → +1.8). Charges ~0.001 e, dipoles < 0.01 D;
quoted geometries, NaOH's 155.6°, water's 1540/3642/3650 cm⁻¹ unchanged. The
suite passed unchanged on the new wasm, before any code change.

**But the bromonium still stopped at 2.63 Å**, now on an exact gradient —
the gradient bug was not why. Berny's convergence test is on its internal
coordinates; at its "converged" point OCC's and xtb's gradients agree on a
max component of 8.5e-3 Eh/bohr (xtb's Hessian there: one imaginary mode,
61i). The old numerical check had been doing two jobs: correcting the
gradient, and catching Berny's false stops by restarting it (that restart,
with its fresh internal coordinates, is what reached 2.75 Å in the 111 s
run). So the check stays, on the analytic gradient — the last step's, free —
for every size, and the 24-atom limit and the numerical L-BFGS rung are gone.

The gate, measured at Berny's stops (max Cartesian component): good stops ≤
7.3e-4 (imidazole; diphenylethane 6.4e-4, diborane and ethene 5.3e-4); the
phenylbutene bromonium 1.4e-3 (0.26 kcal/mol up); false stops O₂ 3.3e-3,
the diphenylethylene bromonium 8.5e-3, N₂ 9.2e-3 (one step). Berny's own
4.5e-4 failed diphenylethane, whose restarts never got under it and whose
ladder then spent the 30 s budget; Gaussian's loose 2.5e-3 sits in the gap.
With it: N₂ and O₂ restart and finish, diphenylethane 1.4 s, and the
diphenylethylene bromonium reaches xtb's open ion (2.75 Å, Wiberg 0.09,
−39.701391 Eh) in 8–9 s — set aside behind the button, as the guard intends.

Water's dipole: the 2.28 D full / 1.59 D from the charges quoted in AGENTS.md
are at the oracle's geometry (104.9°); at the app's own optimised water
(107.2°) both builds give 2.22 / 1.54 D, and pyridine 2.10 / 1.05 against
the quoted 2.28 / 1.16. Not a 0.9.4 artifact — a matter of which geometry.

## AGENTS.md's figures moved to tests (2026-10-24)

AGENTS.md quoted measured figures in prose, with no geometry, date or check;
two had drifted. Traced each property figure, then pinned the claims in
`tests/gfn2.test.ts` ("the claims AGENTS.md makes of GFN2-xTB"), each against
xtb 6.7.1 (`--gfn 2`, lenovo ~/claims) at a named geometry:

| claim | geometry | oracle |
|---|---|---|
| water full / charges-only dipole | the test's fixed water (O–H 0.958 Å, ~104°) | 2.278 / 1.594 D |
| water angle | GFN2 minimum | 107.22° (exp. 104.5°) |
| pyridine full / charges-only dipole | GFN2 minimum | 2.101 / 1.050 D (exp. 2.19) |
| benzene C Mulliken | GFN2 minimum | −0.029 (BCI −0.15) |
| NaOH bend | GFN2 minimum | 154.6°, −4.7806745 Eh |

What had drifted: water's bend was quoted 1539 cm⁻¹ (an old Valence run; the
oracle's 1540.8 was already pinned); pyridine's "1.16 / 2.28 D" matches
neither GFN2's minimum (1.05 / 2.10) nor the app's — probably a PubChem
(MMFF94) conformer, never recorded. Water's 2.28 D was right, at the fixed
geometry; the app's own minimum gives 2.22 D. And the limitations section
still called GFN2's Mulliken charges "the default charge model" — ESP-fitted
has been the default since 2026-10-12. NaOH's oracle minimum now lives once,
in tests/references/oracle-minima.ts (it was copied into two test files).

## AGENTS.md streamlined (2026-10-24)

5,157 words → 2,828, no rule changed. The file map had grown into a
specification — each file's mechanism, the decision behind it, the case that
prompted it — which the modules' header comments already carried (checked
file by file before cutting: sketcher-toolbar, charged-x-atoms, the
localized-orbital and charge-model modules, place3d, the render modules,
tooltip, sdf-data; the generated core-density table names its ORCA source;
`index.html` explains polarnitro and the `<rect>` rewrite; the smoke script
covers the JSME checks). The map now says only where; the user's decisions,
scattered through the map, the pipeline and the conventions, are one dated
"Decisions" section; the pipeline keeps its rules and loses its history
(already here). One rule went because its code had: Code Style's "the
optimizer is the exception", which governed `src/optimize/fast-system.ts` and
`tests/fast-system.test.ts` — the hand-rolled optimiser, removed long ago.

## The held structure; formed bonds; Keep optimising (2026-10-24)

Decided with the user: when GFN2's free result changes the bonding (a drawn
bond comes apart, or a new one forms), show the molecule drawn — relaxed —
by default, with the free result behind the header button. "Relaxed" is the
**held structure**: after the free run, and never inside it (the user's
worry, rightly: freezing a bond mid-run would have kept the
diphenylethylene bromonium from ever opening), a second optimisation on GFN2
plus a flat-bottomed wall at the guard's own limits (`heldRestraint`, 0.98 of
them, k = 1 Eh/bohr²), from the lowest point the free run passed while still
the molecule drawn (watched, never steered). The diphenylethylene bromonium:
free ion 2.75 Å / Wiberg 0.09; held, C–Br 2.501 Å (wall 2.497), converged,
passes the guard, 2.2 kcal/mol above the free result, in ~0.1 s after it.
Formed bonds now take the same path; their new contacts are drawn dashed
from `formedContacts`, never added to `bonds` (VSEPR and Lewis read bonds).

**Keep optimising**: the "Refine with GFN2-xTB" handler, offered in the
header when a free run stops short. Testing it (budget cut to 1.5 s) found
that a Berny run stopped by the clock was **thrown away**: `relax` handed over
to the ladder, itself out of time, which returned nothing — "found no usable
geometry", the embedder's start shown after real progress. Now Berny's
unconverged point is kept and the lower of it and the ladder's returned.
Diphenylethane at 1.5 s: stopped after 18 steps, shown, one press → converged
in 7 more.

**Every start, tested**: `tests/embedder.test.ts` embeds every example and
reference sketch and requires the guard's own verdict (the molecule drawn)
and no bond under 0.75× its radii sum. It failed the old embedder on
diphenylethane — and, on its first run, the current one on the
diphenylethylene bromonium: Br 1.89 Å from an ortho carbon, past the ring
turner's 1.5 Å clash but inside C···Br's 2.36 Å new-bond limit. The turner
now uses the guard's limit (`newBondLimit`, one rule), skips 1,3 pairs as the
guard does, and repeats in 15° steps while a pass helps (two phenyls on one
carbon settle together).

## A three-membered ring that closes (2026-10-24)

The user drew the reverse of the bromonium case: BrCH₂–CH₂⁺ (the 2-bromoethyl
cation), the Br on a wedge. GFN2 closed it to the ethylene bromonium (C1–Br
and C2–Br both 1.98 Å, Wiberg 0.86 each; a minimum, lowest mode 446 cm⁻¹),
and the guard said nothing: C2 and Br share C1, and a 1,3 pair was exempt —
its distance is normally set by the angle between two bonds. Distance cannot
tell the cases apart: diborane's B···B, across its drawn bridges, sits at
1.05× its radii sum, the bromonium's C2···Br at 1.01×. GFN2's Wiberg order
can: B···B 0.55 (three-centre bridging, drawn as such), C2···Br 0.86. No other
close 1,3 pair exists in the examples. So a close 1,3 pair is a new bond at
Wiberg ≥ 0.75 (the worker now returns the whole Wiberg matrix), and the held
structure keeps such a pair apart (its wall skips 1,3 pairs otherwise).
Two points either side — the same thin calibration as the 0.1 cut (ISSUES.md).

**On a plain bond the Br never closes**: the embedder sets the C1–C2 torsion
anti to C2's hydrogen, which puts the Br in the CH₂⁺ plane, and GFN2 finds a
true minimum there — the open cation, all frequencies real (lowest 250 cm⁻¹),
20.4 kcal/mol above the bromonium. The user's wedge turns the Br 60° toward
C2's empty p orbital, and the ring closes. The torsion the embedder picks
decides which minimum a carbocation reaches.

Decided with the user: the embedder stays as it is. It could set a
substituent beside an empty p orbital at 90° to its plane (what the wedge
does), but that would be the embedder "doing too much" — choosing a
conformer the drawing did not ask for. A plain bond lies where the
embedder's rules put it; a wedge or hash says what leaves the plane, and
having to say so is itself the lesson (AGENTS.md, Decisions).

## A single atom (2026-10-24, ISSUES.md "bare lithium")

A bare Li showed "Unoptimised structure — GFN2-xTB could not treat this
structure ([object Object])". Two things: Berny cannot be built for one atom
(OCC throws a C++ exception), and that exception reaches JavaScript as a
`CppException` holding only a pointer — this build exports no decoder — so
`String()` made it "[object Object]". GFN2's single point is fine on every
lone atom tried (Li a doublet, Na⁺, Xe, He, Cl⁻, Ni). Now a single atom (after
the filler: bare C is CH₄) skips the lookups and the optimiser and shows as
"Single atom", the single point giving every view its charge, spin and
orbitals — He's lone pair and empty valence, Li's open-shell α orbitals
(Pipek–Mezey, the Lewis view refusing an open shell), Xe's and Cl⁻'s four
lone pairs. Refine declines one, and the worker refuses it in words; its
errors are now described, never stringified objects. A lone atom is also
framed with its orbital lobes: on the atom alone, Li's 2s overflowed the view.

## Frames on demand (2026-10-25)

An empty fresh tab idled at 10–20% CPU. The render loop redrew the scene on
every animation frame whether anything had changed or not: in the dev server,
with no molecule, the WebGL context was cleared and presented ~48 times a
second (zero draw calls), at ~0.1 ms of JavaScript a frame — the cost was the
browser's GPU and compositor presenting a new frame each refresh, not our
code. JSME's own 250 ms GWT timer is the only other idle activity, and
negligible. Now a frame is drawn when asked for (`ctx.requestRender`): at the
end of every rebuild, on the trackball's 'change' (its damping coast
included), on a resize, and — the catch-all — on any pointer, wheel, key,
click, input or change event anywhere on the page. Only auto-rotate and a
playing vibration keep the loop running. Measured after: 0 frames a second
idle, before and after a molecule; vibration and auto-rotate render at the
browser's frame rate and stop when switched off; ESP, MO surfaces and the
ESP-fitted charges, all arriving from the worker, are drawn when they land.
Anything that changes the scene outside a rebuild or an input event must call
`ctx.requestRender()`, or the picture goes stale.

## JSME pairs opposite charges; a radical as an X atom (2026-10-26, ISSUES.md "JSME related")

Drawing the Birch radical anion of nitrobenzene: a charge click on the ipso
carbon, single-bonded to nitro's N⁺, did not make C⁻. JSME's charge tool
paired the new charge with its neighbour's — C=N, both neutral, N five-bonded
(measured on jsme-editor 2024.04.29; a C⁻ clicked toward C⁺ beside O⁻ pairs
the same way). JSME holds C⁻ next to N⁺ when it is written in: a JME read keeps
both charges and the single bond, on screen and in the MOL block. So the
charge tool now reads the pairing off the JME strings before and after the
click — one bond one order higher, its partner's charge gone, nothing else
changed (`pairedCharge`, `tests/paired-charge.test.ts`) — and reads the
drawing back with the clicked atom given the opposite of its partner's
charge, Undo taking it back. JSME draws no label on a neutral carbon, so the
hover cannot name the atom clicked; the bond's neutral carbon is it. JSME's
`smiles()` still merges such a pair (C–C⁻–N⁺ comes out "CC=N"); only the
lookup reads it, and the guard's bond orders reject what it finds.

JSME has no radical tool and writes no `M  RAD`. Its X atom takes any label:
`[CH]` (SMILES's radical carbon), `[C·]`, `[C•]`, `[C·-]` and `[N·+]` were all
kept, drawn as written, and come back in the V2000 and V3000 blocks as the
label ("C•") and in `smiles()` bracketed. `C•` reads better than `C·` at
sketch size. Not yet read by the build.

## The radical tool; JSME pairs charges on every edit (2026-10-26, later)

**The pairing is not the charge tool's alone.** With C⁻–N⁺ drawn (written in
by a JME read), adding a methyl at the far end of the ring turned it into
C=N again; so did a carbon added to an ammonium ylide's methyl (CH₂⁻–N⁺Me₃ →
CH₂=NMe₃, N five-bonded), erasing a methyl beside one, and the radical tool's
X-key press. `nopolarnitro` and `nocanonize` change nothing; there is no
option for it. JSME's SMILES reader pairs on the way in too
(`[CH2-][N+](C)(C)CO` reads as C=N). So the check now runs after every
release on the sketch: the drawing is kept at the press (ahead of the element
and radical tools, which edit on the press), and any bond one order higher
whose two atoms are now neutral, at least one charged before, is put back
with its charges (`chargePairings`, `tests/paired-charge.test.ts`, the JSME
strings captured). Atoms are followed past an addition (JSME puts a new atom
last) and a single deletion (the atom whose removal leaves the other bonds
where they were). Not handled: a drawn C⁻–N⁺ that the user then deliberately
makes a double bond — it would be put back as drawn.

**The radical tool** ("the dot", beside the charge tool): an atom becomes the
X atom "C•" (with a charge, "C•-"). JSME draws no label on a plain carbon, so
the hover cannot name the atom clicked; JSME's X key can — it turns the atom
under the pointer into the X box's label — so the box holds a placeholder,
"[Rn]", for the press, and the atom that became it is the one ("[Og]",
past JSME's element table, changed nothing). Under "Move atom" JSME drew no
hover box and took no keys; the tool runs under the element action. An atom
takes the dot only if the filler would give it a hydrogen; a second click
takes it off. The charge tool on a dotted atom keeps the dot (C• → C•⁻), and
Clean keeps it. The build reads the label, a radical centre takes one
hydrogen fewer, a sketch with one skips the lookups (its SMILES "[C•]" reads
nowhere), and the spin follows from the electron count. The SDF writes it on
`M  RAD` (2, a doublet), which the parser reads back; a saved view keeps it,
so a later refine does not fill the missing hydrogen.

Checked in the app: the Birch radical anion of nitrobenzene drawn as ipso
C⁻–N⁺(=O)O⁻ with a para C• builds as C₆H₅NO₂⁻, a GFN2 doublet, a minimum,
C₂v; in the Delocalized view (α) the HOMO is the singly occupied b₁ π*,
heaviest on N, the oxygens and the para carbon.

## A group takes the place of an end atom (2026-10-26, ISSUES.md)

An element button replaces the atom clicked; a group from "Groups…" bonded
itself to it, so the workflow that gives chloromethane (draw a bond, pick Cl,
click its far end) gave nitroethane with NO₂. JSME's substituent actions
always bond to the atom, so the toolbar rewrites after the release: where the
atom clicked ends a single bond, it is taken out, the group moved so its first
atom stands where the atom was, and bonded to the neighbour
(`groupInPlaceOfAtom`, `tests/group-in-place.test.ts`, JSME's nitro on ethane
captured). Anywhere else — a ring or chain atom, a lone atom, the end of a
double bond — the group stays bonded to the atom, a substituent in place of a
hydrogen: NO₂ on a ring carbon is still nitrobenzene. "=O" is always on the
atom (its name says so; in a methyl's place it would turn ethane into
formaldehyde, not acetaldehyde). Checked in the app: ethane → nitromethane,
benzene → nitrobenzene, Undo back; the smoke test's COOH on methanol's O is
now acetic acid, and CN dropped on dimethylamine's N stays N-bonded.

## Methyl isocyanate: bent at N and at C, and its N lone pair (2026-10-29)

The isocyanate carbon of CH₃–N=C=O is not linear. ωB97X-D3/def2-TZVP (ORCA,
a minimum; `tests/references/dft/methyl-isocyanate.xyz`) gives N=C=O 174.1°,
bent trans to the methyl (C–N=C=O 179.7°), with C–N=C 140.4°; gas-phase work
puts C–N=C near 140°, a soft bend. Against that:

| Source | C–N=C | N=C=O |
|---|---|---|
| ωB97X-D3/def2-TZVP | 140.4° | 174.1° |
| GFN2-xTB (the app; xtb 6.7.1 agrees) | 148° | 169°, trans |
| PubChem (MMFF94) | 114° | 179.8° |

GFN2 bends the carbon the right way and a little too far; PubChem's
straight carbon and tight nitrogen are the further from the minimum. The
GFN2 structure is GFN2's own answer: xtb 6.7.1 (`--gfn 2 --ohess vtight`)
from the app's structure gives −12.807340 Eh, the app's −12.807339, every
atom within 2e-4 Å, no imaginary modes. From a linear C–N=C=O start it stops
at a stationary point 1.26 kcal/mol higher with two imaginary modes.

What was wrong was the lone pair. `getLonePairDirections` put an AX₂E pair
opposite the sum of the bond vectors as the renderer gave them, unnormalized,
so the longer N–CH₃ (1.41 Å, against N=C's 1.19 Å) dragged it: 123° from
N–CH₃, 89° from N=C, where it belongs 106° from each. Any bent sp² centre
with unequal bonds (N-methylmethanimine's too) leaned the same way; the tests
fed unit vectors only. The function now normalizes on entry
(`tests/orient-lone-pairs.test.ts`). Checked in the app on the PubChem
conformer: the pair points out of the open side of the C–N=C angle.

## The lone-pair tests, on DFT minima (2026-10-29, later)

The user asked what the early lone-pair tests were worth. Little: ideal,
unit-length, symmetric bond directions, where symmetry fixes the answer for
any sensible rule (ammonia, water, "pyridine-like"); expected numbers derived
from the code's own formulas; and one test pinning a lone pair lying on top
of a bond, for three collinear bonds no molecule has. The aziridine test was
the exception — its asymmetry tells rules apart, and its 62°/110° were
PubChem's MMFF94 angles, rebuilt as unit vectors.

The rewrite runs real molecules through the renderer's own path
(`lonePairDirectionsByAtom`, which the renderer now calls instead of doing
the work inline): 26 ωB97X-D3/def2-TZVP minima, one for each lone-pair
arrangement and every Example that draws one. The user asked for ORCA, not
PubChem — PubChem's conformers are not always good structures. The runs and
how their starts were generated are in `~/orca_calcs/lone-pairs/README.md`;
`tests/references/dft/README.md` lists them. With the unnormalized sum put
back, ten of the new tests fail, pyridine's among them: even its two C–N
bonds differ enough.

What the real structures found:
- **Drawing order moved hypervalent lone pairs.** XeF₂'s ring of three turned
  60° with the order of its two bonds; XeF₄'s pair took its normal from the
  first two bonds, and on a square 0.3° from flat a trans pair drawn first
  tipped it 4°. Fixed in `orient-lone-pairs.ts`.
- **Methyl isocyanate's O lone pairs stand across the molecular plane**, not
  in it as formaldehyde's do: the sp carbon's two π bonds are perpendicular,
  the N=C π stands across the C–N=C plane, so the C=O π lies in it. The app
  was right; the test's first expectation was wrong, and it is now a test.
- **GFN2-xTB has a spurious D₃h minimum for ClF₃**, 15.4 kcal/mol above its
  T-shape (F–Cl–F 167.4°; xtb 6.7.1, `--ohess vtight` from both). Open
  Babel's planar start fell into it. Valence never meets it: the embedder
  starts AX₃E₂ T-shaped.
- **ORCA's redundant internals oscillated on XeF₄'s square plane** for 17
  cycles (trans F–Xe–F 175.7° ⇄ 177.2°); Cartesian coordinates (`!COpt`)
  converged in 3.

## The examples on DFT minima; the MMFF94 oracle retired (2026-10-29, later)

Ten of the lone-pair minima became examples (ammonia, aziridine,
formaldehyde, methyl isocyanate, ozone, SF₄, ClF₃, XeF₂, BrF₅, XeF₄), and the
dropdown went into sections: four, five and six electron domains, each from no
lone pairs to the most, then double and triple bonds, aromatic rings,
three-centre bonds and metal centres. Hybridization alone could not sort
them — most molecules mix sp³, sp² and sp — but the electron-domain count is
what the model reads hybridization from. The number keys load the first
nine shown.

Then the user asked for every example not idealized on purpose to move to a
DFT minimum: none of the hand-built or PubChem geometries was a teaching
choice. Thirteen did; PCl₅, SF₆ and ZnCl₂ stay ideal, as their comments say.
The minima already run (Open Babel's atom order) were matched to each
example's bond graph — among the symmetry-equivalent matches, the one closest
to the old structure — and rotated into its frame, so atom indices and
orientation carry over; the rest were run from the example itself. Old and
new are 0.000–0.16 Å RMSD apart, hand-built imidazole the furthest, and every
test that reads an example passed unchanged. The details:
`tests/references/dft/README.md`, `~/orca_calcs/examples/README.md`.

The MMFF94 oracle test is retired, the user's call: it compared hybridization
labels with MMFF94 atom types through a hand-kept table, and by now each new
example only added a row or a documented deviation (ten for the last batch,
none a bug), while the lone-pair tests check what the view draws. Its history
above (diborane's B···B, the ferrocene corpus) stays as written.

## An example is drawn in the sketcher (2026-10-29, later)

The user asked for the example in JSME too; the sketcher stayed blank, or
kept the last drawing beside a different molecule. JSME's "Paste…" was their
first thought, but the toolbar's Clean already had the road: a MOL block read
with every coordinate zeroed, which JSME lays out in 2D itself, keeping the
atoms in order, drawn hydrogens and charges (`drawInSketcher`,
`sketcher-toolbar.ts`). Read that way, 25 of the 28 examples came back
exactly; the rest were charges. JSME read Ni²⁺ and its Cl⁻ and C⁻ ligands
neutral, the charges it refuses, and imposed B⁻ and H⁺ on diborane's
four-bonded B and two-bonded bridging H. Each such atom now goes in as an X
atom with the block's charge — a neutral one bracketed, "[B]", or JSME's own
atom takes the charge again — and all 28 read back as the molecule on screen
(the build's own reading: V2000 plus the X labels). The hydrogens stay drawn,
as the example has them: what Build reads is then what the scene shows.
JSME's layout of the X atoms is plainer than its own (Ni(CN)₄²⁻'s cyanides at
uneven angles) but no worse than a user's drawing of the same charges.

## The hydrogen halides, and GFN2's dipole down the group (2026-10-29, later)

HF, HCl, HBr and HI joined the examples in a section of their own, after the
four-domain one (each X is AXE₃), for AP and first-year students comparing
down group 17. ωB97X-D3/def2-TZVP minima (`~/orca_calcs/hydrogen-halides`):
H–X 0.919, 1.276, 1.417, 1.606 Å, within 0.004 Å of experiment as
remembered; dipoles 1.94, 1.27, 0.96, 0.49 D, falling as experiment's do
(about 1.83, 1.11, 0.83, 0.45 D).

GFN2-xTB's full dipole does not fall: 2.52, 1.05, 2.51, 2.37 D at the DFT
structures, the app and xtb 6.7.1 (`--sp`) agreeing to the digit. Its
Mulliken charge on X falls as it should (−0.39, −0.33, −0.27, −0.19), so the
overshoot for HBr and HI is in its atomic-dipole terms — the full dipole
AGENTS.md already says overshoots water's. The header's dipole for these two
would mislead a lesson on the trend; what to do about it is open (the user's
call).

The user's call (2026-10-30): the lesson comes from the charges, and the four
examples carry experiment's dipoles in a note (NIST CCCBDB: 1.827, 1.093,
0.827, 0.448 D; its HCl is μe, which is why tables quoting μ0 give 1.109). But
not every charge set falls: the ESP-fitted charges, the labels' default, are
fitted to the same potential as the dipole and on X read −0.57, −0.20, −0.38,
−0.32 for HF to HI. Mulliken (−0.39, −0.33, −0.27, −0.19), CM5 (−0.36, −0.27,
−0.26, −0.21) and Hirshfeld (−0.29, −0.22, −0.21, −0.18) fall, so the note
names Mulliken and CM5. The ESP map comes from the same density as the dipole,
so it is no guide to this trend either.

## Groups only take an end atom's place; JSME's zoom kept (2026-10-30)

Supersedes "A group takes the place of an end atom" (2026-10-26). A group
from "Groups…" took an end atom's place but was bonded to a ring or chain
atom, and the substitution showed JSME's bonded group for the length of the
press: JSME applies a substituent action on the press (its drawing changes
within the mousedown), and the rewrite ran after the release. Now one rule:
a group takes the place of an end atom or a lone atom, bonded to the
neighbour by the group's own bond (=O on ethane's methyl is formaldehyde),
and on a ring or chain atom it is not drawn — a ring substituent is a bond
first, then the group on its end. The rewrite runs from the press in a
requestAnimationFrame: JSME's read redraws its SVG synchronously (measured),
so the frame after the press already paints the group in place. A refused
group reads back the drawing from the press, whole: JSME had also charged
the atom (pyridine's N, nitro bonded, read N⁺, and taking only the group
out kept it). Checked in the app: methanol's O → nitromethane, pyridine's N
unchanged; the smoke test drags CN onto methylamine's N (acetonitrile) and
clicks it on dimethylamine's N (unchanged, after JSME drew it).

**The zoom.** JSME's zoom is its "molecular area scale" — 2 on a fresh page,
changed by the mouse wheel (three notches: 2.12), read and set by
`getMolecularAreaScale`/`setMolecularAreaScale`. `readMolFile` and
`readMolecule` put it back to 1, synchronously; `readGenericMolecularInput`
does too, a moment later. Every read the toolbar makes (Clean, an example
drawn, Undo over a read, a group, a refused charge, a radical, an
unpairing) now goes through `readMolFile`/`readJme`, which set the scale
back. Every example fits the sketcher at 2 (the widest, Ni(CN)₄²⁻ and PCl₅,
checked by eye).

## A group takes the place of any atom; JSME's undo history (2026-10-30, later)

Supersedes the end-atom rule of the entry above. A group now takes the place
of whatever atom is clicked, as an element does, and the sketch is the
user's to correct: on a ring or chain atom the group's first atom takes the
atom's bonds as drawn (COOH on a ring N, or CN on dimethylamine's N, is a
five-bonded carbon, which JSME's SMILES writes C⁺), and an end atom's one
bond becomes the group's own (=O's double). One rule, its quirks the same
everywhere (the user's words, near enough).

**JSME's undo history.** The rule that took a refused group out again showed
it: cyclohexane, COOH clicked on a ring carbon (nothing drawn), a methyl
added, Undo — and the COOH appeared, bonded to the ring. Measured on
4-hydroxypiperidine: JSME writes each of its own edits into its undo history
as the drawing it made, and no read ever enters it (readGenericMolecularInput,
readMolecule and readMolFile, then Ctrl+Z, skipped past all three). So after
a group its history held the group bonded, and the Undo after the next edit
went there — for a group put in place too, not only one refused. Reading the
drawing again after the release did not help. What does: after the release,
JSME's own Undo takes its entry out, and the drawing in place is read again
in the same task (nothing painted between). An Undo after the next edit then
steps back to before the group (methyl and group together; the smoke test:
acetic acid, a bond on its OH, Undo → methanol). JSME's entry is still there
for its Redo, so Redo does nothing while a drawing the toolbar wrote is on
screen. Every read the toolbar makes (Clean included) is missing from that
history the same way; only the group left a wrong molecule in it.

**JSME's Undo and Redo reset the zoom** to 1, as a read does: the toolbar's
buttons go through `keepingZoom`, and Ctrl+Z / Ctrl+Y typed on the keyboard
get the zoom put back before the next frame.
