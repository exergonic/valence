  # Valence Bond Visualization Web App
Bridging molecular geometry with qualitative chemical intuition. **web-vbvis** is a single page, Three.Js web application designed to algorithmically determine and visualize valence bond orbitals (hybridization, localized lone pairs, and orbital overlap lobes) typically taught in undergraduate general and organic chemistry courses.

## 🎯 Scope & Intent

This plugin is designed for **educational and qualitative visualization** using VSEPR rules and geometric algorithms to render textbook-style hybrid ($sp$, $sp^2$, $sp^3$) and unhybridized ($p$) orbitals.

| What It Is                                                   | What It Is NOT                                               |
| :----------------------------------------------------------- | :----------------------------------------------------------- |
| 📐 **Geometric & Algorithmic:** Infers orbital orientations from local coordination numbers and atomic positions. | 🧮 **Quantum Mechanical:** Does *not* perform ab initio Valence Bond (VB) wavefunction or resonance calculations. |
| 📚 **Pedagogical:** Ideal for illustrating undergraduate general/organic chemistry bonding concepts. | 🔬 **Electronic Structure Tool:** Does *not* compute molecular orbitals (MOs) or electron density matrices. |


## 🧪 The Vision

While standard computational chemistry software excels at calculating highly delocalized Molecular Orbitals (MOs) via quantum mechanics, students and researchers often reason using the localized framework of **Valence Bond (VB) Theory** and **VSEPR**.

This plugin aims to:

* Automatically analyze local coordination environments of central atoms.
* Determine hybridization states ($sp$, $sp^2$, $sp^3$, $sp^3d$, etc.) based on geometric configurations.
* Direct and render 3D geometric meshes representing localized bonding pairs and lone pair lobes directly in the web page.

---

## 🛠️ Architecture & Tech Stack

| Layer                 | Choice                                                       | Why                                                          |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Build tool            | **Vite**                                                     | Instant HMR, zero-config TS/ESM, trivial static build for GitHub Pages or SDF |
| Language              | **TypeScript**                                               | TS catches the vector-math mistakes that are easy to make and annoying to debug visually |
| Rendering             | **Three.js** (vanilla, not react-three-fiber)                | For a single scene with a control panel, react-three-fiber adds a reconciler layer you don't need. Plain Three.js keeps the mental model close to what you'd get from a Python/VTK-style scene graph |
| Molecule input        | JSME                                                         | It's a self-contained JS applet-turned-widget with no framework dependency — drop the JSME `.js`/`.nocache.js` files in, mount it into a `<div>`, and call `jsmeApplet.molFile()` to pull the MOL block on a "render" button click. Keep it in its own panel, separate from the Three.js canvas — no need to try to unify their rendering. |
| MOL parsing           | --                                                           | don't reach for a cheminformatics library — the MOL block's atom block and bond block are fixed-width text you can parse in ~40 lines. You already control the output side (Three.js/hybridization engine), so you only need the subset of the MOL spec JSME actually emits. |
| Orbital lobe geometry | `THREE.LatheGeometry` or a small custom `ParametricGeometry` | p-orbital dumbbells and sp³ teardrop lobes are both surfaces of revolution — Lathe is the cheapest way to get that shape without hand-rolling vertex buffers |
| UI controls           | **lil-gui**                                                  | Toggling hybridization states, orbital visibility, bond overlap display — lil-gui is ~5KB and needs no framework |
| Testing               | **Vitest**                                                   | Pairs natively with Vite; unit-test the hybridization-assignment logic independently of Three.js rendering |
| Hosting               | Static — SDF.org (you already host WebGL demos there) or GitHub Pages |                                                              |

## 💪Pipeline

JSME (2D sketch) 
  → MOL block export 
  → parse atoms/bonds (trivial format, no library needed) 
  → your hybridization engine assigns local geometry per atom 
  → graph-walk 3D embedder places coordinates using those vectors 
  → Three.js renders atoms, bonds, and orbital lobes
