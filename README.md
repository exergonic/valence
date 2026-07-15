# Valence Bond Visualization

Bridging molecular geometry with qualitative chemical intuition. **web-vbvis** is a single page web application designed to algorithmically determine and visualize valence bond orbitals (hybridization, localized lone pairs, and orbital overlap lobes) typically taught in undergraduate general and organic chemistry courses.

Draw a molecule in JSME, click **Render Molecule**, and toggle between a ball-and-stick view and an orbital view showing hybrid σ lobes, π lobes, and 1s hydrogen orbitals.

## 🎯 Scope & Intent

This webapp is designed for **educational and qualitative visualization** using VSEPR rules and geometric algorithms to render textbook-style hybrid (sp, sp2, sp3) and unhybridized (p) orbitals.

| What It Is                                                   | What It Is NOT                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| 📐 **Geometric & Algorithmic:** Infers orbital orientations from local coordination numbers and atomic positions. | 🧮 **Quantum Mechanical:** Does *not* perform ab initio Valence Bond (VB) wavefunction or resonance calculations. |
| 📚 **Pedagogical:** Ideal for illustrating undergraduate general/organic chemistry bonding concepts. | 🔬 **Electronic Structure Tool:** Does *not* compute molecular orbitals (MOs) or electron density matrices. |

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, draw a molecule, and click **Render Molecule**.

