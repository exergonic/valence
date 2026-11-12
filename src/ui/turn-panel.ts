/**
 * Turn a bond: the Structure view's dihedral drive (decided with the user
 * 2026-11-11). A bond is clicked, and one side of it turns rigidly about its
 * axis — by the slider, by a click on the energy curve, or by dragging an atom
 * of the side that turns. The turned structure becomes *the* structure on
 * screen, in every view: the Localized view's E(2) at 0° and 60°, the
 * Delocalized view's π overlap fading as ethene twists, are the point.
 *
 * A turned structure is not a minimum, and the header says so in one line;
 * its card names each dihedral turned, from and to, and how far above the
 * structure the turning began from it sits (GFN2-xTB single points). "Optimise
 * from here" relaxes it to the nearest conformer — the way a student reaches
 * gauche butane, by putting it there. "Undo turns" puts the start back.
 *
 * The curve is a rigid scan, 5° steps, each a fresh GFN2 single point
 * (geometry/torsion.ts says why rigid). It runs unasked when it will take
 * 15 s or less on this machine, timed on its first point; otherwise it waits
 * for the button with its estimate, like the Thermo view's Hessian.
 */
import * as THREE from 'three';
import type { SceneContext } from '../render';
import { ATOM_LAYER } from '../render';
import type { Molecule } from '../mol-parser';
import { dihedralDegrees, torsionAbout, torsionName, turnTorsion, wrapDegrees, type Torsion } from '../geometry/torsion';
import { gfn2EnergyAt } from '../geometry/gfn2-refine';
import { optimiseOnScreen, showMolecule, showMoleculeHeader, shownHeader, TURNED_FROM, type HeaderInfo } from './jsme-panel';
import { ASK_ABOVE_SECONDS } from './long-runs';

const KCAL_PER_HARTREE = 627.509474;
/** The rigid scan's step, degrees. */
const SCAN_STEP = 5;
const SCAN_ANGLES = Array.from({ length: 360 / SCAN_STEP }, (_, i) => -180 + SCAN_STEP * (i + 1)); // −175 … 180
/** Degrees of turn per pixel of a drag across the scene. */
const DEGREES_PER_PIXEL = 0.5;
/** Two dihedrals this close (degrees) are the same: a turn brought back to its start is no turn. */
const SAME_ANGLE = 0.05;

/** The structure the turning began from, and what was known of it, to say
 *  where a turned structure came from and to put it back. */
interface Origin {
  molecule: Molecule;
  /** Its header, taken at the first turn: by then it has been written. */
  header: HeaderInfo | null;
  gfn2Charges: number[] | null;
  vibrations: NonNullable<SceneContext['vibrations']>['modes'] | null;
  noMinimum: string | null;
  energy: Promise<number | null>;
}

interface Scan {
  bondIndex: number;
  /** The structure scanned: the one on screen when the scan began. */
  base: Molecule;
  lineage: number;
  energies: Array<number | null | undefined>;
  state: 'running' | 'waiting' | 'stopped' | 'done';
  /** The estimate, seconds, once the first point has been timed. */
  seconds: number | null;
}

export function setupTurnPanel(ctx: SceneContext): void {
  const container = document.getElementById('canvas-container')!;
  const hint = document.getElementById('turn-hint')!;
  const refusalEl = document.getElementById('turn-refusal')!;
  const bondEl = document.getElementById('turn-bond')!;
  const nameEl = document.getElementById('turn-name')!;
  const energyEl = document.getElementById('turn-energy')!;
  const slider = document.getElementById('turn-angle') as HTMLInputElement;
  const number = document.getElementById('turn-angle-value') as HTMLInputElement;
  const curveEl = document.getElementById('turn-curve')!;
  const scanStatus = document.getElementById('turn-scan-status')!;
  const scanButton = document.getElementById('turn-scan') as HTMLButtonElement;
  const note = document.getElementById('turn-note')!;
  const optimiseButton = document.getElementById('turn-optimise') as HTMLButtonElement;
  const backButton = document.getElementById('turn-back') as HTMLButtonElement;

  let toolOn = false;
  let torsion: Torsion | null = null;
  /** The structure the bond was chosen on (its graph is every turned one's). */
  let chosenOn: Molecule | null = null;
  let refusal: string | null = null;
  let origin: Origin | null = null;
  /** Each bond turned, by its index: its dihedral's name, from and to. */
  const turns = new Map<number, { name: string; from: number; to: number }>();
  /** The last structure this panel put on screen. Any other is a new start. */
  let ours: Molecule | null = null;
  /** Bumped whenever the structure changes other than by turning the scanned
   *  bond: a scan belongs to one lineage. */
  let lineage = 0;
  let scan: Scan | null = null;
  let scanToken = 0;

  // ── the selected bond, marked in the scene by a ring about its axis ──
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.035, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0x7aa7ff, transparent: true, opacity: 0.85, depthTest: false }),
  );
  ring.renderOrder = 10;
  ring.visible = false;
  ctx.scene.add(ring);
  const placeRing = () => {
    const molecule = ctx.currentMolecule;
    ring.visible = toolOn && torsion !== null && molecule !== undefined;
    if (ring.visible && molecule && torsion) {
      const b = molecule.atoms[torsion.b];
      const c = molecule.atoms[torsion.c];
      const from = new THREE.Vector3(b.x, b.y, b.z);
      const to = new THREE.Vector3(c.x, c.y, c.z);
      ring.position.copy(from).lerp(to, 0.5);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.sub(from).normalize());
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      if (accent) (ring.material as THREE.MeshBasicMaterial).color.set(accent);
    }
    ctx.requestRender();
  };

  const energyOf = (molecule: Molecule): Promise<number | null> => gfn2EnergyAt(molecule).catch(() => null);

  /** The structure on screen, taken as the start of the turning. */
  const captureOrigin = (molecule: Molecule): Origin => {
    const known = ctx.gfn2Properties?.molecule === molecule ? ctx.gfn2Properties.properties.energy : null;
    return {
      molecule,
      header: null,
      gfn2Charges: ctx.gfn2Charges?.molecule === molecule ? ctx.gfn2Charges.charges : null,
      vibrations: ctx.vibrations?.molecule === molecule ? ctx.vibrations.modes : null,
      noMinimum: ctx.noMinimum?.molecule === molecule ? ctx.noMinimum.reason : null,
      energy: known !== null ? Promise.resolve(known) : energyOf(molecule),
    };
  };

  // ── the header and card of a turned structure ──
  const degrees = (value: number) => `${value.toFixed(1).replace('-', '−')}°`;
  const kcal = (delta: number) => `${Math.abs(delta).toFixed(2)} kcal/mol`;

  const writeHeader = (molecule: Molecule, energy: number | null | undefined) => {
    if (!origin?.header) return;
    const start = origin.header.source === 'turned' ? 'gfn2' : origin.header.source;
    const list = [...turns.values()].map((t) => `${t.name} from ${degrees(t.from)} to ${degrees(t.to)}`);
    const turned = `${turns.size === 1 ? 'dihedral' : 'dihedrals'} ${list.length > 1
      ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]}`;
    let standing: string;
    if (energy === undefined) standing = 'Its energy is being computed.';
    else if (energy === null) standing = 'GFN2-xTB’s SCC did not converge here, so its energy is not known.';
    else if (lastOriginEnergy === null) standing = 'The energy of the structure it was turned from is not known.';
    else {
      const delta = (energy - lastOriginEnergy) * KCAL_PER_HARTREE;
      standing = `It is ${kcal(delta)} ${delta >= 0 ? 'above' : 'below'} the structure it was turned from (GFN2-xTB single `
        + 'points, nothing relaxed).';
    }
    showMoleculeHeader(molecule, {
      source: 'turned', turnedFrom: start, name: origin.header.name, spinChosen: origin.header.spinChosen,
      warnings: ['Turned by hand — not a minimum.'],
      attention: [`Turned by hand from ${TURNED_FROM[start]}: ${turned}; nothing else moved. ${standing} `
        + '“Optimise from here” relaxes it to the nearest conformer.'],
    });
  };

  // the start's energy, once known, for ΔE
  let lastOriginEnergy: number | null = null;

  /** The energy of the structure on screen, from its background single point. */
  const energyOnScreen = (): number | null | undefined => {
    const molecule = ctx.currentMolecule;
    if (!molecule) return undefined;
    if (ctx.gfn2Properties?.molecule === molecule) return ctx.gfn2Properties.properties.energy;
    if (ctx.gfn2PropertiesRequest?.molecule === molecule && ctx.gfn2PropertiesRequest.status === 'failed') return null;
    return undefined;
  };

  /** Whether the single point on screen spreads electrons over frontier
   *  orbitals that have come together: a twisted π bond, two radicals. */
  const frontierShared = (): boolean => {
    const molecule = ctx.currentMolecule;
    if (!molecule || ctx.gfn2Properties?.molecule !== molecule) return false;
    const { alpha, beta } = ctx.gfn2Properties.properties;
    const full = beta ? 1 : 2;
    return [alpha, beta].some((set) => set?.occupations.some((n) => n > 0.1 && n < full - 0.1) ?? false);
  };

  // ── turning ──
  const turnTo = (target: number) => {
    const current = ctx.currentMolecule;
    if (!current || !torsion) return;
    const angle = wrapDegrees(target);
    if (!origin) origin = captureOrigin(current);
    if (!origin.header) {
      const shown = shownHeader();
      origin.header = shown?.molecule === origin.molecule ? shown.info : { source: 'gfn2' };
    }
    // a turn of another bond than the scanned one moves the scan's base
    if (scan && scan.bondIndex !== torsion.bondIndex) lineage += 1;
    const turned = turnTorsion(current, torsion, angle);
    const prior = turns.get(torsion.bondIndex);
    turns.set(torsion.bondIndex, {
      name: torsionName(current, torsion),
      from: prior?.from ?? dihedralDegrees(origin.molecule, torsion),
      to: dihedralDegrees(turned, torsion),
    });
    for (const [bond, t] of turns) if (Math.abs(wrapDegrees(t.to - t.from)) < SAME_ANGLE) turns.delete(bond);
    if (turns.size === 0) {
      undoTurns();
      return;
    }
    ours = turned;
    showMolecule(ctx, turned, null, null, origin.noMinimum, true);
    writeHeader(turned, undefined);
    void origin.energy.then((e) => {
      lastOriginEnergy = e;
      render();
    });
  };

  const undoTurns = () => {
    if (!origin) return;
    const start = origin;
    turns.clear();
    ours = start.molecule;
    showMolecule(ctx, start.molecule, start.gfn2Charges, start.vibrations, start.noMinimum, true);
    if (start.header) showMoleculeHeader(start.molecule, start.header);
    render();
  };

  // the slider moves faster than a scene builds: one turn per frame, the latest
  let pendingAngle: number | null = null;
  const scheduleTurn = (angle: number) => {
    if (pendingAngle === null) {
      requestAnimationFrame(() => {
        const next = pendingAngle;
        pendingAngle = null;
        if (next !== null) turnTo(next);
      });
    }
    pendingAngle = angle;
  };

  // ── choosing a bond ──
  const choose = (bondIndex: number) => {
    const molecule = ctx.currentMolecule;
    if (!molecule) return;
    chosenOn = molecule;
    const choice = torsionAbout(molecule, bondIndex);
    if ('refusal' in choice) {
      torsion = null;
      refusal = choice.refusal;
    } else {
      torsion = choice.torsion;
      refusal = null;
      if (!origin) origin = captureOrigin(molecule);
      void origin.energy.then((e) => {
        lastOriginEnergy = e;
        render();
      });
      if (toolOn && !scanUsable()) startScan(false);
    }
    render();
  };

  // ── the rigid scan ──
  const scanUsable = () => scan !== null && torsion !== null && scan.bondIndex === torsion.bondIndex && scan.lineage === lineage;

  const startScan = (confirmed: boolean) => {
    const molecule = ctx.currentMolecule;
    if (!molecule || !torsion) return;
    const token = ++scanToken;
    const run: Scan = scanUsable() ? scan! : {
      bondIndex: torsion.bondIndex, base: molecule, lineage, energies: SCAN_ANGLES.map(() => undefined), state: 'running', seconds: null,
    };
    run.state = 'running';
    scan = run;
    const turning = torsion;
    render();
    void (async () => {
      for (let i = 0; i < SCAN_ANGLES.length; i++) {
        if (run.energies[i] !== undefined) continue;
        const started = performance.now();
        const energy = await energyOf(turnTorsion(run.base, turning, SCAN_ANGLES[i]));
        if (token !== scanToken || scan !== run) return;
        run.energies[i] = energy;
        if (run.seconds === null) {
          run.seconds = ((performance.now() - started) / 1000) * SCAN_ANGLES.length;
          if (run.seconds > ASK_ABOVE_SECONDS && !confirmed) {
            run.state = 'waiting';
            render();
            return;
          }
        }
        drawCurve();
        writeScanStatus();
      }
      run.state = 'done';
      render();
    })();
  };

  const stopScan = () => {
    scanToken += 1;
    if (scan && scan.state === 'running') scan.state = 'stopped';
    render();
  };

  scanButton.addEventListener('click', () => {
    if (scan?.state === 'running') stopScan();
    else startScan(true);
  });

  const writeScanStatus = () => {
    const done = scan?.energies.filter((e) => e !== undefined).length ?? 0;
    const usable = scanUsable();
    let status = '';
    let button: string | null = null;
    if (!torsion) {
      // nothing
    } else if (!usable) {
      status = 'The rigid scan is of another structure; scan this one again.';
      button = 'Scan 360°';
    } else if (scan!.state === 'running') {
      status = `Rigid scan: ${done} of ${SCAN_ANGLES.length} angles.`;
      button = 'Stop';
    } else if (scan!.state === 'waiting') {
      status = `A rigid scan takes over ${ASK_ABOVE_SECONDS} s on this machine, so it waits for you.`;
      button = `Scan 360° — about ${Math.max(1, Math.round(scan!.seconds ?? 0))} s`;
    } else if (scan!.state === 'stopped') {
      status = `Rigid scan stopped at ${done} of ${SCAN_ANGLES.length} angles.`;
      button = 'Finish the scan';
    } else if (scan!.energies.some((e) => e === null)) {
      status = 'GFN2-xTB’s SCC did not converge at some angles; the curve skips them.';
    }
    scanStatus.textContent = status;
    scanStatus.classList.toggle('hidden', status === '');
    scanButton.textContent = button ?? '';
    scanButton.classList.toggle('hidden', button === null);
  };

  // ── the curve: ΔE against the dihedral, rigid ──
  const SVG = 'http://www.w3.org/2000/svg';
  const W = 260;
  const H = 128;
  const left = 30;
  const right = W - 12;
  const top = 8;
  const bottom = H - 20;
  const x = (angle: number) => left + ((angle + 180) / 360) * (right - left);
  const angleAt = (px: number) => -180 + ((px - left) / (right - left)) * 360;
  let yMax = 1;
  let yMin = 0;
  const y = (delta: number) => bottom - ((delta - yMin) / (yMax - yMin)) * (bottom - top);
  const niceCeiling = (value: number) => {
    for (const step of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (value <= step) return step;
    return Math.ceil(value / 100) * 100;
  };

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'turn-curve-svg');
  svg.setAttribute('role', 'img');
  curveEl.append(svg);
  const hoverText = document.createElementNS(SVG, 'text');

  const element = (name: string, attributes: Record<string, string | number>, text?: string) => {
    const el = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function drawCurve() {
    const usable = scanUsable() && lastOriginEnergy !== null;
    curveEl.classList.toggle('hidden', !torsion);
    svg.replaceChildren();
    if (!torsion) return;
    const points = usable
      ? SCAN_ANGLES.map((angle, i) => ({ angle, energy: scan!.energies[i] }))
        .filter((p): p is { angle: number; energy: number } => typeof p.energy === 'number')
        .map((p) => ({ angle: p.angle, delta: (p.energy - lastOriginEnergy!) * KCAL_PER_HARTREE }))
      : [];
    const deltas = points.map((p) => p.delta);
    yMax = niceCeiling(Math.max(1, ...deltas));
    // a start a hair above the scan's lowest point (it sits between two of its
    // angles) keeps the axis at 0; a start well above it opens the axis below
    const lowest = Math.min(0, ...deltas);
    yMin = lowest < -0.1 ? -niceCeiling(-lowest) : 0;
    svg.setAttribute('aria-label', 'The rigid torsion profile: ΔE against the dihedral angle');

    // the frame: the dihedral every 60°, ΔE at 0 and the top
    for (const angle of [-180, -120, -60, 0, 60, 120, 180]) {
      svg.append(element('line', { x1: x(angle), x2: x(angle), y1: top, y2: bottom, class: 'turn-grid' }));
      svg.append(element('text', { x: x(angle), y: H - 7, class: 'turn-tick', 'text-anchor': 'middle' }, String(angle).replace('-', '−')));
    }
    for (const value of yMin < 0 ? [yMin, 0, yMax] : [0, yMax]) {
      svg.append(element('line', { x1: left, x2: right, y1: y(value), y2: y(value), class: value === 0 ? 'turn-axis' : 'turn-grid' }));
      svg.append(element('text', { x: left - 4, y: y(value) + 3, class: 'turn-tick', 'text-anchor': 'end' }, String(value).replace('-', '−')));
    }
    svg.append(element('text', { x: left + 2, y: top + 7, class: 'turn-tick' }, 'ΔE, kcal/mol'));

    // the curve: a gap where the SCC failed, and round the ±180° seam
    if (points.length > 1) {
      let path = '';
      let previous: number | null = null;
      for (const p of points) {
        const joined = previous !== null && p.angle - previous === SCAN_STEP;
        path += `${joined ? 'L' : 'M'}${x(p.angle).toFixed(1)},${y(p.delta).toFixed(1)}`;
        previous = p.angle;
      }
      svg.append(element('path', { d: path, class: 'turn-line' }));
    }

    // where the bond is now, and where it started
    const molecule = ctx.currentMolecule;
    if (molecule) {
      const now = dihedralDegrees(molecule, torsion);
      svg.append(element('line', { x1: x(now), x2: x(now), y1: top, y2: bottom, class: 'turn-now' }));
      const energy = energyOnScreen();
      if (typeof energy === 'number' && lastOriginEnergy !== null) {
        const delta = (energy - lastOriginEnergy) * KCAL_PER_HARTREE;
        if (delta <= yMax && delta >= yMin) svg.append(element('circle', { cx: x(now), cy: y(delta), r: 3, class: 'turn-dot' }));
      }
    }
    if (origin) {
      const start = dihedralDegrees(origin.molecule, torsion);
      svg.append(element('path', { d: `M${x(start) - 4},${bottom + 1}L${x(start) + 4},${bottom + 1}L${x(start)},${bottom - 5}Z`, class: 'turn-start' }));
    }
    hoverText.setAttribute('x', String(right));
    hoverText.setAttribute('y', String(top + 7));
    hoverText.setAttribute('class', 'turn-tick');
    hoverText.setAttribute('text-anchor', 'end');
    svg.append(hoverText);
  }

  // the curve's readout under the pointer, and a click turns the bond there
  const pointerAngle = (event: MouseEvent) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * W;
    if (px < left || px > right) return null;
    return Math.round(angleAt(px));
  };
  svg.addEventListener('mousemove', (event) => {
    const angle = pointerAngle(event);
    if (angle === null || !scanUsable() || lastOriginEnergy === null) {
      hoverText.textContent = '';
      return;
    }
    const nearest = SCAN_ANGLES.reduce((best, a, i) => (Math.abs(wrapDegrees(a - angle)) < Math.abs(wrapDegrees(SCAN_ANGLES[best] - angle)) ? i : best), 0);
    const energy = scan!.energies[nearest];
    hoverText.textContent = typeof energy === 'number'
      ? `${String(SCAN_ANGLES[nearest]).replace('-', '−')}°: ${((energy - lastOriginEnergy) * KCAL_PER_HARTREE).toFixed(2).replace('-', '−')}`
      : '';
  });
  svg.addEventListener('mouseleave', () => { hoverText.textContent = ''; });
  svg.addEventListener('click', (event) => {
    const angle = pointerAngle(event);
    if (angle !== null) turnTo(angle);
  });

  // ── the panel ──
  function render() {
    const molecule = ctx.currentMolecule;
    hint.classList.toggle('hidden', torsion !== null || refusal !== null);
    refusalEl.textContent = refusal ?? '';
    refusalEl.classList.toggle('hidden', refusal === null);
    bondEl.classList.toggle('hidden', torsion === null);
    if (torsion && molecule) {
      const now = dihedralDegrees(molecule, torsion);
      nameEl.textContent = torsionName(molecule, torsion);
      nameEl.title = `The dihedral about ${torsionName(molecule, torsion).split('–').slice(1, 3).join('–')}, named by the `
        + 'heaviest neighbour at each end. The side with fewer atoms turns.';
      slider.value = String(Math.round(now));
      if (document.activeElement !== number) number.value = now.toFixed(1);
      const energy = energyOnScreen();
      if (lastOriginEnergy === null || energy === undefined) energyEl.textContent = 'ΔE …';
      else if (energy === null) energyEl.textContent = 'ΔE not known';
      else {
        const delta = (energy - lastOriginEnergy) * KCAL_PER_HARTREE;
        energyEl.textContent = `ΔE ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)} kcal/mol`;
      }
      energyEl.title = 'GFN2-xTB’s energy here, less the energy of the structure the turning began from: a rigid turn, '
        + 'nothing else relaxed.';
      const shared = frontierShared();
      note.textContent = shared
        ? 'Here GFN2-xTB shares electrons between frontier orbitals that have come together in energy. A bond '
          + 'twisted this far is close to two radicals, which one determinant overstates, so the energy here runs high.'
        : '';
      note.classList.toggle('hidden', !shared);
    }
    backButton.classList.toggle('hidden', turns.size === 0);
    writeScanStatus();
    drawCurve();
    placeRing();
  }

  slider.addEventListener('input', () => scheduleTurn(Number(slider.value)));
  number.addEventListener('change', () => {
    const value = Number(number.value);
    if (Number.isFinite(value)) turnTo(value);
  });
  backButton.addEventListener('click', undoTurns);
  optimiseButton.addEventListener('click', () => { void optimiseOnScreen(); });

  document.addEventListener('structure-tool', (event) => {
    toolOn = (event as CustomEvent<string | null>).detail === 'turn';
    if (!toolOn) stopScan();
    else if (torsion && !scanUsable()) startScan(false);
    render();
  });

  // ── a new structure from elsewhere starts afresh; ours is only redrawn ──
  const sceneBuilt = ctx.onSceneBuilt;
  ctx.onSceneBuilt = () => {
    sceneBuilt();
    const molecule = ctx.currentMolecule;
    if (molecule !== ours) {
      ours = null;
      origin = null;
      lastOriginEnergy = null;
      turns.clear();
      lineage += 1;
      stopScan();
      scan = null;
      // the same bond stays chosen when the molecule is the same one, atom for
      // atom and bond for bond (an optimisation from here)
      const kept = torsion && chosenOn && molecule && sameGraph(chosenOn, molecule) ? torsion.bondIndex : null;
      torsion = null;
      refusal = null;
      if (kept !== null) choose(kept);
    }
    render();
  };

  const sameGraph = (a: Molecule, b: Molecule) =>
    a.atoms.length === b.atoms.length && a.bonds.length === b.bonds.length
    && a.atoms.every((atom, i) => atom.element === b.atoms[i].element)
    && a.bonds.every((bond, i) => bond.atom1Index === b.bonds[i].atom1Index && bond.atom2Index === b.bonds[i].atom2Index);

  // the background single point brings the energy and the orbitals
  const gfn2Orbitals = ctx.onGfn2Orbitals;
  ctx.onGfn2Orbitals = () => {
    gfn2Orbitals();
    if (ours && ctx.currentMolecule === ours && origin && turns.size > 0) writeHeader(ours, energyOnScreen());
    render();
  };

  // ── picking and dragging in the scene ──
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(ATOM_LAYER);
  const pick = (event: MouseEvent): THREE.Object3D | null => {
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, ctx.camera);
    const hits = raycaster.intersectObjects(ctx.moleculeGroup.children, true);
    return hits[0]?.object ?? null;
  };

  // Grabbing any atom off the bond axis turns the bond: an atom on the side
  // that turns carries it one way, an atom on the side that stays the other —
  // the same relative turn, as a hand on either end of a Newman projection.
  let pressed: { x: number; y: number } | null = null;
  let drag: { startX: number; startAngle: number; sense: 1 | -1 } | null = null;
  container.addEventListener('pointerdown', (event) => {
    pressed = { x: event.clientX, y: event.clientY };
    if (!toolOn || !torsion || !ctx.currentMolecule || event.button !== 0) return;
    const hit = pick(event);
    const atom = hit?.userData?.atomIndex as number | undefined;
    if (atom === undefined || atom === torsion.b || atom === torsion.c) return;
    // the trackball sees this press after us (it listens on the canvas inside)
    ctx.controls.enabled = false;
    drag = {
      startX: event.clientX,
      startAngle: dihedralDegrees(ctx.currentMolecule, torsion),
      sense: torsion.turning.includes(atom) ? 1 : -1,
    };
    container.setPointerCapture(event.pointerId);
  }, { capture: true });
  container.addEventListener('pointermove', (event) => {
    if (!drag) return;
    scheduleTurn(drag.startAngle + drag.sense * (event.clientX - drag.startX) * DEGREES_PER_PIXEL);
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    ctx.controls.enabled = true;
  };
  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  container.addEventListener('click', (event) => {
    if (!toolOn || !ctx.currentMolecule) return;
    // a click, not the end of a drag that turned the view or the bond
    if (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return;
    const hit = pick(event);
    if (hit?.userData?.lobeType !== 'bond') return;
    const molecule = ctx.currentMolecule;
    const { atom1Index, atom2Index } = hit.userData as { atom1Index: number; atom2Index: number };
    const index = molecule.bonds.findIndex((b) =>
      (b.atom1Index === atom1Index && b.atom2Index === atom2Index) || (b.atom1Index === atom2Index && b.atom2Index === atom1Index));
    if (index >= 0) choose(index);
  });

  render();
}
