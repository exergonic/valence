# AGENTS.md

## Stack
- **Vite** + **TypeScript** — `npm run dev`, `npm run build`, `npm run preview`
- **Three.js** (vanilla, no React) — scene graph in `src/scene/`
- **Vitest** — `npm test`, `npm run test:watch`
- **lil-gui** — debug/toggle controls
- **JSME** — molecule sketcher, mounted in its own panel (not inside Three.js)

## Architecture pipeline
```
JSME (MOL block) → parse atoms/bonds → hybridization engine → 3D embedder → Three.js renderer
```

## Key modules
- `src/mol-parser/` — fixed-width MOL block parser (~40 lines, no cheminformatics lib)
- `src/hybridization/` — assigns local geometry per atom from coordination number
- `src/embedder/` — graph-walk 3D coordinate placement using hybridization vectors
- `src/scene/` — Three.js scene, atom/bond/orbital rendering
- `src/orbitals/` — LatheGeometry for p, sp, sp², sp³ lobes
- `src/ui/` — lil-gui controls, JSME panel wiring

## JSME integration
- **Package:** `jsme-editor` (npm) — no manual file management
- **Loading:** Script tag in `index.html` loads `jsme.nocache.js` from `node_modules`
- **Build:** Vite plugin copies JSME files to `dist/jsme/` for production
- **Usage:** Access via `window.JSME` global after script loads

## Conventions
- No cheminformatics libraries — MOL parsing is hand-rolled from JSME's output format
- Orbital lobes are surfaces of revolution → use `THREE.LatheGeometry`
- Unit-test hybridization logic independently of Three.js (pure functions)
- Static deploy target (GitHub Pages / SDF.org) — no server-side code

## Commands
| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Build | `npm run build` |
| Test | `npm test` |
| Test watch | `npm run test:watch` |
| Lint | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |
