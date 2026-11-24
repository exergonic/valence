/**
 * Flip a ring: the Structure view's chair flip (decided with the user
 * 2026-11-24). A ring atom is clicked, and the ring's two chairs are both
 * optimised with GFN2-xTB — the one on screen, and the other one built by
 * geometry/ring-flip.ts, every group on its own face, axial and equatorial
 * traded. The panel lists both, each group axial or equatorial, with each
 * chair's energy, and ΔE for the chair on screen; the button (or a click on a
 * chair) puts the other on screen, in every view, and back.
 *
 * Both chairs are minima, unlike a turned bond: each is shown as GFN2-xTB
 * optimised it, a structure like any other. If the other chair is not a
 * minimum of the molecule drawn — GFN2-xTB relaxes it to a twist or back,
 * or its bonding changes — the panel says so and offers nothing to show.
 */
import * as THREE from 'three';
import type { SceneContext } from '../render';
import { ATOM_LAYER } from '../render';
import type { Molecule } from '../mol-parser';
import { refineWithGfn2, Gfn2Unavailable, type Gfn2Result } from '../geometry/gfn2-refine';
import { assessBonding } from '../geometry/bond-integrity';
import { chairPositions, flipChair, isChair, ringName, ringToFlip, ringTorsions } from '../geometry/ring-flip';
import { atomName } from '../geometry/torsion';
import { showGfn2Structure } from './jsme-panel';

const KCAL_PER_HARTREE = 627.509474;

interface Chair {
  /** GFN2-xTB's optimisation of this chair; undefined while it runs, null when it failed. */
  result: Gfn2Result | null | undefined;
}

interface RingFlip {
  ring: number[];
  /** The structure the ring was chosen on: its graph is both chairs'. */
  chosenOn: Molecule;
  /** [the chair as it was on screen, the other chair]. */
  chairs: [Chair, Chair];
  /** Which chair is on screen: null while it is still the structure the ring was chosen on. */
  onScreen: 0 | 1 | null;
  /** Why the other chair cannot be shown, or null. */
  problem: string | null;
}

export function setupFlipPanel(ctx: SceneContext): void {
  const container = document.getElementById('canvas-container')!;
  const hint = document.getElementById('flip-hint')!;
  const refusalEl = document.getElementById('flip-refusal')!;
  const ringEl = document.getElementById('flip-ring')!;
  const nameEl = document.getElementById('flip-name')!;
  const energyEl = document.getElementById('flip-energy')!;
  const chairsEl = document.getElementById('flip-chairs')!;
  const statusEl = document.getElementById('flip-status')!;
  const button = document.getElementById('flip-button') as HTMLButtonElement;
  const note = document.getElementById('flip-note')!;

  let toolOn = false;
  let flip: RingFlip | null = null;
  let refusal: string | null = null;
  /** The last structure this panel put on screen. Any other is a new start. */
  let ours: Molecule | null = null;
  /** Set while this panel puts a chair on screen: the scene is built before the call returns. */
  let showing = false;
  let token = 0;

  // ── the chosen ring, marked in the scene by a loop through its atoms ──
  const loop = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.03, 10, 64),
    new THREE.MeshBasicMaterial({ color: 0x7aa7ff, transparent: true, opacity: 0.85, depthTest: false }),
  );
  loop.renderOrder = 10;
  loop.visible = false;
  ctx.scene.add(loop);
  const placeLoop = () => {
    const molecule = ctx.currentMolecule;
    loop.visible = toolOn && flip !== null && molecule !== undefined;
    if (loop.visible && molecule && flip) {
      const points = flip.ring.map((i) => new THREE.Vector3(molecule.atoms[i].x, molecule.atoms[i].y, molecule.atoms[i].z));
      const centre = points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length);
      const normal = new THREE.Vector3();
      points.forEach((p, k) => normal.add(p.clone().sub(centre).cross(points[(k + 1) % points.length].clone().sub(centre))));
      const radius = points.reduce((sum, p) => sum + p.distanceTo(centre), 0) / points.length;
      loop.position.copy(centre);
      loop.scale.setScalar(radius);
      loop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.normalize());
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      if (accent) (loop.material as THREE.MeshBasicMaterial).color.set(accent);
    }
    ctx.requestRender();
  };

  // ── both chairs, optimised ──
  const sameSign = (a: number[], b: number[]) => a.every((t, k) => Math.sign(t) === Math.sign(b[k]));
  const opposite = (a: number[], b: number[]) => a.every((t, k) => Math.sign(t) === -Math.sign(b[k]));

  /** Why an optimised chair is not the one meant, or null: its bonding
   *  changed, or it relaxed out of a chair, or into the other chair. */
  const checkChair = (result: Gfn2Result, ring: number[], torsionsMeant: number[], which: string): string | null => {
    const verdict = assessBonding(result.molecule, result.bondOrders, result.bondOrderMatrix);
    const change = verdict.formed ?? verdict.broken;
    if (change) return `Optimised, ${which} no longer had the bonds drawn (${change}).`;
    if (!isChair(result.molecule, ring)) return `GFN2-xTB relaxed ${which} out of a chair — to a twist or boat — so it is not a minimum here.`;
    if (!sameSign(ringTorsions(result.molecule, ring), torsionsMeant)) return `GFN2-xTB relaxed ${which} back over to the other chair, so it is not a minimum here.`;
    return null;
  };

  const choose = (atom: number) => {
    const molecule = ctx.currentMolecule;
    if (!molecule) return;
    const choice = ringToFlip(molecule, atom);
    token += 1;
    if ('refusal' in choice) {
      flip = null;
      refusal = choice.refusal;
      render();
      return;
    }
    refusal = null;
    const ring = choice.ring;
    const current: RingFlip = { ring, chosenOn: molecule, chairs: [{ result: undefined }, { result: undefined }], onScreen: null, problem: null };
    flip = current;
    render();
    const mine = token;
    const asBuilt = ringTorsions(molecule, ring);
    void (async () => {
      try {
        const [first, other] = [await refineWithGfn2(molecule), await refineWithGfn2(flipChair(molecule, ring))];
        if (mine !== token) return;
        current.chairs[0].result = first;
        current.chairs[1].result = other;
        if (!first || !other) {
          current.problem = 'GFN2-xTB could not optimise both chairs.';
        } else {
          current.problem = checkChair(first, ring, asBuilt, 'the chair on screen')
            ?? checkChair(other, ring, asBuilt.map((t) => -t), 'the other chair');
          if (!current.problem && !opposite(ringTorsions(first.molecule, ring), ringTorsions(other.molecule, ring))) {
            current.problem = 'Optimised, the two chairs came out the same.';
          }
        }
      } catch (error) {
        if (mine !== token) return;
        current.chairs[0].result = current.chairs[0].result ?? null;
        current.chairs[1].result = current.chairs[1].result ?? null;
        current.problem = error instanceof Gfn2Unavailable ? `GFN2-xTB is unavailable: ${error.message}.` : 'GFN2-xTB could not optimise both chairs.';
      }
      render();
    })();
  };

  const showChair = (k: 0 | 1) => {
    if (!flip || flip.problem) return;
    const result = flip.chairs[k].result;
    if (!result) return;
    const name = ringName(flip.chosenOn, flip.ring);
    const said = k === 1
      ? `Ring ${name}: its other chair, flipped by hand and optimised with GFN2-xTB. Every group kept its face of the ring; axial and equatorial traded places.`
      : `Ring ${name}: the chair it was built in, optimised with GFN2-xTB.`;
    showing = true;
    try {
      ours = showGfn2Structure(ctx, result, said);
    } finally {
      showing = false;
    }
    flip.onScreen = k;
    render();
  };

  button.addEventListener('click', () => {
    if (!flip) return;
    showChair(flip.onScreen === 1 ? 0 : 1);
  });

  // ── the panel ──
  const energyOf = (k: 0 | 1) => flip?.chairs[k].result?.energyHartree ?? null;
  const signed = (delta: number) => `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`;

  /** "C7 eq · O11 ax": a chair's heavy groups on the ring. */
  const groups = (molecule: Molecule, ring: number[]) => {
    const heavy = chairPositions(molecule)
      .filter((p) => ring.includes(p.ringAtom) && molecule.atoms[p.substituent].element !== 'H');
    return heavy.length === 0 ? 'hydrogens only: the two chairs are alike'
      : heavy.map((p) => `${atomName(molecule, p.substituent)} ${p.axial ? 'ax' : 'eq'}`).join(' · ');
  };

  function render() {
    hint.classList.toggle('hidden', flip !== null || refusal !== null);
    refusalEl.textContent = refusal ?? '';
    refusalEl.classList.toggle('hidden', refusal === null);
    ringEl.classList.toggle('hidden', flip === null);
    if (flip) {
      const molecule = flip.chosenOn;
      nameEl.textContent = ringName(molecule, flip.ring);
      nameEl.title = 'The ring chosen: its atoms in order round the ring.';
      const running = flip.chairs.some((c) => c.result === undefined);
      const shown: 0 | 1 = flip.onScreen ?? 0;
      const energies = [energyOf(0), energyOf(1)];
      const known = !running && !flip.problem && energies[0] !== null && energies[1] !== null;
      const lowest = known ? Math.min(energies[0]!, energies[1]!) : 0;

      energyEl.textContent = known ? `ΔE ${signed((energies[shown]! - energies[1 - shown]!) * KCAL_PER_HARTREE)} kcal/mol` : '';
      energyEl.title = 'GFN2-xTB’s energy of the chair on screen less the other chair’s: two minima, each optimised.';

      chairsEl.replaceChildren(...([0, 1] as const).map((k) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'flip-chair';
        row.setAttribute('aria-pressed', String(shown === k));
        row.disabled = !known || shown === k;
        const result = flip!.chairs[k].result;
        const title = document.createElement('span');
        title.className = 'flip-chair-name';
        title.textContent = k === 0 ? 'Chair as built' : 'The other chair';
        const energy = document.createElement('span');
        energy.className = 'flip-chair-energy';
        const above = known ? (energies[k]! - lowest) * KCAL_PER_HARTREE : 0;
        energy.textContent = known ? `${above < 0.005 ? '0.00' : `+${above.toFixed(2)}`} kcal/mol` : running ? '…' : '';
        const list = document.createElement('span');
        list.className = 'flip-chair-groups';
        list.textContent = result ? groups(result.molecule, flip!.ring)
          : k === 0 ? groups(molecule, flip!.ring) : '';
        row.append(title, energy, list);
        row.title = shown === k ? 'This chair is on screen.' : 'Show this chair.';
        row.addEventListener('click', () => showChair(k));
        return row;
      }));

      let status = '';
      if (running) status = 'Optimising both chairs with GFN2-xTB…';
      else if (flip.problem) status = flip.problem;
      statusEl.textContent = status;
      statusEl.classList.toggle('hidden', status === '');
      button.disabled = !known;
      button.classList.toggle('hidden', !!flip.problem);
      button.textContent = shown === 1 ? 'Flip back' : 'Flip the ring';

      // a sugar's ΔE: GFN2-xTB puts its chairs too close (NOTES.md, 2026-11-24)
      const hydroxyls = chairPositions(molecule).filter((p) => flip!.ring.includes(p.ringAtom)
        && molecule.atoms[p.substituent].element === 'O').length;
      const sugar = hydroxyls >= 2 && known;
      note.textContent = sugar
        ? 'With OH groups on the ring, read ΔE with care: GFN2-xTB puts a sugar’s two chairs far too close. For '
          + 'β-glucose it has put the all-axial chair level with the all-equatorial one, or below it, where DFT puts '
          + 'the all-equatorial chair several kcal/mol lower. The hydrogen bonds the OH groups happen to make move a '
          + 'gas-phase energy too.'
        : '';
      note.classList.toggle('hidden', !sugar);
    }
    placeLoop();
  }

  document.addEventListener('structure-tool', (event) => {
    toolOn = (event as CustomEvent<string | null>).detail === 'flip';
    render();
  });

  // ── a new structure from elsewhere starts afresh; ours is only redrawn ──
  const sameGraph = (a: Molecule, b: Molecule) =>
    a.atoms.length === b.atoms.length && a.bonds.length === b.bonds.length
    && a.atoms.every((atom, i) => atom.element === b.atoms[i].element)
    && a.bonds.every((bond, i) => bond.atom1Index === b.bonds[i].atom1Index && bond.atom2Index === b.bonds[i].atom2Index);

  const sceneBuilt = ctx.onSceneBuilt;
  ctx.onSceneBuilt = () => {
    sceneBuilt();
    const molecule = ctx.currentMolecule;
    if (!showing && molecule !== ours && molecule !== flip?.chosenOn) {
      ours = null;
      // the same ring stays chosen on the same molecule (an optimisation from here)
      const kept = flip && molecule && toolOn && sameGraph(flip.chosenOn, molecule) ? flip.ring[0] : null;
      token += 1;
      flip = null;
      refusal = null;
      if (kept !== null) choose(kept);
    }
    render();
  };

  // ── picking a ring in the scene ──
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(ATOM_LAYER);
  let pressed: { x: number; y: number } | null = null;
  container.addEventListener('pointerdown', (event) => { pressed = { x: event.clientX, y: event.clientY }; }, { capture: true });
  container.addEventListener('click', (event) => {
    if (!toolOn || !ctx.currentMolecule) return;
    // a click, not the end of a drag that turned the view
    if (pressed && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 4) return;
    const rect = container.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ), ctx.camera);
    const hit = raycaster.intersectObjects(ctx.moleculeGroup.children, true)[0]?.object;
    const data = hit?.userData as { atomIndex?: number; lobeType?: string; atom1Index?: number } | undefined;
    const atom = data?.atomIndex ?? (data?.lobeType === 'bond' ? data.atom1Index : undefined);
    if (atom !== undefined) choose(atom);
  });

  render();
}
