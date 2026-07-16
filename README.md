# Valence Bond Visualization

**Valence** is an interactive 3D molecular orbital viewer that algorithmically classifies hybridization, orients lone pairs, and renders valence bond orbitals (σ lobes, π lobes, p atomic orbitals) from drawn or example molecules.

![Valence displaying furane](./doc/demo.png)

<img src="./doc/water.png" alt="water" style="zoom:25%;" /><img src="./doc/ethyne.png" alt="ethyne" style="zoom:30%;" />

## Capabilities

- **Hybridization engine** assigns sp/sp²/sp³ from measured bond angles, with geometry-derived conjugation detection (furan O, aniline N, amide N) and lone-pair correction for sp²-measured oxygen that is truly sp³ (e.g., H₂SO₄)
- **3D embedding** via PubChem PUG REST (MMFF94-optimized), RDKit.js ETKDG fallback (client-side WASM), or graph-walk embedder + torsion optimizer
- **Orbital rendering** with THREE.js — LatheGeometry lobes for σ, π, p, and lone pair orbitals
- **p-AO directionality** — all π system p orbitals are oriented perpendicular to the σ plane, with automated parallel alignment across conjugated networks
- **Export** 2× PNG snapshots of the current view

## Platforms

| Platform | Distribution |
|----------|-------------|
| 🌐 **Web** | [GitHub Pages](https://exergonic.github.io/valence) — no install required |
| 🪟 **Windows** | MSI installer via [Releases](https://github.com/exergonic/valence/releases) (Tauri v2) |

The desktop build is a self-contained webview wrapper — same render pipeline, no server, no telemetry.

## Pipeline

```
JSME (MOL block) → parse atoms/bonds → hybridization engine → 3D embedder → torsion optimizer → Three.js renderer
```

1. Draw a molecule in the JSME panel (or pick an example)
2. Try PubChem PUG REST for MMFF94-optimized 3D coordinates
3. If that fails, try RDKit.js ETKDG + MMFF94 (client-side WASM, ~7 MB)
4. If both fail, use the graph-walk embedder + torsion optimizer
5. Add implicit hydrogens (fallback path only)
6. Classify hybridization, orient orbitals, render in Three.js

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, draw a molecule, and click **Render Molecule**.

### Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build (web) | `npm run build` |
| Preview build | `npm run preview` |
| Tests | `npm test` |
| Test watch | `npm run test:watch` |
| Desktop dev | `npm run tauri:dev` |
| Desktop build | `npm run tauri:build` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |

## Architecture

- **Vite** + **TypeScript** — frontend build
- **Three.js** — 3D scene graph (vanilla, no React)
- **lil-gui** — debug/toggle controls
- **JSME** — molecule sketcher (mounted in its own panel)
- **Tauri v2** — desktop wrapper for Windows

### Key modules

| Module | Purpose |
|--------|---------|
| `src/mol-parser/` | Fixed-width MOL block parser (~40 lines, no cheminformatics lib) |
| `src/hydrogens/` | Adds missing hydrogens when PubChem 3D unavailable (4 − bondOrderSum) |
| `src/hybridization/` | Assigns hybridization from measured bond angles, not connectivity count |
| `src/embedder/` | Graph-walk 3D coordinate placement using hybridization vectors |
| `src/embedder/torsions.ts` | Torsion optimizer for staggered alkane conformations |
| `src/services/resolve3d.ts` | Fetches MMFF94-optimized 3D coords from PubChem PUG REST API |
| `src/scene/` | Three.js scene, atom/bond/orbital rendering |
| `src/orbitals/` | LatheGeometry for sp, sp², sp³ lobes |

## Scope

| What It Is | What It Is NOT |
|---|---|
| 📐 **Geometric & algorithmic:** Infers orbital orientations from local coordination numbers and atomic positions | 🧮 **Quantum mechanical:** Does *not* perform ab initio VB wavefunction or resonance calculations |
| 📚 **Pedagogical:** Ideal for illustrating undergraduate general/organic chemistry bonding concepts | 🔬 **Electronic structure tool:** Does *not* compute MOs or electron density matrices |

## Citation

> Valence v0.5.0 — Valence Bond Visualization (2026).
> McCann, B. W. https://github.com/exergonic/valence
