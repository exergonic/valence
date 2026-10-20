/**
 * A normal mode, played: the atoms swing along the mode's displacements and
 * the bonds stretch and turn with them. The existing atom and bond meshes are
 * moved each frame — nothing is rebuilt — and the orbital pictures, labels
 * and surfaces step aside, since none of them would follow the atoms.
 *
 * Real vibrations are ~10¹³ Hz, so the speed is a picture, not a clock: the
 * period scales as 1/ν, so a stiff O–H stretch visibly beats faster than a
 * soft bend — the bond strength the frequency stands for.
 */
import * as THREE from 'three';
import type { SceneContext } from './setup';
import type { Molecule } from '../mol-parser';
import type { NormalMode } from '../chem/gfn2-xtb/normal-modes';
import type { Gfn2Properties } from '../geometry/gfn2-refine';
import { detectPointGroup } from '../geometry/symmetrize';
import { symmetryNumber, thermochemistry, type Thermochemistry } from '../chem/gfn2-xtb/thermochemistry';

/** The largest atom's swing, Å — enough to see, small enough to stay a bond. */
const AMPLITUDE = 0.25;
/** The period at 2000 cm⁻¹, seconds; other modes scale as 2000/ν. */
const PERIOD_AT_2000 = 0.8;

const UP = new THREE.Vector3(0, 1, 0);

/** Start (or restart, after a rebuild made new meshes) the selected mode. */
function startVibration(ctx: SceneContext, mode: NormalMode): void {
  const molecule = ctx.currentMolecule;
  if (!molecule) return;
  const base = molecule.atoms.map((a) => new THREE.Vector3(a.x, a.y, a.z));
  const swing = mode.displacements.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(AMPLITUDE));

  const atoms: Array<{ mesh: THREE.Object3D; index: number }> = [];
  const bonds: Array<{ mesh: THREE.Object3D; a: number; b: number; at: number; offset: THREE.Vector3; length: number }> = [];
  ctx.moleculeGroup.traverse((object) => {
    const data = object.userData as {
      lobeType?: string; atomIndex?: number; atom1Index?: number; atom2Index?: number; span?: [number, number];
    };
    if (data.lobeType === 'atom' && data.atomIndex !== undefined) {
      atoms.push({ mesh: object, index: data.atomIndex });
    } else if (data.lobeType === 'bond' && data.atom1Index !== undefined && data.atom2Index !== undefined) {
      // a mesh covers its stretch of the bond (a stick's half, or all of it),
      // and a double bond's cylinders sit off the axis: keep each one's offset
      const [from, to] = data.span ?? [0, 1];
      const at = (from + to) / 2;
      const centre = base[data.atom1Index].clone().lerp(base[data.atom2Index], at);
      bonds.push({
        mesh: object,
        a: data.atom1Index,
        b: data.atom2Index,
        at,
        offset: object.position.clone().sub(centre),
        length: base[data.atom1Index].distanceTo(base[data.atom2Index]),
      });
    }
  });

  // the atoms and bonds are the picture now, whatever the "Atoms & bonds"
  // toggle says; nothing else follows them, so nothing else is shown
  ctx.moleculeGroup.visible = true;
  for (const group of [ctx.orbitalGroup, ctx.labelGroup, ctx.orbitalLabelGroup, ctx.piSystemGroup, ctx.dipoleGroup, ctx.espGroup, ctx.moGroup]) {
    group.visible = false;
  }

  const period = PERIOD_AT_2000 * Math.min(4, Math.max(0.25, 2000 / Math.abs(mode.frequency || 2000)));
  const positions = base.map((p) => p.clone());
  ctx.frame.onFrame = (now) => {
    const s = Math.sin((2 * Math.PI * now) / (period * 1000));
    for (let i = 0; i < base.length; i++) positions[i].copy(base[i]).addScaledVector(swing[i], s);
    for (const { mesh, index } of atoms) mesh.position.copy(positions[index]);
    for (const bond of bonds) {
      const pa = positions[bond.a];
      const pb = positions[bond.b];
      const direction = pb.clone().sub(pa);
      const length = direction.length();
      if (length < 1e-6) continue;
      bond.mesh.position.copy(pa).lerp(pb, bond.at).add(bond.offset);
      bond.mesh.quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
      bond.mesh.scale.set(1, length / bond.length, 1);
    }
  };
}

/** Stop the animation. The rebuild that follows puts every mesh and the
 *  orbital groups back; the atom layer belongs to its own toggle, so it goes
 *  back to what that says. */
function stopVibration(ctx: SceneContext): void {
  if (!ctx.frame.onFrame) return;
  ctx.frame.onFrame = null;
  const toggle = document.getElementById('ctrl-show-mol') as HTMLInputElement | null;
  if (toggle) ctx.moleculeGroup.visible = toggle.checked;
}

/**
 * Keep the vibration control and the animation in step with the structure on
 * screen. The control lists the modes when the structure has them, and says
 * how to get them when it does not.
 */
export function syncVibration(ctx: SceneContext, properties: Gfn2Properties | null): void {
  const modes = ctx.vibrations && ctx.vibrations.molecule === ctx.currentMolecule ? ctx.vibrations.modes : null;
  writeThermochemistry(ctx.currentMolecule ? thermochemistryOf(ctx.currentMolecule, modes, properties) : null);
  if (!modes) ctx.display.vibrationIndex = null;
  const select = document.getElementById('ctrl-vibration') as HTMLSelectElement | null;
  if (select) {
    const options = ['<option value="">Off</option>', ...(modes ?? []).map((mode, i) =>
      `<option value="${i}">ν${i + 1} · ${mode.frequency < 0 ? `${Math.abs(mode.frequency).toFixed(0)}i` : mode.frequency.toFixed(0)} cm⁻¹</option>`)];
    const html = options.join('');
    if (select.dataset.options !== html) {
      select.innerHTML = html;
      select.dataset.options = html;
    }
    select.value = ctx.display.vibrationIndex === null ? '' : String(ctx.display.vibrationIndex);
    select.disabled = !modes || modes.length === 0;
    select.title = modes
      ? 'Play a vibration of this GFN2-xTB minimum: harmonic frequencies (cm⁻¹), semiempirical — typically within '
        + '5–10 % of experiment. The speed is a picture: a higher frequency beats faster.'
      : 'Vibrations come with a GFN2-xTB optimisation below 16 atoms: build the sketch locally, or press Refine.';
  }
  const index = ctx.display.vibrationIndex;
  if (modes && index !== null && modes[index]) startVibration(ctx, modes[index]);
  else stopVibration(ctx);
}

/**
 * The structure's thermochemistry at 298.15 K, 1 atm — when it has vibrations
 * (a GFN2 minimum below 16 atoms) and GFN2's single point has given its
 * energy; null otherwise. The symmetry number comes from the point group the
 * structure has; the spin, from the single point.
 */
export function thermochemistryOf(
  molecule: Molecule,
  modes: NormalMode[] | null,
  properties: Gfn2Properties | null,
): Thermochemistry | null {
  if (!modes || modes.length === 0 || !properties || properties.charges.length !== molecule.atoms.length) return null;
  return thermochemistry({
    atoms: molecule.atoms,
    frequencies: modes.map((mode) => mode.frequency),
    energy: properties.energy,
    multiplicity: properties.multiplicity,
    symmetryNumber: symmetryNumber(detectPointGroup(molecule)),
  });
}

const KCAL_PER_HARTREE = 627.5094740631;

/** The readout under the vibration control: the corrections in kcal/mol, the
 *  entropy in cal/(mol K) with its parts, the totals in Eh. */
function writeThermochemistry(result: Thermochemistry | null): void {
  const readout = document.getElementById('thermo-readout');
  if (!readout) return;
  readout.classList.toggle('hidden', !result);
  if (!result) {
    readout.innerHTML = '';
    return;
  }
  const kcal = (eh: number) => (eh * KCAL_PER_HARTREE).toFixed(2);
  const calPerK = (eh: number) => (eh * KCAL_PER_HARTREE * 1000).toFixed(2);
  const parts = result.entropyParts;
  const row = (term: string, value: string, unit: string, hint = '') =>
    `<dt${hint ? ` title="${hint}"` : ''}>${term}</dt><dd>${value}<span>${unit}</span></dd>`;
  readout.innerHTML = `<div class="thermo-head">Thermochemistry · ${result.temperature} K, 1 atm</div><dl>`
    + row('ZPE', kcal(result.zeroPoint), 'kcal/mol', 'Zero-point vibrational energy: ½hcν̃ summed over the modes')
    + row('H − E', kcal(result.enthalpyCorrection), 'kcal/mol', 'Zero-point, thermal (translation, rotation, vibration) and pV')
    + row('S', calPerK(result.entropy), 'cal/(mol·K)',
      `Translation ${calPerK(parts.translational)} · rotation ${calPerK(parts.rotational)} · vibration `
      + `${calPerK(parts.vibrational)}${parts.electronic > 0 ? ` · spin ${calPerK(parts.electronic)}` : ''}`)
    + row('G − E', kcal(result.freeEnergy - result.energy), 'kcal/mol', 'H − TS, less the electronic energy')
    + row('H', result.enthalpy.toFixed(6), 'Eh')
    + row('G', result.freeEnergy.toFixed(6), 'Eh')
    + '</dl>'
    + `<div class="thermo-note">σ = ${result.symmetryNumber}${result.linear ? ', linear' : ''}. Ideal gas, rigid rotor, `
    + 'harmonic oscillator (RRHO) on GFN2-xTB’s frequencies — semiempirical.'
    + (result.imaginary > 0 ? ` ${result.imaginary} imaginary mode${result.imaginary > 1 ? 's' : ''} left out: a saddle, not a minimum.` : '')
    + '</div>';
}
