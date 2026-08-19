import * as THREE from 'three';
import type { SceneContext, ColorScheme } from '../render';
import { hexToHsv, COLOR_PRESETS } from '../render/color-schemes';
import { kekulizeSmiles } from '../chem/kekulize-smiles';

export function setupControls(ctx: SceneContext) {
  const panel = document.getElementById('controls-panel')!;
  let rafScheduled = false;
  const rerender = () => {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      ctx.rerender();
    });
  };

  // ── Tab switching ──
  const tabBtns = panel.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const tabContents = panel.querySelectorAll<HTMLElement>('.tab-content');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab!;
      panel.querySelector(`#tab-${tab}`)!.classList.add('active');
    });
  });

  // ── Build tab ──

  // Show Atoms & Bonds
  const molToggle = panel.querySelector<HTMLInputElement>('#ctrl-show-mol')!;
  ctx.moleculeGroup.visible = molToggle.checked;
  molToggle.addEventListener('change', () => {
    ctx.moleculeGroup.visible = molToggle.checked;
  });

  // Show Orbitals
  const orbToggle = panel.querySelector<HTMLInputElement>('#ctrl-show-orb')!;
  orbToggle.addEventListener('change', () => {
    ctx.orbitalGroup.visible = orbToggle.checked;
  });

  // Labels dropdown — one control for all label modes
  const labelModeSelect = panel.querySelector<HTMLSelectElement>('#ctrl-label-mode')!;
  labelModeSelect.addEventListener('change', () => {
    ctx.display.labelMode = labelModeSelect.value as 'atom' | 'orbital' | 'hybrid' | 'off';
    ctx.rerender();
  });

  // Atom Scale — drives the ball-and-stick spheres and the bond cylinders.
  // Orbital lobes intentionally do NOT scale here: their size is the
  // covalent radius (orbits.ts atomScale = getCovalentRadius + 0.2),
  // which sets the lobe length so lobes overlap bonds at the right
  // atomic centers. Making them track this slider would decouple the
  // lobes from the bond endpoints.
  const atomScale = panel.querySelector<HTMLInputElement>('#ctrl-atom-scale')!;
  atomScale.addEventListener('input', () => {
    ctx.display.atomScale = parseFloat(atomScale.value);
    rerender();
  });

  // Bond Scale — drives only the cylinders; atoms and lobes are independent.
  const bondScale = panel.querySelector<HTMLInputElement>('#ctrl-bond-scale')!;
  bondScale.addEventListener('input', () => {
    ctx.display.bondScale = parseFloat(bondScale.value);
    rerender();
  });

  // Force local lookup
  const forceLocal = panel.querySelector<HTMLInputElement>('#ctrl-force-fallback')!;
  forceLocal.addEventListener('change', () => {
    // The render button reads this on click; no immediate action needed.
  });

  // Space-filling toggle
  const spaceFillingToggle = panel.querySelector<HTMLInputElement>('#ctrl-space-filling')!;
  spaceFillingToggle.addEventListener('change', () => {
    ctx.display.spaceFilling = spaceFillingToggle.checked;
    ctx.rerender();
  });

  // Auto-rotate toggle
  const autoRotateToggle = panel.querySelector<HTMLInputElement>('#ctrl-auto-rotate')!;
  autoRotateToggle.addEventListener('change', () => {
    ctx.setAutoRotate(autoRotateToggle.checked);
  });

  // π system highlighting toggle
  const highlightPiToggle = panel.querySelector<HTMLInputElement>('#ctrl-highlight-pi')!;
  highlightPiToggle.addEventListener('change', () => {
    ctx.display.highlightPiSystems = highlightPiToggle.checked;
    ctx.rerender();
  });

  // ── Style tab ──

  // Pedagogical view presets (All / σ-only / π-only / LP-only)
  const viewPresetBtns = panel.querySelectorAll<HTMLButtonElement>('.view-preset-btn');
  viewPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ctx.display.viewPreset = btn.dataset.preset as 'all' | 'sigma-only' | 'pi-only' | 'lone-pairs-only';
      ctx.rerender();
    });
  });

  // Orbital Presets (only .preset-btn, not .bg-btn)
  const presetBtns = panel.querySelectorAll<HTMLButtonElement>('.preset-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ctx.display.orbitalPreset = btn.dataset.preset as 'glass' | 'glossy' | 'matte' | 'metallic';
      rerender();
    });
  });

  // Background presets
  const bgBtns = panel.querySelectorAll<HTMLButtonElement>('.bg-btn')!;
  const bgCustom = panel.querySelector<HTMLInputElement>('#ctrl-bg-custom')!;
  const setBg = (hex: string) => {
    ctx.display.bgColor = hex;
    ctx.scene.background = new THREE.Color(hex);
    bgCustom.value = hex;
    bgBtns.forEach((b) => b.classList.toggle('active', b.dataset.bg === hex));
  };
  bgBtns.forEach((btn) => {
    btn.addEventListener('click', () => setBg(btn.dataset.bg!));
  });
  bgCustom.addEventListener('input', () => {
    setBg(bgCustom.value);
  });

  // ── Color scheme presets ──

  const csBtns = panel.querySelectorAll<HTMLButtonElement>('.cs-btn')!;
  const csCustom = document.getElementById('cs-custom')!;
  const applyScheme = (scheme: ColorScheme) => {
    ctx.display.colors.scheme = scheme;
    if (scheme !== 'custom') {
      const p = COLOR_PRESETS[scheme];
      ctx.display.colors.sigma = p.sigma.slice() as [number,number,number];
      ctx.display.colors.pi = p.pi.slice() as [number,number,number];
      ctx.display.colors.lonePair = p.lonePair.slice() as [number,number,number];
    }
    csBtns.forEach((b) => b.classList.toggle('active', b.dataset.cs === scheme));
    csCustom.classList.toggle('hidden', scheme !== 'custom');
    rerender();
  };

  csBtns.forEach((btn) => {
    btn.addEventListener('click', () => applyScheme(btn.dataset.cs as ColorScheme));
  });

  // ── Custom color pickers ──

  function updateColor(cIdx: number) {
    const channel = csCustom.querySelectorAll('.cs-channel')[cIdx] as HTMLElement;
    const picker = channel.querySelector<HTMLInputElement>('.cs-color')!;
    const hex = parseInt(picker.value.slice(1), 16);
    const [h, s, v] = hexToHsv(hex);

    const key = ['sigma', 'pi', 'lonePair'][cIdx] as 'sigma' | 'pi' | 'lonePair';
    ctx.display.colors[key] = [h, s, v];
    rerender();
  }

  csCustom.querySelectorAll<HTMLInputElement>('.cs-color').forEach((picker, idx) => {
    picker.addEventListener('input', () => updateColor(idx));
  });

  // ── Export tab ──

  // Export PNG
  const exportBtn = document.getElementById('ctrl-export-png')!;
  exportBtn.addEventListener('click', () => {
    const scale = 2;
    const w = ctx.renderer.domElement.width;
    const h = ctx.renderer.domElement.height;
    ctx.renderer.setSize(w * scale, h * scale, false);
    ctx.renderer.render(ctx.scene, ctx.camera);
    const dataUrl = ctx.renderer.domElement.toDataURL('image/png');
    ctx.renderer.setSize(w, h, false);
    ctx.renderer.render(ctx.scene, ctx.camera);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'molecule.png';
    a.click();
  });

  // Export SDF
  const exportSdf = document.getElementById('ctrl-export-sdf')!;
  exportSdf.addEventListener('click', () => {
    if (!ctx.currentMolecule) return;
    const sdf = moleculeToSDF(ctx.currentMolecule);
    downloadFile(sdf, 'molecule.sdf', 'chemical/x-mol');
  });

  // Export XYZ
  const exportXyz = document.getElementById('ctrl-export-xyz')!;
  exportXyz.addEventListener('click', () => {
    if (!ctx.currentMolecule) return;
    const xyz = moleculeToXYZ(ctx.currentMolecule);
    downloadFile(xyz, 'molecule.xyz', 'chemical/x-xyz');
  });

  // Copy SMILES — run through the Kekulizer so the exported string matches
  // what is actually rendered/fetched (JSME's raw output can be aromatic
  // lower-case, e.g. "c1ccc1" for cyclobutadiene, which other tools resolve
  // to the wrong compound).
  const copySmilesBtn = document.getElementById('ctrl-copy-smiles')!;
  const clipboardFeedback = document.getElementById('clipboard-feedback')!;
  copySmilesBtn.addEventListener('click', async () => {
    const raw = window.jsmeApplet?.smiles();
    if (!raw) return;
    const smiles = kekulizeSmiles(raw);
    await navigator.clipboard.writeText(smiles);
    clipboardFeedback.classList.remove('hidden');
    setTimeout(() => clipboardFeedback.classList.add('hidden'), 2000);
  });

  // ── Measure tab ──
  const measureToggle = document.getElementById('ctrl-measure-toggle')!;
  const measurePoints = document.getElementById('measure-points')!;
  const measureResult = document.getElementById('measure-result')!;
  const measureClear = document.getElementById('ctrl-measure-clear')!;
  let measureMode = false;
  let measureAtomIndices: number[] = [];

  measureToggle.addEventListener('click', () => {
    measureMode = !measureMode;
    measureToggle.classList.toggle('active', measureMode);
    measureToggle.textContent = measureMode ? 'Disable' : 'Enable';
    if (!measureMode) {
      measureAtomIndices = [];
      measurePoints.innerHTML = '';
      measureResult.innerHTML = '';
      measureClear.classList.add('hidden');
    }
  });

  measureClear.addEventListener('click', () => {
    measureAtomIndices = [];
    measurePoints.innerHTML = '';
    measureResult.innerHTML = '';
    measureClear.classList.add('hidden');
  });

  // Expose measure state for the canvas click handler
  (ctx as any)._measureState = {
    get mode() { return measureMode; },
    get points() { return measureAtomIndices; },
    addPoint(idx: number) {
      measureAtomIndices.push(idx);
      updateMeasureDisplay();
    },
  };

  function updateMeasureDisplay() {
    const mol = ctx.currentMolecule;
    if (!mol) return;
    const pts = measureAtomIndices;
    measurePoints.innerHTML = pts.map((i) => {
      const a = mol.atoms[i];
      return `<div>Point ${pts.indexOf(i) + 1}: ${a.element} (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)})</div>`;
    }).join('');

    if (pts.length >= 2) {
      const d = distance(mol.atoms[pts[0]], mol.atoms[pts[1]]);
      measureResult.innerHTML = `Distance: ${d.toFixed(3)} Å`;
    }
    if (pts.length >= 3) {
      const a = angle(mol.atoms[pts[0]], mol.atoms[pts[1]], mol.atoms[pts[2]]);
      measureResult.innerHTML += `<br>Angle: ${a.toFixed(2)}°`;
    }
    if (pts.length >= 4) {
      const dih = dihedral(mol.atoms[pts[0]], mol.atoms[pts[1]], mol.atoms[pts[2]], mol.atoms[pts[3]]);
      measureResult.innerHTML += `<br>Dihedral: ${dih.toFixed(2)}°`;
    }
    measureClear.classList.toggle('hidden', pts.length === 0);
  }

  // ── Cite dialog ──
  const citeBtn = document.getElementById('cite-btn')!;
  const citeDialog = document.getElementById('cite-dialog')!;
  citeBtn.addEventListener('click', () => citeDialog.classList.remove('hidden'));
  document.getElementById('cite-close')!.addEventListener('click', () => citeDialog.classList.add('hidden'));
  citeDialog.addEventListener('click', (e) => { if (e.target === citeDialog) citeDialog.classList.add('hidden'); });

  document.getElementById('cite-copy')!.addEventListener('click', async () => {
    const text = document.getElementById('cite-text')!.textContent || '';
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('cite-copy')!;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy to clipboard'; }, 2000);
  });

  // ── Help dialog ──
  const helpBtn = document.getElementById('help-btn')!;
  const helpDialog = document.getElementById('help-dialog')!;
  helpBtn.addEventListener('click', () => helpDialog.classList.remove('hidden'));
  document.getElementById('help-close')!.addEventListener('click', () => helpDialog.classList.add('hidden'));
  document.getElementById('help-ok')!.addEventListener('click', () => helpDialog.classList.add('hidden'));
  helpDialog.addEventListener('click', (e) => { if (e.target === helpDialog) helpDialog.classList.add('hidden'); });

  // ── Reset view ──
  const resetBtn = document.getElementById('reset-view-btn')!;
  resetBtn.addEventListener('click', () => {
    if (ctx.currentMolecule) {
      // Re-frame the camera on the current molecule
      const center = new THREE.Vector3();
      ctx.moleculeGroup.children.forEach((child) => {
        if (child instanceof THREE.Mesh) center.add(child.position);
      });
      center.divideScalar(ctx.moleculeGroup.children.length || 1);
      const box = new THREE.Box3().setFromObject(ctx.moleculeGroup);
      const size = box.getSize(new THREE.Vector3()).length();
      const dist = size * 1.5;
      ctx.camera.position.set(center.x, center.y, center.z + dist);
      ctx.camera.lookAt(center);
      ctx.controls.target.set(center.x, center.y, center.z);
      ctx.controls.update();
    }
  });
}

// ── Helpers ──

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function moleculeToSDF(mol: { atoms: any[]; bonds: any[] }): string {
  const lines: string[] = [];
  lines.push('Valence export');
  lines.push('  converter');
  lines.push('');
  lines.push(`${mol.atoms.length.toString().padStart(3)}${mol.bonds.length.toString().padStart(3)}  0  0  0  0  0  0  0  0999 V2000`);
  for (const a of mol.atoms) {
    lines.push(`${a.x.toFixed(4).padStart(10)}${a.y.toFixed(4).padStart(10)}${a.z.toFixed(4).padStart(10)} ${a.element.padStart(3)}  0  0  0  0  0  0  0  0  0  0  0  0`);
  }
  for (const b of mol.bonds) {
    lines.push(`${(b.atom1Index + 1).toString().padStart(3)}${(b.atom2Index + 1).toString().padStart(3)}${b.order.toString().padStart(3)}  0  0  0  0`);
  }
  lines.push('M  END');
  lines.push('$$$$');
  return lines.join('\n') + '\n';
}

function moleculeToXYZ(mol: { atoms: any[] }): string {
  const lines: string[] = [];
  lines.push(mol.atoms.length.toString());
  lines.push('Valence export');
  for (const a of mol.atoms) {
    lines.push(`${a.element}  ${a.x.toFixed(6)}  ${a.y.toFixed(6)}  ${a.z.toFixed(6)}`);
  }
  return lines.join('\n') + '\n';
}

function distance(a: any, b: any): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angle(a: any, b: any, c: any): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const d1 = Math.hypot(...v1);
  const d2 = Math.hypot(...v2);
  const dot = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (d1 * d2);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
}

function dihedral(a: any, b: any, c: any, d: any): number {
  const b1 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const b2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const b3 = [d.x - c.x, d.y - c.y, d.z - c.z];
  
  const n1 = cross(b1, b2);
  const n2 = cross(b2, b3);
  const m1 = cross(n1, [b2[0] / Math.hypot(...b2), b2[1] / Math.hypot(...b2), b2[2] / Math.hypot(...b2)]);
  
  const x = dot(n1, n2);
  const y = dot(m1, n2);
  
  return Math.atan2(y, x) * 180 / Math.PI;
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
