// The themes' typefaces, bundled rather than fetched, so the app works offline
// in a classroom; a browser downloads only the faces the active theme uses.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import type { SceneContext } from './render';
import { initScene, buildScene, ATOM_LAYER } from './render';
import { mountJsmePanel, toggleJsmeCollapsed, setJsmeCollapsed, snapToSymmetry, showInfoLog } from './ui/jsme-panel';
import { setupControls } from './ui/controls';
import { setupTooltip } from './ui/tooltip';
import { setupContextMenu } from './ui/context-menu';
import { setupMoPanel } from './ui/mo-diagram';
import { setupModelViews } from './ui/model-views';
import { setupAnnotations } from './ui/annotations';
import { saveViewToFile, loadViewFromFile, buildShareLink, parseShareLink, applyViewState } from './ui/view-state';
import { parseMolBlock } from './mol-parser';
import { EXAMPLES } from './ui/examples';
import { isVseprElement } from './chem/vsepr/assign-orbitals';
import { preloadGfn2 } from './geometry/gfn2-refine';
import { setupTheme } from './ui/theme';
import { setupSketcherToolbar } from './ui/sketcher-toolbar';

function setupSplitter() {
  const splitter = document.getElementById('splitter')!;
  const jsmePanel = document.getElementById('jsme-panel')!;
  let dragging = false;

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.classList.add('active');
    // A drag starts from a visible panel — undock the sketcher first.
    if (jsmePanel.classList.contains('collapsed')) setJsmeCollapsed(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  });

  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const w = Math.max(280, Math.min(e.clientX, window.innerWidth - 200));
    jsmePanel.style.width = w + 'px';
    window.dispatchEvent(new Event('resize'));
    if (window.jsmeApplet) window.jsmeApplet.repaint();
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    splitter.classList.remove('active');
    if (window.jsmeApplet) {
      setTimeout(() => window.jsmeApplet.repaint(), 50);
    }
  });
}

function loadMolecule(ctx: SceneContext, molBlock: string, multiplicity = 1): string[] {
  const parsed = parseMolBlock(molBlock);
  if (parsed.atoms.length === 0) return [];
  // An example is snapped like any rendered structure: its stored coordinates
  // are a little off their point group (benzene's by 0.1 mÅ), which is enough
  // to split a degenerate pair by 0.1 meV — and a split pair is two levels the
  // solver will not rotate into the textbook partners or label as one E set.
  const snapped = snapToSymmetry(parsed);
  // the MOL block cannot carry a multiplicity, so a caller that knows one sets
  // it here (see Example.multiplicity)
  ctx.currentMolecule = multiplicity > 1 ? { ...snapped.molecule, multiplicity } : snapped.molecule;
  buildScene(ctx);
  return snapped.info;
}

function setupExamples(ctx: SceneContext) {
  const dropdown = document.getElementById('examples-dropdown') as HTMLSelectElement;

  // Populate from EXAMPLES array — single source of truth
  for (let i = 0; i < EXAMPLES.length; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = EXAMPLES[i].name;
    dropdown.appendChild(opt);
  }

  dropdown.addEventListener('change', () => {
    const idx = parseInt(dropdown.value);
    if (isNaN(idx)) return;
    const ex = EXAMPLES[idx];
    if (!ex) return;

    const notes = loadMolecule(ctx, ex.mol, ex.multiplicity ?? 1);
    showInfoLog(ex.note ? [ex.note, ...notes] : notes);

    // The valence model has nothing to say about a metal centre, so a complex
    // drawn from it has no orbital lobes to show — and the app's default hides
    // the atom layer in favour of those lobes, which would leave an example
    // like NiCl4(2-) opening to bare element labels. Show the molecule.
    const parsed = parseMolBlock(ex.mol);
    if (parsed.atoms.some((a) => !isVseprElement(a.element))) {
      const toggle = document.getElementById('ctrl-show-mol') as HTMLInputElement | null;
      if (toggle && !toggle.checked) {
        toggle.checked = true;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Populate the molecule info header for examples
    const molecule = parseMolBlock(ex.mol);
    const counts: Record<string, number> = {};
    for (const a of molecule.atoms) counts[a.element] = (counts[a.element] || 0) + 1;
    const rest = Object.keys(counts).filter((e) => e !== 'C' && e !== 'H').sort();
    let formula = '';
    if (counts['C']) formula += `C${counts['C'] > 1 ? counts['C'] : ''}`;
    if (counts['H']) formula += `H${counts['H'] > 1 ? counts['H'] : ''}`;
    for (const el of rest) formula += `${el}${counts[el] > 1 ? counts[el] : ''}`;

    const container = document.getElementById('molecule-info')!;
    container.classList.remove('hidden');
    document.getElementById('mol-formula')!.textContent = formula;
    document.getElementById('mol-name')!.textContent = ` · ${ex.name}`;
    document.getElementById('mol-weight')!.textContent = '';
    const sourceEl = document.getElementById('mol-source')!;
    sourceEl.textContent = 'Example';
    sourceEl.className = 'pubchem';
    document.getElementById('mol-link')!.style.display = 'none';
    document.getElementById('mol-warnings')!.classList.add('hidden');
    // Examples are loaded from disk, not PubChem — no record to show.
    document.getElementById('mol-data')!.classList.add('hidden');

    // Reset to the placeholder so the dropdown never reads as the molecule's
    // permanent label and the same example can be picked again.
    dropdown.value = '';
  });
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't capture when typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'Enter') {
      // Trigger render
      document.getElementById('render-btn')?.click();
    } else if (e.key === 'r' || e.key === 'R') {
      // Reset view
      document.getElementById('reset-view-btn')?.click();
    } else if (e.key === 'o' || e.key === 'O') {
      // Fold/unfold the model panel on the right
      const folded = document.getElementById('inspector')?.classList.contains('collapsed');
      document.getElementById(folded ? 'inspector-rail' : 'inspector-collapse')?.click();
    } else if (e.key === 'b' || e.key === 'B') {
      // Dock/undock the sketcher panel
      toggleJsmeCollapsed();
    } else if (e.key === 'Escape') {
      // Close any open dialogs
      document.getElementById('cite-dialog')?.classList.add('hidden');
      document.getElementById('help-dialog')?.classList.add('hidden');
      if (!document.getElementById('settings-drawer')?.classList.contains('hidden')) {
        document.getElementById('settings-close')?.click();
      }
    } else if (e.key >= '1' && e.key <= '9') {
      // Jump to example by number
      const idx = parseInt(e.key) - 1;
      // through the dropdown, so a shortcut loads an example exactly as a pick
      // does — header, multiplicity, snap and all
      const dropdown = document.getElementById('examples-dropdown') as HTMLSelectElement | null;
      if (dropdown && idx < EXAMPLES.length) {
        dropdown.value = String(idx);
        dropdown.dispatchEvent(new Event('change'));
      }
    }
  });
}

function setupMeasureMode(ctx: SceneContext) {
  const raycaster = new THREE.Raycaster();
  // Atom meshes of the lit styles sit on the atom layer; picking must see them.
  raycaster.layers.enable(ATOM_LAYER);
  const mouse = new THREE.Vector2();
  const container = document.getElementById('canvas-container')!;

  container.addEventListener('click', (e) => {
    const measureState = (ctx as any)._measureState;
    if (!measureState?.mode) return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, ctx.camera);

    // Collect all meshes from molecule and orbital groups
    const objects: THREE.Object3D[] = [];
    ctx.moleculeGroup.children.forEach((c) => objects.push(c));
    ctx.orbitalGroup.children.forEach((c) => objects.push(c));

    const hits = raycaster.intersectObjects(objects, true);
    if (hits.length > 0) {
      const hit = hits[0].object;
      const atomIndex = hit.userData?.atomIndex;
      if (atomIndex !== undefined) {
        measureState.addPoint(atomIndex);
      }
    }
  });
}

function setupViewStateUI(ctx: SceneContext, annotations: ReturnType<typeof setupAnnotations>) {
  const saveBtn = document.getElementById('ctrl-save-view')!;
  saveBtn.addEventListener('click', () => {
    if (!ctx.currentMolecule) return;
    saveViewToFile(ctx, annotations.getAnnotations());
  });

  const loadBtn = document.getElementById('ctrl-load-view')!;
  const fileInput = document.getElementById('ctrl-load-view-input') as HTMLInputElement;
  loadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      await loadViewFromFile(ctx, file, annotations);
    } catch (err) {
      console.error('Failed to load view:', err);
    } finally {
      fileInput.value = '';
    }
  });

  const shareBtn = document.getElementById('ctrl-share-link')!;
  const shareFeedback = document.getElementById('share-feedback')!;
  shareBtn.addEventListener('click', async () => {
    if (!ctx.currentMolecule) return;
    const link = buildShareLink(ctx, annotations.getAnnotations());
    await navigator.clipboard.writeText(link);
    shareFeedback.classList.remove('hidden');
    setTimeout(() => shareFeedback.classList.add('hidden'), 2000);
  });
}

function setupAnnotationsUI(annotations: ReturnType<typeof setupAnnotations>) {
  const addBtn = document.getElementById('ctrl-add-annotation')!;
  addBtn.addEventListener('click', () => annotations.add(50, 40));
  const clearBtn = document.getElementById('ctrl-clear-annotations')!;
  clearBtn.addEventListener('click', () => annotations.clear());
}

// Need THREE for raycaster
import * as THREE from 'three';

async function main() {
  const scene = initScene(document.getElementById('canvas-container')!);
  const annotations = setupAnnotations(document.getElementById('canvas-container')!);
  mountJsmePanel(scene);
  setupControls(scene);
  // after the controls: a theme sets the scene background through their Background input
  setupTheme(scene);
  setupSplitter();
  setupExamples(scene);
  setupTooltip(
    document.getElementById('canvas-container')!,
    scene.camera,
    scene.orbitalGroup,
  );
  setupContextMenu(scene, document.getElementById('canvas-container')!);
  setupSketcherToolbar();
  const moPanel = setupMoPanel(scene);
  setupModelViews(scene, moPanel);
  setupKeyboardShortcuts();
  setupMeasureMode(scene);
  setupViewStateUI(scene, annotations);
  setupAnnotationsUI(annotations);

  // The GFN2-xTB engine streams in while the user draws, so the first
  // optimisation does not wait on a download. After the page's own load, so
  // it does not compete with the sketcher's assets.
  if (document.readyState === 'complete') preloadGfn2();
  else window.addEventListener('load', () => preloadGfn2(), { once: true });

  // Restore a shared view from the URL hash, if present (#view=<base64url>)
  const state = parseShareLink(window.location.hash);
  if (state) {
    try {
      applyViewState(scene, state, annotations);
    } catch (err) {
      console.error('Failed to restore shared view:', err);
    }
  }
}

main();
