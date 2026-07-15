# Valence Bond Visualization

A single-page web app for visualizing valence bond orbitals (σ, π, lone pairs) in 3D — built for undergraduate organic chemistry education.

Draw a molecule in JSME, click **Render Molecule**, and toggle between a ball-and-stick view and an orbital view showing hybrid σ lobes, p-π lobes, and 1s hydrogen orbitals.

---

## Pipeline

```
JSME (2D sketch) → SMILES → PubChem PUG REST (MMFF94 3D coords)
                                                  ↕ fallback
                                  graph-walk embedder + torsion optimizer
                                       → add implicit hydrogens
                                       → Three.js (atoms, bonds, orbitals)
```

| Step | What it does |
|------|-------------|
| **JSME** | 2D molecule sketcher (npm: `jsme-editor`) |
| **PubChem fetch** | Requests MMFF94-optimized 3D coordinates via PUG REST API; falls back to a graph-walk embedder with tetrahedral/trigonal/linear geometry |
| **Torsion optimizer** | Rotates sp³–sp³ single bonds to staggered (60°/180°/300°) conformations |
| **Implicit H's** | Adds hydrogens to carbons to satisfy tetravalency (4 − sum of bond orders) |
| **Orbital renderer** | σ teardrop lobes per bond, p-π lobes orthogonal to the σ framework, 1s spheres on hydrogen |

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Build | **Vite** + **TypeScript** | Fast HMR, static deploy |
| 3D | **Three.js** (vanilla) | Scene graph, LatheGeometry for orbital lobes |
| Input | **JSME** (npm) | GWT-based molecule editor, no framework dep |
| Controls | **lil-gui** | ~5 KB, zero framework |
| Testing | **Vitest** | Native Vite integration |

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
| Build | `npm run build` |
| Preview build | `npm run preview` |
| Run tests | `npm test` |
| Typecheck | `npx tsc --noEmit` |

## Project Layout

```
src/
├── main.ts                 # entry: JSME + Three.js scene
├── mol-parser/             # V2000 MOL block parser
├── hydrogens/              # implicit hydrogen addition
├── hybridization/          # steric number → sp/sp²/sp³
├── embedder/
│   ├── place3d.ts          # graph-walk 3D placement
│   └── torsions.ts         # staggered alkane optimizer
├── services/
│   └── resolve3d.ts        # PubChem PUG REST client
├── scene/
│   ├── setup.ts            # camera, lights, render loop
│   ├── atoms.ts            # atom sphere rendering
│   ├── bonds.ts            # bond cylinder rendering
│   └── orbitals.ts         # σ/π/1s orbital placement
├── orbitals/
│   ├── lathe.ts            # LatheGeometry profiles
│   └── orbital.ts          # lobe mesh builder
└── ui/
    ├── gui.ts              # lil-gui controls
    └── jsme-panel.ts       # JSME mount + render pipeline
```

## Why Not…

- **Quantum chemistry?** This is geometric/pedagogical, not ab initio.
- **A cheminformatics library?** JSME's MOL output is simple enough to parse in ~40 lines.
- **React/React-Three-Fiber?** A single scene with a control panel doesn't need a reconciler.
