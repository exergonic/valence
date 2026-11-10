/**
 * The hover tooltip: what is under the pointer, in the terms of the view on
 * screen (asked for 2026-10-21).
 *
 * - VSEPR: the lobe's atom and its hybrid ("O2 sp³"), the picture's own label.
 * - Charge Model: the electrostatic potential on the surface under the pointer,
 *   in kcal/mol per unit charge, and the atom nearest it.
 * - Localized orbitals: the orbital, and the hybrid it uses on the atom under
 *   the pointer — NBO's spᵡ from its s and p share there, so the VSEPR view's
 *   ideal sp² can be read against what GFN2's orbital has. With an anchor drawn,
 *   the E(2) between the anchor and this orbital.
 * - Delocalized orbitals: the MO, and what the lobe under the pointer is made
 *   of — the atom's s, p and d share of it, the LCAO picture made literal — and
 *   its phase.
 * - Thermo (asked for 2026-11-09): the vibration playing, hovered anywhere on
 *   the molecule — its share of the ZPE and of TS, its partition function
 *   read as Ault reads it (the molecules in all its levels per molecule in
 *   the ground state, so 1/q of them are there), a soft mode's quasi-RRHO
 *   split, and the hovered atom's share of its kinetic energy: why the stiff
 *   modes hold the zero-point energy and the soft ones the entropy, one mode
 *   at a time.
 */
import * as THREE from 'three';
import { ATOM_LAYER, type OrbitalTag, type SceneContext } from '../render';
import { shellPopulations } from '../chem/localized-orbitals/mulliken-populations';
import { kineticEnergyShares, type NormalMode } from '../chem/gfn2-xtb/normal-modes';
import { localizedType } from './mo-diagram';
import { ENERGY_UNIT, KCAL_PER_EV, formatEnergy } from './units';

const KCAL_PER_HARTREE = 627.5094740631;

/** e²/Å in kcal/mol: a potential of 1 e/Å is 332.06 kcal/mol per unit charge. */
const KCAL_PER_E_PER_ANGSTROM = 332.0637;

/** An atom counts as carrying the lobe under the pointer past this share of
 *  the orbital; of those, the nearest is named. A lone pair's lobe reaching
 *  over a hydrogen is still the oxygen's. */
const CARRIER_SHARE = 0.05;

/** Below this share of an atom's part, an angular type is absent from its
 *  hybrid: an s-free orbital is "p", not sp⁹⁹. */
const ABSENT_SHARE = 0.02;

export function setupTooltip(ctx: SceneContext, container: HTMLElement) {
  const tooltip = document.getElementById('tooltip')!;
  const raycaster = new THREE.Raycaster();
  // Atom meshes of the lit styles sit on the atom layer; picking must see them.
  raycaster.layers.enable(ATOM_LAYER);
  const mouse = new THREE.Vector2();

  const shown = (object: THREE.Object3D | null): boolean => {
    for (let o = object; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  const pickable = () => [ctx.orbitalGroup, ctx.moGroup, ctx.espGroup]
    .filter(shown)
    .flatMap((group) => group.children.filter((child) => child instanceof THREE.Mesh && child.visible
      && (child.userData.lobeType || child.userData.orbital)));

  // while a vibration plays, the moving atoms and bonds are what is hovered
  const vibrating = () => {
    const modes = ctx.vibrations?.molecule === ctx.currentMolecule ? ctx.vibrations?.modes : null;
    const index = ctx.display.vibrationIndex;
    return modes && index !== null && modes[index] ? { modes, index } : null;
  };
  const atomsAndBonds = () => {
    const meshes: THREE.Object3D[] = [];
    ctx.moleculeGroup.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.userData.lobeType === 'atom' || o.userData.lobeType === 'bond')) meshes.push(o);
    });
    return meshes;
  };

  const hide = () => {
    tooltip.classList.add('hidden');
    container.style.cursor = '';
  };

  container.addEventListener('pointerleave', hide);
  container.addEventListener('pointermove', (e) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const vibration = vibrating();
    const objects = vibration ? atomsAndBonds() : pickable();
    if (objects.length === 0 || !ctx.currentMolecule) { hide(); return; }

    raycaster.setFromCamera(mouse, ctx.camera);
    const hit = raycaster.intersectObjects(objects, false)[0];
    const lines = !hit ? []
      : vibration ? vibrationLines(ctx, vibration.modes, vibration.index, hit.object.userData.atomIndex ?? null)
      : describe(ctx, hit);
    if (lines.length === 0) { hide(); return; }

    tooltip.innerHTML = lines.join('<br>');
    tooltip.style.left = `${e.clientX + 14}px`;
    tooltip.style.top = `${e.clientY - 8}px`;
    tooltip.classList.remove('hidden');
    container.style.cursor = 'default';
  });
}

/** The tooltip's lines for what the ray hit, or none. */
function describe(ctx: SceneContext, hit: THREE.Intersection): string[] {
  const d = hit.object.userData;
  // the surfaces are built in the molecule's own coordinates
  const at = hit.object.worldToLocal(hit.point.clone());
  if (d.orbital) return orbitalLines(ctx, d.orbital as OrbitalTag, at, phaseAt(d.phases, hit));
  if (d.lobeType === 'esp') return espLines(ctx, hit, at);

  const idx = d.atomIndex !== undefined ? d.atomIndex + 1 : '';
  if (d.lobeType === '1s') return [`${d.element}${idx} 1s`];
  if (d.lobeType === 'pi') return [`${d.element}${idx} p`];
  if (d.lobeType === 'valence_s' || d.lobeType === 'sigma' || d.lobeType === 'lone_pair') return [`${d.element}${idx} ${d.label}`];
  return [];
}

/** The vibration playing: what it holds of the ZPE and of TS, and why; with
 *  an atom hovered, that atom's part in it. */
function vibrationLines(ctx: SceneContext, modes: NormalMode[], index: number, atom: number | null): string[] {
  const molecule = ctx.currentMolecule!;
  const t = ctx.thermochemistry;
  const share = t?.modes.find((m) => m.index === index);
  const which = `vibration ${index + 1} of ${modes.length}`;
  const lines: string[] = [];
  if (!t || !share) {
    // GFN2's energy not in yet, or a saddle's downhill mode, which has no
    // harmonic partition function and is left out of the sums
    const frequency = modes[index].frequency;
    lines.push(`ν̃ ${Math.abs(frequency).toFixed(0)}${frequency < 0 ? 'i' : ''} cm⁻¹ · ${which}`);
    if (frequency < 0 && t) lines.push('imaginary: a way downhill, left out of the thermochemistry');
  } else {
    const T = t.temperature;
    const kcal = (eh: number) => (eh * KCAL_PER_HARTREE).toFixed(2);
    const q = share.partitionFunction;
    lines.push(`ν̃ ${share.wavenumber.toFixed(0)}${share.inverted ? 'i' : ''} cm⁻¹ · ${which}`
      + (share.inverted ? ' · counted as real' : ''));
    lines.push(`½hcν̃ ${kcal(share.zeroPoint)} kcal/mol · ${percent(share.zeroPoint / t.zeroPoint)} of the ZPE`);
    lines.push(`TS ${kcal(T * share.entropy)} kcal/mol · ${percent(share.entropy / t.entropyParts.vibrational)} of the vibrational TS`);
    const ground = percent(1 / q);
    lines.push(`q = ${q.toFixed(2)}: ${ground} of molecules in the ground state`
      + (ground === '100%' ? '' : ', the rest spread over higher levels'));
    // a mode soft enough for quasi-RRHO to take part of its entropy from the free rotor
    if (share.harmonicWeight < 0.995) {
      lines.push(`its entropy ${percent(share.harmonicWeight)} oscillator, ${percent(1 - share.harmonicWeight)} free rotor (quasi-RRHO)`);
    }
  }
  if (atom !== null) {
    lines.push(`${atomName(ctx, atom)} carries ${percent(kineticEnergyShares(molecule.atoms, modes[index])[atom])} of its kinetic energy`);
  }
  return lines;
}

/** A share as a whole percentage; a trace says so rather than "0%". */
const percent = (x: number) => (x > 0 && x < 0.005 ? '<1%' : `${Math.round(x * 100)}%`);

/** The potential on the ESP surface under the pointer, interpolated across the
 *  face it falls in, and the atom nearest. */
function espLines(ctx: SceneContext, hit: THREE.Intersection, at: THREE.Vector3): string[] {
  const potentials = hit.object.userData.potentials as Float32Array | undefined;
  const face = hit.face;
  const position = (hit.object as THREE.Mesh).geometry.getAttribute('position');
  if (!potentials || !face || !position) return [];
  const corner = (k: number) => new THREE.Vector3().fromBufferAttribute(position, k);
  const weights = THREE.Triangle.getBarycoord(at, corner(face.a), corner(face.b), corner(face.c), new THREE.Vector3());
  if (!weights) return [];
  const potential = weights.x * potentials[face.a] + weights.y * potentials[face.b] + weights.z * potentials[face.c];
  const kcal = potential * KCAL_PER_E_PER_ANGSTROM;
  const atom = nearestAtom(ctx, at, null);
  return [
    `ESP ${signed(kcal, 1)} kcal/mol`,
    `${kcal < 0 ? 'electron-rich' : 'electron-poor'} · nearest ${atomName(ctx, atom)}`,
  ];
}

function orbitalLines(ctx: SceneContext, tag: OrbitalTag, at: THREE.Vector3, phase: string | null): string[] {
  const molecule = ctx.currentMolecule!;
  const coefficients = tag.kind === 'localized' ? tag.list.orbitals?.[tag.index]?.coefficients : tag.coefficients;
  const basis = tag.kind === 'localized' ? tag.list.basis : tag.basis;
  if (!coefficients) return [];
  const shells = shellPopulations(coefficients, tag.overlap, basis, molecule.atoms.length);
  const totals = shells.map(({ s, p, d }) => s + p + d);
  const atom = nearestAtom(ctx, at, totals);
  // a Mulliken share can stray a point past 0–100 %; the reader is told the part, not the artefact
  const share = `${Math.round(Math.min(1, Math.max(0, totals[atom])) * 100)}%`;

  if (tag.kind === 'localized') {
    const orbital = tag.list.orbitals![tag.index];
    const lines = [
      localizedType(molecule, orbital),
      `on ${atomName(ctx, atom)}: ${hybrid(shells[atom])} · ${share} of it`,
    ];
    const donation = donationLine(ctx, tag);
    if (donation) lines.push(donation);
    return lines;
  }

  const frontier = tag.frontier ? ` · ${tag.frontier}` : '';
  const label = tag.label ? ` · ${tag.label}` : '';
  return [
    `MO ${tag.number}${label} · ${formatEnergy(tag.energy)} ${ENERGY_UNIT}${frontier}`,
    `this lobe: ${atomName(ctx, atom)}, ${composition(shells[atom])} · ${share} of the MO`
      + (phase ? ` · ${phase} phase` : ''),
  ];
}

/** The E(2) between the anchor (the first orbital drawn) and this one, when
 *  the list has donations and the pair has one worth saying. */
function donationLine(ctx: SceneContext, tag: Extract<OrbitalTag, { kind: 'localized' }>): string | null {
  const anchor = ctx.display.localizedSelection[0];
  const orbitals = tag.list.orbitals;
  if (anchor === undefined || anchor === tag.index || !tag.list.donation || !orbitals?.[anchor]) return null;
  const kcal = tag.list.donation[anchor][tag.index] * KCAL_PER_EV;
  if (kcal < 0.05) return null;
  const molecule = ctx.currentMolecule!;
  const [donor, acceptor] = orbitals[anchor].occupied ? [anchor, tag.index] : [tag.index, anchor];
  return `E(2) ${localizedType(molecule, orbitals[donor])} → ${localizedType(molecule, orbitals[acceptor])}: `
    + `${kcal.toFixed(1)} kcal/mol`;
}

/** NBO's hybrid notation for an atom's part of an orbital: spᵡ with λ = p/s,
 *  and dᵘ with μ = d/s when the d counts; "s" or "p" when the other is absent. */
function hybrid({ s, p, d }: { s: number; p: number; d: number }): string {
  [s, p, d] = [s, p, d].map((x) => Math.max(0, x));
  const total = s + p + d;
  if (total <= 0) return '—';
  const sAbsent = s / total < ABSENT_SHARE;
  const pAbsent = p / total < ABSENT_SHARE;
  const dPresent = d / total >= ABSENT_SHARE;
  if (sAbsent) return pAbsent ? 'd' : dPresent ? `pd<sup>${exponent(d / p)}</sup>` : 'p';
  const pPart = pAbsent ? '' : `p<sup>${exponent(p / s)}</sup>`;
  const dPart = dPresent ? `d<sup>${exponent(d / s)}</sup>` : '';
  return `s${pPart}${dPart}`;
}

/** An atom's part as its shells: "s 21% + p 52%". */
function composition({ s, p, d }: { s: number; p: number; d: number }): string {
  const parts = ([['s', s], ['p', p], ['d', d]] as const)
    .filter(([, x]) => x >= 0.005)
    .map(([name, x]) => `${name} ${Math.round(x * 100)}%`);
  return parts.length > 0 ? parts.join(' + ') : 'nothing';
}

const exponent = (x: number) => (x < 10 ? x.toFixed(1) : x.toFixed(0));

/** The nearest atom to the point; with shares given, the nearest of the atoms
 *  carrying the orbital, else the largest carrier. */
function nearestAtom(ctx: SceneContext, at: THREE.Vector3, shares: number[] | null): number {
  const atoms = ctx.currentMolecule!.atoms;
  const carriers = atoms.map((_, i) => i).filter((i) => !shares || shares[i] > CARRIER_SHARE);
  if (carriers.length === 0 && shares) return shares.indexOf(Math.max(...shares));
  let best = carriers[0];
  let bestDistance = Infinity;
  for (const i of carriers) {
    const distance = at.distanceTo(new THREE.Vector3(atoms[i].x, atoms[i].y, atoms[i].z));
    if (distance < bestDistance) [best, bestDistance] = [i, distance];
  }
  return best;
}

const atomName = (ctx: SceneContext, atom: number) => `${ctx.currentMolecule!.atoms[atom].element}${atom + 1}`;

/** The sign of ψ on the surface under the pointer: the phase of the face's
 *  first corner (a face never straddles the node — ψ is ± the level on it). */
function phaseAt(phases: Float32Array | Int8Array | number[] | undefined, hit: THREE.Intersection): string | null {
  if (!phases || !hit.face) return null;
  return phases[hit.face.a] > 0 ? '+' : '−';
}

const signed = (x: number, digits: number) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(digits)}`;
