VALENCE

Bugs and Improvements:

Visualization (improvement)
 - [x] "stick" display
 - [x] "clean" 2D structure
 - [x] lasso/select 2D structure for moving atoms (Move tool: one atom at a time — JSME has no lasso; Shift-drag on empty space rotates)
 - [x] way to "lock" Lewis structure orbital selection so that energy values don't "dance around"
 - [x] hovering tooltips different on each view (VSEPR hybrid; ESP in kcal/mol; localized: NBO hybrid spˣ + E(2) to the anchor; delocalized: the lobe's atom by s/p/d, and phase)
 - [ ] "data" view
 - [x] add more thermochemical values: free energy, entropy, etc.
 - [x] LABELS = "Element+ID" for C6/O1/H11 etc
 - [x] view molecules along another axis. (done as the default view: broad face on, longest extent across)
 - [x] need an XYZ axis legend in the view. 
 - [x] Lewis structure to the left of Pipek-Mezey. 
 - [ ] Need visual demarcation between "Strongest Donations" and localized orbital list in "Lewis structure" view of Localized Orbitals viewport. 
 
Bug  
 - [x] "Pipek-Mezey" and "Lewis Structure" lables still show up under "Delocalized Orbitals" view
 - [x] Bare Lithium yielded: "Unoptimised structure — GFN2-xTB could not treat this structure ([object Object])"
		- [x] let's detect monoatomic metals and simply not try to optimize them (any single atom: no lookup, no optimiser; the single point gives every view its charge, spin and orbitals)
		- [x] and why is "[object Object]" printed? Let's hide that. (the engine's C++ exception, stringified; errors are now described in words)

Other?
 - [x] NaOH: several issues. Am I forgetting an issue with ionics? 
	* [x] ESP surface doesn't cover the Na. (GFN2's density is valence-only; the surface now adds free-atom core densities, ORCA X2C atoms Li–Rn)
	* [x] should H-O-Na angle be linear? (yes; GFN2 bends it, 155°, flat bend — a known limitation now; GFN1 and experiment linear)
	* [x] explicit bond between Na and O giving poor bonding picture? (a bond to an alkali metal is now ionic: O is hydroxide, AXE₃)
		* [x] VSEPR sp3 lone pair on oxygen very wrong angle.
		* [x] localized orbitals: Na's empties now Na1(LP*); Lewis structure takes alkali metals (O LP → Na 3s E(2) 29.0, 16.3 kcal/mol)
- [ ] XYZ exports ought to have charge and multiplicity in the comment line. 
- [x] What to do about bonds *forming* on optimization. (same as breaking: the held structure shown, GFN2's free result behind the button, its new contacts dashed — 2026-10-24)
- [ ] Test the partial-bond cut (Wiberg 0.1) on more halonium ions near the line: other α-methylstyrene / stilbene / 4-methoxystyrene bromonium ions, chloronium and iodonium analogues — each against the xtb oracle on lenovo. So far: 2-phenylbut-2-ene 0.20 (partial), 1,1-diphenylethylene 0.085 (came apart). And the 1,3 ring-closure cut (Wiberg 0.75): diborane's B···B 0.55 (not a new bond), the 2-bromoethyl cation's C2···Br 0.86 (closed) — try cyclopropylcarbinyl and 2-norbornyl cations, chloronium/iodonium closures.
- [x] Geminal diphenyls: the embedder's start breaks the rings apart (1,1-diphenylethane, 1,1-diphenylethylene bromonium). (ring H's outward from their own ring; a ring on a single bond turned out of a clash)
- [x] 1,1-diphenylethylene bromonium stops at 2.64 Å (reads "partial") instead of xtb's open ion at 2.75 Å. (Engine rebuilt on OCC 5644eaf — exact gradient; the real cause was Berny's false convergence, now caught by a Cartesian gradient gate at every size)
- [ ] Move the OCC pin from 5644eaf to the v0.9.6 tag once it is released.
- [ ] `occ` is 0.9.6? `Bump version to 0.9.6` on a commit message.
- [x] A way past the 30 s budget: "Keep optimising" in the header when a run stops short (2026-10-24).
