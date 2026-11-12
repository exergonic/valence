/**
 * The Hartree–Fock single point, as the Charge Model view offers it (decided
 * with the user 2026-11-11): choosing an HF charge set runs HF/def2-SVP at the
 * structure on screen, once, and the labels, the ESP surface and the dipole
 * follow to its density when it lands. Thermo's rule for long runs: the time
 * is estimated on this machine, a run of 15 s or less goes unasked, a longer
 * one waits for the button with the estimate on it, and a run shows its time
 * against the estimate and can be cancelled — which puts GFN2-xTB's charges
 * back, and leaves the button for another try.
 *
 * A transition-metal complex gets a plain note, not a refusal: Hartree–Fock
 * describes them less well than main-group molecules, and the student can see
 * where the method strains (the user's call).
 */
import type { SceneContext } from '../render';
import { isHfChargeModel } from '../render/setup';
import type { Molecule } from '../mol-parser';
import { cancelHf, hfSeconds, hfSinglePoint, HfCancelled, HF_METHOD } from '../geometry/hf-single-point';
import { espVmax } from '../chem/charge-model/esp';
import { isDBlock } from '../chem/elements';
import { ASK_ABOVE_SECONDS } from './long-runs';

const METAL_NOTE = 'A note: Hartree–Fock leaves out electron correlation, which matters more in a transition-metal '
  + 'complex than in a main-group molecule, so read this surface and these charges as a rougher guide.';

export function setupHfPanel(ctx: SceneContext): void {
  const select = document.getElementById('ctrl-charge-model') as HTMLSelectElement;
  const status = document.getElementById('hf-status')!;
  const button = document.getElementById('hf-compute') as HTMLButtonElement;
  const note = document.getElementById('hf-note')!;

  const estimates = new WeakMap<Molecule, Promise<number | null>>();
  // a cancelled structure waits for the button next time
  const declined = new WeakSet<Molecule>();
  let running: { molecule: Molecule; started: number; seconds: number; timer: number } | null = null;

  const say = (text: string) => {
    status.textContent = text;
    status.classList.toggle('hidden', text === '');
  };
  const showButton = (text: string | null) => {
    button.textContent = text ?? '';
    button.classList.toggle('hidden', text === null);
  };
  const about = (seconds: number) => `about ${Math.max(1, Math.round(seconds))} s`;

  /** The structure card's row for the run, when there is one. */
  const writeCardRow = () => {
    const facts = document.getElementById('structure-facts');
    if (!facts) return;
    facts.querySelector('[data-hf]')?.remove();
    const hf = ctx.hf && ctx.hf.molecule === ctx.currentMolecule ? ctx.hf.result : null;
    if (!hf) return;
    const row = document.createElement('div');
    row.className = 'data-row';
    row.dataset.hf = '';
    const dt = document.createElement('dt');
    dt.textContent = 'Hartree–Fock';
    const dd = document.createElement('dd');
    dd.textContent = `${HF_METHOD} single point (${hf.restricted ? 'RHF' : 'UHF'}, ${hf.basisFunctions} basis functions): `
      + `${hf.energy.toFixed(6).replace('-', '−')} Eh, in ${Math.round(hf.seconds)} s`;
    row.append(dt, dd);
    facts.append(row);
  };

  const fail = (molecule: Molecule, reason: string) => {
    ctx.hfFailed = { molecule, reason };
    ctx.rerender();
  };

  const run = async (molecule: Molecule, seconds: number) => {
    const started = performance.now();
    const tick = () => {
      say(`Computing ${HF_METHOD}: ${Math.round((performance.now() - started) / 1000)} s of ${about(seconds)}.`);
    };
    tick();
    running = { molecule, started, seconds, timer: window.setInterval(tick, 1000) };
    showButton('Cancel');
    try {
      const result = await hfSinglePoint(molecule);
      if (ctx.currentMolecule !== molecule) return;
      if (!result) {
        fail(molecule, 'its SCF gave no energy');
        return;
      }
      const esp = result.surface ? { ...result.surface, vmax: espVmax(Array.from(result.surface.potentials)) } : null;
      ctx.hf = { molecule, result, esp };
      ctx.hfFailed = null;
      ctx.rerender();
    } catch (err) {
      if (err instanceof HfCancelled) return;
      if (ctx.currentMolecule === molecule) fail(molecule, (err as Error)?.message ?? 'the engine failed');
    } finally {
      window.clearInterval(running?.timer);
      running = null;
      void update();
    }
  };

  const update = async () => {
    const molecule = ctx.currentMolecule;
    writeCardRow();
    const chosen = isHfChargeModel(ctx.display.chargeModel);
    note.textContent = METAL_NOTE;
    note.classList.toggle('hidden', !chosen || !molecule || !molecule.atoms.some((a) => isDBlock(a.element)));
    if (running) return; // its own tick says how it is going
    showButton(null);
    if (!molecule || !chosen) {
      say('');
      return;
    }
    if (ctx.hf?.molecule === molecule) {
      say('');
      return;
    }
    if (ctx.hfFailed?.molecule === molecule) {
      say(`Hartree–Fock could not be run for this molecule (${ctx.hfFailed.reason}), so GFN2-xTB’s ESP-fitted charges are shown.`);
      return;
    }
    say(`Estimating the time for ${HF_METHOD}…`);
    let estimate = estimates.get(molecule);
    if (!estimate) {
      estimate = hfSeconds(molecule).catch(() => null);
      estimates.set(molecule, estimate);
    }
    const seconds = await estimate;
    // the screen may have moved on while the engine loaded and measured
    if (running || ctx.currentMolecule !== molecule || !isHfChargeModel(ctx.display.chargeModel) || ctx.hf?.molecule === molecule) return;
    if (seconds === null) {
      fail(molecule, 'the engine could not set it up');
      return;
    }
    if (seconds > ASK_ABOVE_SECONDS || declined.has(molecule)) {
      say(declined.has(molecule)
        ? 'You cancelled it before, so this time it waits for you.'
        : `Over ${ASK_ABOVE_SECONDS} s on this machine, so it waits for you.`);
      showButton(`Compute ${HF_METHOD} — ${about(seconds)}`);
      return;
    }
    void run(molecule, seconds);
  };

  button.addEventListener('click', () => {
    if (running) {
      // stop the run, and put GFN2-xTB's charges back on screen
      declined.add(running.molecule);
      cancelHf();
      ctx.display.chargeModel = 'gfn2-esp';
      select.value = 'gfn2-esp';
      ctx.rerender();
      return;
    }
    const molecule = ctx.currentMolecule;
    const estimate = molecule ? estimates.get(molecule) : undefined;
    if (!molecule || !estimate) return;
    void estimate.then((seconds) => {
      if (seconds !== null && !running && ctx.currentMolecule === molecule) void run(molecule, seconds);
    });
  });

  // a new choice of charges, or a new structure, is looked at afresh
  select.addEventListener('change', () => void update());
  const sceneBuilt = ctx.onSceneBuilt;
  ctx.onSceneBuilt = () => {
    sceneBuilt();
    void update();
  };
}
