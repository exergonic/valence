/**
 * The Thermo view's panel (decided with the user 2026-11-05): the molecule
 * vibrating, and its ideal-gas thermochemistry from those vibrations.
 *
 * The vibrations need a GFN2 minimum, so a structure without them — a fetched
 * conformer, a run that stopped short, anything above the optimiser's 16-atom
 * Hessian gate — is optimised and its Hessian computed, whatever its size
 * (jsme-panel's refineForVibrations: the minimum replaces the structure on
 * screen). Before that, the Hessian's time is estimated on this machine; at
 * 15 s or less it simply runs, and above it waits for the user's go-ahead,
 * the estimate on the button. A held structure, or GFN2's set-aside result,
 * is refused with the reason (ctx.noMinimum), at any size: neither is the
 * molecule drawn, and the fix is to draw the one meant.
 *
 * Once tried, a structure is not tried again on its own — a run that was
 * cancelled, or found no minimum, leaves the button for the user to press —
 * so a result without vibrations never sets off another run.
 *
 * The readout itself is thermo-readout.ts's; it is redrawn only when the
 * numbers change, so a formula or a fold the reader opened stays open while
 * the modes are played.
 */
import type { SceneContext } from '../render';
import type { Molecule } from '../mol-parser';
import { gfn2HessianSeconds } from '../geometry/gfn2-refine';
import type { NormalMode } from '../chem/gfn2-xtb/normal-modes';
import { refineForVibrations } from './jsme-panel';
import { drawThermoReadout, markPlayingMode } from './thermo-readout';

/** Above this estimate (seconds) the Hessian waits for a go-ahead: half the
 *  optimiser's budget, and as long as a lesson can wait unasked. */
const ASK_ABOVE_SECONDS = 15;

export interface ThermoPanel {
  /** The view was chosen: show what the structure has, or go and get it. */
  enter(): void;
  leave(): void;
}

export function setupThermoPanel(ctx: SceneContext): ThermoPanel {
  const status = document.getElementById('thermo-status')!;
  const compute = document.getElementById('thermo-compute') as HTMLButtonElement;
  const readout = document.getElementById('thermo-readout')!;

  let active = false;
  let running = false;
  const tried = new WeakSet<Molecule>();
  const estimates = new WeakMap<Molecule, Promise<number | null>>();

  const say = (text: string) => {
    status.textContent = text;
    status.classList.toggle('hidden', text === '');
  };

  const offer = (seconds: number, why: string) => {
    compute.textContent = `Compute vibrations — about ${Math.max(1, Math.round(seconds))} s`;
    compute.classList.remove('hidden');
    say(why);
  };

  const run = async (molecule: Molecule, seconds: number) => {
    running = true;
    tried.add(molecule);
    compute.classList.add('hidden');
    say('');
    try {
      await refineForVibrations(seconds);
    } finally {
      running = false;
      // whatever came back — a minimum, a held structure, the same structure
      // after a cancel — has had its try
      if (ctx.currentMolecule) tried.add(ctx.currentMolecule);
      void update();
    }
  };

  const update = async () => {
    if (!active || running) return;
    compute.classList.add('hidden');
    const molecule = ctx.currentMolecule;
    if (!molecule) {
      say('Build a molecule to see it vibrate.');
      return;
    }
    if (ctx.vibrations?.molecule === molecule) {
      say('');
      // the slowest mode first: the gentlest motion to watch, and the one that
      // carries the most entropy (modes come lowest first)
      if (ctx.display.vibrationIndex === null) {
        ctx.display.vibrationIndex = 0;
        ctx.rerender();
      }
      return;
    }
    if (molecule.atoms.length === 1) {
      say('A single atom has no vibrations: it only moves as a whole.');
      return;
    }
    if (ctx.noMinimum?.molecule === molecule) {
      say(ctx.noMinimum.reason);
      return;
    }
    say('Estimating the time for the vibrations…');
    let estimate = estimates.get(molecule);
    if (!estimate) {
      estimate = gfn2HessianSeconds(molecule).catch(() => null);
      estimates.set(molecule, estimate);
    }
    const seconds = await estimate;
    // the screen may have moved on while the engine was asked
    if (!active || running || ctx.currentMolecule !== molecule) return;
    if (seconds === null) {
      say('GFN2-xTB cannot compute vibrations for this structure.');
      return;
    }
    const optimisedFirst = 'GFN2-xTB optimises the structure first, and its minimum takes the place of the one on screen.';
    if (tried.has(molecule)) {
      offer(seconds, `No vibrations for this structure — the structure card in the header says why. ${optimisedFirst}`);
    } else if (seconds > ASK_ABOVE_SECONDS) {
      offer(seconds, `Over ${ASK_ABOVE_SECONDS} s on this machine, so it waits for you. ${optimisedFirst}`);
    } else {
      void run(molecule, seconds);
    }
  };

  compute.addEventListener('click', () => {
    const molecule = ctx.currentMolecule;
    const estimate = molecule ? estimates.get(molecule) : undefined;
    if (!molecule || !estimate || running) return;
    void estimate.then((seconds) => {
      if (seconds !== null && ctx.currentMolecule === molecule) void run(molecule, seconds);
    });
  });

  // the readout follows the vibrations the render layer synced; drawn anew
  // only for new numbers (the modes, or the single point's energy, arriving)
  let drawnFor: { modes: NormalMode[]; energy: number } | null = null;
  ctx.onVibrations = (thermochemistry, modes) => {
    readout.classList.toggle('hidden', !thermochemistry || !modes);
    if (!thermochemistry || !modes) {
      drawnFor = null;
      return;
    }
    if (drawnFor?.modes !== modes || drawnFor.energy !== thermochemistry.energy) {
      drawThermoReadout(readout, thermochemistry, (index) => {
        ctx.display.vibrationIndex = ctx.display.vibrationIndex === index ? null : index;
        ctx.rerender();
      });
      drawnFor = { modes, energy: thermochemistry.energy };
    }
    markPlayingMode(readout, ctx.display.vibrationIndex);
  };

  // a new structure while the view is open is entered afresh
  const sceneBuilt = ctx.onSceneBuilt;
  ctx.onSceneBuilt = () => {
    sceneBuilt();
    void update();
  };

  return {
    enter() {
      active = true;
      void update();
    },
    leave() {
      active = false;
      // the vibrations' controls are this view's, so one does not keep
      // playing where it cannot be stopped
      ctx.display.vibrationIndex = null;
      compute.classList.add('hidden');
      say('');
    },
  };
}
