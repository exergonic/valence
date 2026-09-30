# PLAN — Charge-model ESP, then extended Hückel

Where Valence is going next. 

The dipole proved that the bond-charge-increment (BCI) partial charges from
`mmff94-ts` are a solid, honest backbone for the app; the ESP surface then
spent that backbone on the real thing. The plan now reads: a full
extended-Hückel (EH) molecular-orbital layer with localized orbitals. All of
it stays pure TypeScript, zero dependencies, honestly labeled — the house
rules of AGENTS.md.

**Status 2026-09-28.** The dipole and the ESP surface are shipped; nothing of
Phases 2–5 exists yet. The table below is the current state, with the
evidence for anything called shipped.

---

## Progress

*As of 2026-09-28 (evening). Measurements for anything called shipped live
in NOTES.md.*

| Piece | State | Evidence |
|---|---|---|
| Charge model (BCI partial charges) + dipole arrow | **shipped** | `src/chem/charge-model/bci-charges.ts` + `dipole.ts`; shared mmff94-ts adapter in `src/geometry/mmff-refine.ts` |
| **Phase 1** — ESP surface (charge model) | **shipped 2026-09-28** | `src/chem/charge-model/esp.ts`, `src/render/esp.ts`; commits 208b78f → 19669f8 |
| **Phase 2** — extended-Hückel core | **core shipped 2026-09-29** | `src/chem/extended-huckel/` (parameters, assign-basis, slater-overlap, hamiltonian, solve) + `src/utils/eigen.ts`; fixtures in `tests/references/eht/` |
| **Phase 3** — MO diagram + click-to-highlight | **shipped 2026-09-29** | `src/ui/mo-diagram.ts` (the MO tab) + `src/render/mo-lobes.ts` (phase-colored lobes) |
| **Phase 4** — localized orbitals (PM on EH) | **shipped 2026-09-29** (occupied + valence-virtual, multi-pick) | `src/chem/localized-orbitals/` (mulliken-populations, localize-pm, order-localized) + the MO panel's Ladder/Localized toggle; measurements in NOTES.md |
| **Phase 5** — JANPA / CLPO | parked on purpose | needs an ORCA wavefunction a static page cannot produce |

Milestones:

- [x] **1** — fused vdW surface, red→green→blue map, honesty ladder, toggle +
      transparency, tests (water sides, monopole far-field, watertightness,
      FD-gradient oracle, CCl4 signed volume)
- [x] **2a** — simple-Hückel π-only solver with analytic pins ← superseded:
      went straight to extended Hückel, with the solver pinned on analytic
      matrices instead (`tests/eigen.test.ts`)
- [x] **2b** — extended Hückel: Slater overlaps, VSDIP, Wolfsberg–Helmholz,
      WebMO/YAeHMOP fixtures (s+p basis; 3d on Si/P/S/Cl still to come)
- [x] **3** — level diagram, click-to-highlight, Cartesian p-orbital lobes
      (windowed energy axis, HOMO/LUMO tags, phase colors; open shells show
      the ladder with no occupancies and a note)
- [x] **4a** — the spike: EH MOs → PM; water, ethene (ethane and acetone were
      not needed — the pin set is in `tests/localized-orbitals.test.ts`) — and
      it ran in TypeScript, not in `avo_ibo`: a throwaway script answered the
      risk question (clean local orbitals, no rubbery tails) before the port
- [x] **4b** — PM localization, character classification and display order,
      LMO rendering through the existing MO pictures; the degeneracy resolver
      ships as a symmetry guard after measuring that it fires on none of the
      seven test molecules (NOTES.md)
- [x] **4c** — the valence-virtual block: the empty σ*/π* orbitals localized
      the same way, in their own section of the list (the IAO/VVO screening
      step is a no-op on a minimal basis — NOTES.md)
- [x] **4d** — several orbitals at once: pick a filled orbital and the empty
      one it reaches into, each with its own phase colours, for the
      hyperconjugation picture
- [x] **5 (part 1)** — second-row 3d: five d functions on Si, P, S and Cl, with
      ICON8's parameters (Alvarez has no second-row d), the s–d/p–d/d–d
      overlaps transcribed from YAeHMOP's angular step and pinned against a
      `bind` run on PCl₅ — every pair inside 1.07e-04, the 4-decimal floor
      (NOTES.md).
- [x] **5 (part 2)** — the d block: 25 transition metals with s+p+contracted-d
      from the shipped table, ferrocene as the example and the fixture, and the
      electron-domain model taught to refuse a metal centre instead of
      inventing "sp³d²" for iron.

**Layout (2026-09-29).** The chemistry now lives in method folders, so the
arc of the app is visible at the directory level: `chem/vsepr/` (the
Lewis-like picture), `chem/charge-model/` (BCI charges, dipole, ESP), and —
as they land — `chem/extended-huckel/` and `chem/localized-orbitals/`.
Files inside a folder name the action (`hybridize.ts`, `slater-overlap.ts`);
shared tables and graph fixes stay at the `chem/` root. Phase 2 lands in
`chem/extended-huckel/`, with the generic solver in `src/utils/eigen.ts`.

---

## Phase 1 — Electrostatic potential surface (charge model) — SHIPPED 2026-09-28

**As shipped** (`src/chem/charge-model/esp.ts`, `src/render/esp.ts`; commits 208b78f →
19669f8). Two places where the original draft was wrong, corrected the same
day:

- **The surface is FUSED, not per-atom.** One closed molecular surface for
  the whole molecule, extracted by marching tetrahedra over the union
  signed-distance field f(p) = minᵢ(|p − aᵢ| − rᵢ), not a mesh per vdW
  sphere. The per-atom overlay shipped first and the user corrected it within
  the hour: a vertex of one sphere can sit inside a neighbor, so the charges
  must be probed at the FUSED boundary. That decision is what makes the
  cusps honest.
- **Neutral is GREEN, not white.** The map is red → green → blue,
  piecewise-linear between the three stops (the textbook print), symmetric
  about zero and |V| percentile-clipped at the 90th so an ion's near-field
  cannot wash out the rest.

Shape of the shipped thing: V(r) = Σᵢ qᵢ/|r − rᵢ| with a 0.35 Å floor on
|r − rᵢ| so a vertex on a nucleus cannot blow up; the vdW radii moved to
`src/chem/radii.ts` so the field and space-filling share one table (the
draft had them living in the render layer); an "ESP (charge model)" toggle
plus an ESP Transparency slider, with the mesh cached per molecule so
transparency changes never re-extract it; and a translucency scheme
(depth-only back pass, then a translucent front pass) that lets the surface
occlude itself while the atoms still read through it.

**Honesty ladder:** one refusal rule in `resolveCharges` covers the dipole,
the charge labels and the surface together — an element outside the MMFF94
type space gets no surface, no arrow and no numbers, all from the same
guard. `parameterGapInfo` non-empty → the caveat stands. No QM language
anywhere.

**Tests:** water's O side negative and H side positive; the monopole
far-field V → Q/R; the fused surface watertight (every directed edge
traversed once in each direction) with every area-bearing triangle pointing
outward against an independent finite-difference gradient oracle; and the
local-pipeline CCl4 geometry wound outward, pinned by signed volume.

**Two artifacts found and fixed the same day**, both root-caused with
measurements in NOTES.md, both worth remembering for later mesh work:
(1) the translucent surface leaked through itself until a depth-only
back-face pass sat under it; (2) on the mmff94-ts geometry the mesh came out
**46% inside-out** — backface culling then erased the whole near side — because
the orientation pass propagated one winding across the mesh and a global
vote cannot repair a *partial* inversion. Orientation now comes from each
tet's own inside/outside sign, which is exact.

**Cost:** one day, against the draft's "a few days" — and no math beyond a
dot-product loop, as predicted.

---

## Landed alongside (not phases of this plan)

Same day, outside the ESP's own scope, so the plan's own record stays honest
about what already exists:

- **Per-atom charge labels** (a "Charges" label mode) and **hybrid labels**
  drawn on the atoms, shadowed like the element symbols.
- **The dipole arrow** in its shipped form: crossed-tail symbol, no +/−
  labels, resize-aware shaft.
- **The Info log** in the controls panel for verbose model caveats.
- **Fetch guard tightened twice**: a PubChem 3D record without MMFF94
  charges is refused, and a remote structure that drops the sketch's formal
  charge (methyl anion) falls through to the local pipeline.
- **3-ring sp² planarity restored** (the cyclopropenyl cation case).
- **Right-click the display → Copy as XYZ / SDF / PNG**, sharing the Export
  tab's writers so a pasted structure matches a downloaded one.

---

## Phase 2 — The extended-Hückel core (the solver) — NOT STARTED (next up)

This is the only genuinely new mathematics in the whole plan, and it is
small. Extended Hückel is a one-shot calculation: no self-consistent
field, no iterations. The secular (eigenvalue) problem is built straight
from connectivity:

1. **Basis:** s+p for first-row atoms (H 1s, C/N/O/F 2s2p); s+p+d for
   second-row (Si, P, S, Cl, Ar — 3d included). Take yaehmop's basis
   wholesale rather than trimming it: the app already handles
   hypervalent S and P carefully (SF₆, sulfones), and EH without 3d on
   S gives qualitatively wrong MOs for exactly those molecules. Same
   overlap machinery, just a bigger table. Slater exponents per
   element (Clementi–Raimondi values — a small data table with the
   source cited).
2. **Overlap S:** the standard Slater overlap integrals between basis
   functions on different atoms — hand-rolled closed forms for s–s,
   s–p, p–p (the textbook formulas; also the safest thing to test).
3. **Hamiltonian H:**
   - diagonal Hᵢᵢ = valence-state ionization potentials (VSDIP
     table, the standard Pople values — same numbers yaehmop and
     WebMO use);
   - off-diagonal Hᵢⱼ = ½·K·(Hᵢᵢ + Hⱼⱼ)·Sᵢⱼ (Wolfsberg–Helmholz,
     K = 1.75 exactly, Hoffmann 1963, pinned so levels match any
     other implementation that uses it; the distance-dependent
     variants — Ammeter–Bürgi–Thibeault–Hoffmann — exist and are
     deliberately NOT used here).
4. **Solve Hc = εSc** — a hand-rolled Jacobi eigensolver for the
   generalized symmetric eigenproblem. It is ~100 lines, well
   understood, and tiny matrices here (≤ ~15 atoms ≈ 60 basis
   functions).

**Open shells.** EH as built here is closed-shell. A radical (doublet)
or triplet sketch gets no MOs and a warning — refusal, not silently
wrong orbitals, per the house rules.

**Output:** orbital energies ε and coefficients c — the MOs.

**Milestone 2a — simple Hückel first (π-only).** Before any overlap
integrals: build the trivial textbook model — S = identity, Hᵣₛ = β on
bonded atoms, α on the diagonal — over the molecule's π system. The
pins are analytic, so a test is a hand-written expectation, not a
borrowed number: ethene λ = ±1, butadiene λ = ±1.618 and ±0.618,
benzene λ = ±2, ±1, ±1 (levels α + λβ). This is exactly what
`~/Code/huckel/` hardcodes — but there is NO oracle to port there:
`diag.py`/`main.py` feed 4×4/2×2 hand-typed matrices to
`np.linalg.eigh` and nothing else (no tests, no parser, no parameters).
Read them once for their Levine-theory comments, then move on.

**Milestone 2b — extended Hückel.** Now add the real machinery: overlap
S (Slater exponents), Hᵢᵢ from VSDIP, Wolfsberg–Helmholz off-diagonals,
and the generalized solver. The pins move to fixtures collected from a
real EH implementation — WebMO v26
(`~/webmo26-inspect/v26/WebMO.install`) computes EH itself and is the
reference for parameter values and the level ordering of small
molecules (ethene, benzene). `avo_ibo/mathematics` stays the reference
for the localization math of Phase 4.

**Effort:** 2a is a day (the solver is the same Jacobi either way; 2a
just skips the parameters). 2b is the rest of the week, most of it the
overlap integrals, which are easy to get subtly wrong — the 2a
analytic pins and WebMO fixtures are the safety net.

---

## Phase 3 — MO energy diagram + click-to-highlight — NOT STARTED (needs Phase 2)

**What the user sees:** the classic level diagram (energies up the
side, α/β arrows for occupancy, filled from the electron count) drawn
in a canvas or SVG panel. Click any level → that MO's lobes light up
over the molecule, with phase colors.

**Why it is cheap (with one honest caveat):** the phase-color
machinery is already there (`pi-systems.ts` distinguishes phases), but
the current renderer orients lobes by hybridization/VSEPR directions,
while an EH MO hands Cartesian px/py/pz coefficients per atom. Phase 3
adds a new mapping: axis-aligned dumbbells (along the molecular x/y/z
axes) scaled and phase-colored by the coefficients — simpler than
hybrid orientation, but it is new mapping code, not pure reuse. This
is the "user-selectable lobes" item that NOTES.md has listed as a
planned future phase. The electron count that fills the levels comes
from the existing formal-charge-aware bookkeeping (hybridize.ts counts
electron domains with charge shifts), so ions fill correctly too.

**Honest label:** "extended Hückel MO (semiempirical)".

**Effort:** a few days once Phase 2 lands.

---

## Phase 4 — Localized orbitals (Pipek–Mezey on the EH MOs) — SHIPPED 2026-09-29

**As shipped** (`src/chem/localized-orbitals/`, the MO panel's Ladder | Localized
toggle; measurements in NOTES.md). Three places where the draft was wrong, all
settled by measurement rather than argument:

- **No IBO, no IAO.** The basis is EH's minimal Slater set and the populations
  are the overlap-weighted Mulliken ones, so the pipeline is PM and only PM —
  as the draft predicted, now with the numbers behind the label.
- **The spike ran in TypeScript, not in `avo_ibo`.** A throwaway script over
  the app's own examples answered 4a's risk question in an afternoon (clean
  local orbitals, no rubbery tails) before any port, so `avo_ibo` stayed the
  reference for the *method*, never a dependency.
- **The degeneracy resolver is a guard, not a workhorse.** It fires on none of
  the seven test molecules: EH's s+p basis never quite produces a pair that is
  both PM-flat and H-coupled. It ships anyway — it is what makes the pairing
  canonical when symmetry does deliver a flat manifold, and a hand-built
  four-orbital case pins it — but the plan's "most of the week on the
  degenerate-set bookkeeping" did not survive contact: the week's real cost was
  the two invariants the topology tests could not catch (the symmetrized cross
  population, and the rotation convention).
- **The valence-virtuals came second, not never.** The draft deferred σ*/π* as
  "rough" with "the teaching need is the occupied picture". They were the first
  thing asked for afterwards, and they are the instructive half: the empty
  block localizes into clean σ* and π*, with the textbook energy ordering
  (ethene's π* far below its σ*), and the list splits into an Occupied and an
  Empty section. Clicking one from each is the hyperconjugation picture.

**The ordering question** (asked directly, and the reason the list is legible):
localized orbitals are not eigenstates, so the list is ordered by *character*
from the Mulliken populations — lone pair, σ, π, delocalized π, then
antibonding — and within a class by ⟨φ|H|φ⟩, the one-electron expectation.
The number is a sort key and is never displayed; the class is the label.

---

## Phase 4 (original draft, kept for the record) — Localized orbitals

**The point:** turn the delocalized EH MOs into the local picture a VB
chemist draws — σ bonds, lone pairs — as oriented hybrid-like lobes.
This works without a wavefunction because localization algorithms need
only the MO coefficients and the overlap matrix, both of which Phase 2
produces.

**What the IBO pipeline actually reduces to here.** Knizia's IAO step
projects a density from a full basis down to a minimal basis and keeps
only the functions the density genuinely needs. Extended Hückel's basis
IS minimal, so that screening has nothing to reject — what remains of
the step is basis orthogonalization. The result is therefore NOT an
IBO in the Knizia sense: it is **Pipek–Mezey localization of the EH
density**, and that is the label it ships under. PM localization of
semiempirical densities is old, documented practice.

**What the EH density gets right — the test suite.** Localization is a
unitary transform: it cannot create physics the density lacks, but it
recovers the bonding structure EH's delocalized MOs hide. The pins are
topological and hand-writable:
- water: 2 O–H σ bond orbitals + 2 lone pairs on O;
- ethane: 1 C–C + 6 C–H;
- benzene: σ framework stays local, the π sextet stays delocalized
  (σ/π separation is PM's strength over Boys).

**What it cannot do — no quantitative claims.** Occupancies are ~2.0
by construction (EH has no electron repulsion to polarize them), and
energies, LMO dipoles and polarities inherit EH's parameter
sensitivity (K, VSDIP). Those get no numbers; labels say "localized EH
orbital (semiempirical)".

**Degenerate sets are the known-hard part.** Ethane's bond sets and
benzene's framework come out as arbitrary mixtures of equivalent
orbitals unless each degenerate set is Fock-diagonalized inside the
localization — avo_ibo already solved exactly this ("bond-flat
degeneracy resolution") and its block diagonalization ports as-is.
Valence-virtual orbitals (Derricotte–Evangelista) are skipped in the
first cut: EH virtuals are rough and the teaching need is the occupied
picture.

**Milestone 4a — the spike, before any TS work.** A weekend script:
compute EH MOs, feed C and S into avo_ibo's existing PM localization
— after confirming how separable its localization code is from its
Psi4 front-end — and LOOK at water, ethane, acetone, benzene. The risk
was never the linear algebra; it is whether EH's delocalized MOs give
clean local orbitals or rubbery tails. Twenty lines of glue answers
that in an afternoon, before Phase 4 costs anything.

**Milestone 4b — the TS port.** PM localization, Mulliken atomic
weights from the EH overlap, degenerate-set Fock diagonalization, then
render the LMOs as oriented hybrid-like lobes with phases (the
existing lobe renderer). Pins: the topology tests above.

**Effort:** 4a is a weekend. 4b is a week, most of it the
degenerate-set bookkeeping, which `avo_ibo` has already solved once.

---

## Phase 5 — JANPA / CLPO — PARKED

JANPA's CLPOs need a real wavefunction (an ORCA SCF). A static page
cannot produce one, so this does not move into Valence — the ORCA-side
tooling stays outside the app. Nothing lost: Phase 4 covers the
teaching need with honest semiempirical labels.

---

## What your ~/Code already contributes

| Repo | Where | Role in this plan |
|---|---|---|
| `huckel/` | local | a toy, not an oracle: `diag.py`/`main.py` are hand-typed 4×4/2×2 simple-Hückel matrices through `np.linalg.eigh`, no tests, no parameters. Its textbook values match the Milestone 2a pins; nothing general to port |
| `avo_ibo/` | local | IAO/PM machinery + full math derivations — reference for Phase 4 |
| WebMO v26 source | lenovo: `~/webmo26-inspect/v26/WebMO.install` | WebMO's **built-in** extended-Hückel calculator and renderer (it computes EH itself, no external call) — the parameter and rendering reference for Phases 2–3 |

## Order of work and dependencies

```
Phase 1 (ESP)       ← SHIPPED 2026-09-28
Phase 2 (EH solver) ← SHIPPED 2026-09-29 (s+p basis)
Phase 3 (diagram)   ← SHIPPED 2026-09-29
Phase 4 (localize)  ← SHIPPED 2026-09-29 (occupied space)
Phase 5 (JANPA)     ← parked
```

Open follow-ups, in the order they would pay off:

1. **Transition-metal basis — SHIPPED 2026-09-30.** 25 d-block elements with
   s+p+contracted-d from the shipped Alvarez table, plus Zn and Cd as a
   deliberate s+p exception (their d¹⁰ shell is core-like and the table has no
   d for them), refused for the three that carry a placeholder instead (Y, Ag,
   Hf). Validated against bind on ferrocene — overlaps to the 4-decimal floor,
   the occupied ladder to 0.0007 eV, and the eigenvectors to 0.005 over all 59
   orbitals (NOTES.md). What remains here is breadth, not machinery: a metal
   complex has to arrive as an example or from PubChem, since MMFF94 cannot
   build one.
2. **A multiplicity the sketch cannot carry.** A MOL block has no field for
   spin, so an example whose reference calculation was open-shell says so itself
   (`Example.multiplicity`) and the Hückel layer then refuses to fill the
   orbitals. NiCl4(2-) is the case: the tetrahedral d8 complex ORCA optimised as
   charge −2, MULTIPLICITY 3, and its 40 electrons are even — the count alone
   would have drawn the singlet it is not. Found while adding it: **the app's
   default hides the atom layer** (`Atoms & Bonds` off, orbital lobes on, from
   commit 1b54612), which is invisible for an organic molecule — the lobes trace
   the skeleton — but leaves a metal complex showing bare element labels, since
   the valence model has no lobes to draw there. Examples containing an element
   outside the valence model now turn the molecule layer on as they load; the
   global default is still the old one, and worth a decision.
3. **The localized-orbital classes are avo_ibo's** — lifted, thresholds and
   names both, with diborane in as the `2e3c` case the rule exists for. Where
   our labels still differ from theirs on a metal complex, the *orbitals* differ
   too (EH+PM puts more density on the iron than SCF+IAO+PM) — NOTES.md has the
   numbers rather than a claim of agreement.
3. **Valence-virtual localization — SHIPPED** (milestone 4c), including the
   finding that the IAO/VVO screening step is a no-op on a minimal basis.
4. **Oriented lobes for the localized picture** — the current draw reuses the
   MO pictures (per-AO dumbbells, or the isosurface). One lobe per localized
   orbital along its own axis is the nicer picture and the only part of
   Milestone 4b's draft still outstanding.
5. **The VSEPR picture on a 3c-2e bridge** — a bridging hydrogen has two
   neighbours and reads `sp`, and diborane's boron reads sp³ with the eight-bond
   drawing. Neither is wrong so much as unmodelled: the electron-domain picture
   has no vocabulary for a three-centre bond, which is exactly why the
   localized-orbital list does.
6. **Ethane and acetone as examples** — the pin set from this phase runs on
   water, ethene, benzene and N₂ because those are what `EXAMPLES` has; the
   two molecules the draft named would need examples of their own.
7. **The second-row hybrid.** SF₆ and PCl₅ run Alvarez s/p against ICON8 d.
   Fine as long as it is said out loud — which it is (parameters.ts, the
   panel's model line, the copied MO data, NOTES.md). A "full ICON8 for Si–Cl"
   variant would remove the mixture, and the numbers are in hand if anyone
   wants it.

## House rules that apply to every phase

- No new dependencies. A hand-rolled Jacobi solver is fine at these
  sizes and is the constitution in action.
- Honest labels, always: "charge model", "semiempirical", "extended
  Hückel" — never language that implies ab initio quality.
- Degrade loudly: unrecognized elements → no surface, no MOs, with a
  warning — never a silently wrong value.
- Every phase ships with a test that pins a value a chemist knows
  (water ESP, benzene's Hückel levels, ethane's levels and
  localization) so a regression reads as a number, not a vibe.
