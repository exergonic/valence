/**
 * The Thermo view's readout (asked for 2026-11-05: the old list of nine
 * numbers in three units was hard to parse, even for the teacher). Clean at
 * first sight, more the deeper one digs, rigorous all the way down:
 *
 *   - a ledger that builds G from E, every row in kcal/mol above E, each step
 *     a bar to scale: + ZPE, + the thermal energy, = U, + pV, = H, − TS, = G.
 *     E is the ledger's zero, with GFN2's own energy in hartrees beside it in
 *     plain sight, so the zero explains itself (2026-11-05: absolute totals
 *     and "E + 67.13" were both tried live; one unit and one zero read best).
 *     The "=" rows carry their defining relation; a click on a "+" or "−"
 *     row opens its statistical-mechanics formula, kept out of sight so a
 *     general-chemistry class is not met with partition functions;
 *   - where the entropy lives: translation, rotation, vibration (and spin);
 *   - where the heat capacity lives, the same way (2026-11-10, the user's
 *     order in a lesson: the total, where it lives, then each vibration);
 *   - the vibrations, each with its share of the ZPE and of TS and its heat
 *     capacity in units of R — the stiff bonds hold the zero-point energy and
 *     are frozen (C ≈ 0), the soft motions hold the entropy and take up heat
 *     (C → R) — the softest and stiffest few shown, the rest folded away; a
 *     click plays one;
 *   - folded away: the absolute energies in hartrees, and the model.
 *
 * What is drawn is what thermochemistry.ts computed; the sums on screen are
 * exact (tests/thermochemistry.test.ts, "the ledger … adds up").
 */
import { GAS_CONSTANT_HARTREE_PER_K, type ModeShare, type Thermochemistry } from '../chem/gfn2-xtb/thermochemistry';

const KCAL_PER_HARTREE = 627.5094740631;
/** Modes shown at each end of the table before the rest fold away. */
const SOFTEST_SHOWN = 4;
const STIFFEST_SHOWN = 3;

const kcal = (eh: number) => (eh * KCAL_PER_HARTREE).toFixed(2);
const calPerK = (ehPerK: number) => (ehPerK * KCAL_PER_HARTREE * 1000).toFixed(2);

interface LedgerRow {
  sign: '' | '+' | '−' | '=';
  term: string;
  says: string;
  /** kcal/mol above E, formatted. */
  value: string;
  /** The bar: from and to, kcal/mol above E; absent on a total. */
  bar?: { from: number; to: number; loss?: boolean };
  /** The relation an "=" row always shows, or the formula behind a click. */
  relation?: string;
  formula?: string[];
}

function ledgerRows(t: Thermochemistry, modeCount: number): LedgerRow[] {
  const k = (eh: number) => eh * KCAL_PER_HARTREE;
  const zpe = k(t.zeroPoint);
  const parts = t.thermalParts;
  const thermal = k(parts.translational + parts.rotational + parts.vibrational);
  const u = k(t.internalEnergy - t.energy);
  const h = k(t.enthalpy - t.energy);
  const g = k(t.freeEnergy - t.energy);
  // A true minus sign: a tiny molecule's TS can outweigh its ZPE, leaving G below E.
  const minus = (text: string) => text.replace('-', '−');
  const step = (kcalPerMol: number) => minus(kcalPerMol.toFixed(2));
  const rotation = t.linear ? 'RT (linear: two axes)' : '³⁄₂RT';
  return [
    {
      sign: '', term: 'E', says: `electronic energy, ${minus(t.energy.toFixed(6))} Eh: the zero of this ledger`,
      value: step(0),
      formula: ['GFN2-xTB’s energy at this minimum: the atoms at rest at the bottom of the well.',
        'Semiempirical, and meaningful only in differences: with an isomer, a conformer. '
          + 'Every row below is kcal/mol above it; add it back for an absolute energy.'],
    },
    {
      sign: '+', term: 'ZPE', says: 'zero-point energy: no vibration ever stops', value: step(zpe), bar: { from: 0, to: zpe },
      formula: [`ZPE = Σ ½hcν̃, over the ${modeCount} vibrations — the ½hcν̃ column below`],
    },
    {
      sign: '+', term: 'E<sub>thermal</sub>',
      says: `motion at ${t.temperature} K: translation ${kcal(parts.translational)}, rotation ${kcal(parts.rotational)}, `
        + `vibration ${kcal(parts.vibrational)}`,
      value: step(thermal), bar: { from: zpe, to: u },
      formula: ['translation  ³⁄₂RT', `rotation  ${rotation}`, 'vibration  Σ hcν̃ / (e<sup>hcν̃/kT</sup> − 1)'],
    },
    { sign: '=', term: 'U', says: 'internal energy', value: step(u), relation: 'U = E + ZPE + E<sub>thermal</sub>' },
    {
      sign: '+', term: 'pV', says: 'making room against the atmosphere', value: step(h - u), bar: { from: u, to: h },
      formula: ['pV = nRT: RT for a mole of ideal gas'],
    },
    { sign: '=', term: 'H', says: 'enthalpy', value: step(h), relation: 'H = U + pV' },
    {
      sign: '−', term: 'TS', says: `${t.temperature} K × ${calPerK(t.entropy)} cal/(mol·K)`, value: step(h - g),
      bar: { from: g, to: h, loss: true },
      formula: [
        'S = S<sub>trans</sub> + S<sub>rot</sub> + S<sub>vib</sub> + S<sub>spin</sub>',
        'S<sub>trans</sub> = R [ln((2πmkT/h²)<sup>3/2</sup> kT/p) + 5/2]  (Sackur–Tetrode)',
        t.linear
          ? `S<sub>rot</sub> = R [ln(T / σΘ) + 1],  σ = ${t.symmetryNumber}`
          : `S<sub>rot</sub> = R [ln(√π/σ · √(T³/Θ<sub>A</sub>Θ<sub>B</sub>Θ<sub>C</sub>)) + 3/2],  σ = ${t.symmetryNumber}`,
        'S<sub>vib</sub> = Σ [w S<sub>HO</sub> + (1 − w) S<sub>FR</sub>],  w = 1 / (1 + (50 cm⁻¹ / ν̃)⁴)  (quasi-RRHO)',
        'S<sub>HO</sub> = R [x / (eˣ − 1) − ln(1 − e⁻ˣ)],  x = hcν̃/kT',
        'S<sub>FR</sub> = R [½ + ln √(8π³μ′kT/h²)],  μ′ = μI<sub>av</sub>/(μ + I<sub>av</sub>),  μ = h/(8π²cν̃)',
        'S<sub>spin</sub> = R ln(2S + 1)',
      ],
    },
    { sign: '=', term: 'G', says: 'free energy', value: step(g), relation: 'G = H − TS' },
  ];
}

function ledgerHtml(t: Thermochemistry, modeCount: number): string {
  const rows = ledgerRows(t, modeCount);
  // The track runs from E (or from G, when TS takes it below E) to the top.
  const low = Math.min(0, ...rows.map((r) => r.bar?.from ?? 0));
  const span = Math.max(...rows.map((r) => r.bar?.to ?? 0)) - low || 1e-9;
  return rows.map((row, i) => {
    const bar = row.bar
      ? `<span class="ledger-track"><span class="ledger-bar${row.bar.loss ? ' loss' : ''}" style="left:${((row.bar.from - low) / span) * 100}%;`
        + `width:${Math.max(0.5, ((row.bar.to - row.bar.from) / span) * 100)}%"></span></span>`
      : '';
    const head = `<span class="ledger-sign">${row.sign}</span><span class="ledger-term">${row.term}</span>`
      + `<span class="ledger-value">${row.value}</span><span class="ledger-says">${row.says}</span>${bar}`;
    if (row.relation) {
      return `<div class="ledger-row total">${head}<span class="ledger-relation">${row.relation}</span></div>`;
    }
    const formula = (row.formula ?? []).map((line) => `<span>${line}</span>`).join('');
    return `<button class="ledger-row" data-formula="${i}" aria-expanded="false">${head}</button>`
      + `<div class="ledger-formula hidden" data-formula-of="${i}">${formula}</div>`;
  }).join('');
}

/** A quantity in cal/(mol·K) split by motion: a bar to scale and its labels.
 *  The entropy's and the heat capacity's, so the two read alike. */
function partsHtml(heading: string, kind: 'entropy' | 'heat-capacity', parts: Array<[string, number]>): string {
  const shown = parts.filter(([, x]) => x > 0);
  const total = shown.reduce((sum, [, x]) => sum + x, 0);
  // widths as percentages: the parts are ~10⁻⁵ Eh/K, and flex-grow values
  // summing below 1 hand out only that fraction of the bar
  const segments = shown.map(([name, x], i) =>
    `<span class="motion-part ${kind} part-${i}" style="width:${(x / total) * 100}%" title="${name} ${calPerK(x)} cal/(mol·K)"></span>`).join('');
  const labels = shown.map(([name, x], i) =>
    `<span><i class="motion-key ${kind} part-${i}"></i>${name} ${calPerK(x)}</span>`).join('');
  return `<div class="thermo-subhead">${heading}</div>`
    + `<div class="motion-bar">${segments}</div><div class="motion-labels">${labels}</div>`;
}

function entropyHtml(t: Thermochemistry): string {
  return partsHtml(`Where the entropy lives · S = ${calPerK(t.entropy)} cal/(mol·K)`, 'entropy', [
    ['translation', t.entropyParts.translational],
    ['rotation', t.entropyParts.rotational],
    ['vibration', t.entropyParts.vibrational],
    ['spin', t.entropyParts.electronic],
  ]);
}

function heatCapacityHtml(t: Thermochemistry): string {
  return partsHtml(`Where the heat capacity lives · C<sub>p</sub> = ${calPerK(t.heatCapacity)} cal/(mol·K)`, 'heat-capacity', [
    ['translation', t.heatCapacityParts.translational],
    ['rotation', t.heatCapacityParts.rotational],
    ['vibration', t.heatCapacityParts.vibrational],
  ]);
}

/** A heat capacity in units of R: 0 for a frozen mode, 1 for a classical one. */
const inR = (ehPerK: number) => (ehPerK / GAS_CONSTANT_HARTREE_PER_K).toFixed(2);

function modeRow(share: ModeShare, temperature: number): string {
  const wavenumber = `${share.wavenumber.toFixed(0)}${share.inverted ? 'i' : ''}`;
  const title = share.inverted
    ? ' title="An imaginary mode above 20i cm⁻¹ — a methyl rotor not quite settled — counted as real, as xtb counts it."'
    : '';
  return `<button class="mode-row" data-mode="${share.index}"${title}><span>${wavenumber}</span>`
    + `<span>${kcal(share.zeroPoint)}</span><span>${kcal(temperature * share.entropy)}</span>`
    + `<span>${inR(share.heatCapacity)}</span></button>`;
}

function modesHtml(t: Thermochemistry): string {
  const modes = t.modes;
  const row = (share: ModeShare) => modeRow(share, t.temperature);
  const folded = modes.length > SOFTEST_SHOWN + STIFFEST_SHOWN + 1;
  const head = '<div class="mode-head"><span>ν̃, cm⁻¹</span><span>½hcν̃</span><span>TS</span><span>C<sub>p</sub>/R</span></div>';
  const body = folded
    ? modes.slice(0, SOFTEST_SHOWN).map(row).join('')
      + `<details class="mode-fold"><summary>${modes.length - SOFTEST_SHOWN - STIFFEST_SHOWN} more vibrations</summary>`
      + modes.slice(SOFTEST_SHOWN, -STIFFEST_SHOWN).map(row).join('') + '</details>'
      + modes.slice(-STIFFEST_SHOWN).map(row).join('')
    : modes.map(row).join('');
  const sum = `<div class="mode-sum"><span>Σ, ${modes.length} modes</span><span>${kcal(t.zeroPoint)}</span>`
    + `<span>${kcal(t.temperature * t.entropyParts.vibrational)}</span><span>${inR(t.heatCapacityParts.vibrational)}</span></div>`;
  return '<div class="thermo-subhead">Vibrations · ½hcν̃ and TS in kcal/mol; C<sub>p</sub> in units of R, '
    + '0 frozen to 1 classical · click one to play it, hover the molecule for more</div>'
    + `${head}${body}${sum}`;
}

function foldedHtml(t: Thermochemistry): string {
  const notes = [
    t.invertedImaginary > 0
      ? `${t.invertedImaginary} imaginary mode${t.invertedImaginary > 1 ? 's' : ''} above 20i cm⁻¹ counted as real: `
        + 'a methyl rotor not quite settled, as xtb counts it.'
      : '',
    t.imaginary > 0 ? `${t.imaginary} imaginary mode${t.imaginary > 1 ? 's' : ''} left out: a saddle, not a minimum.` : '',
  ].filter(Boolean).map((note) => `<p>${note}</p>`).join('');
  return '<details class="thermo-fold"><summary>Totals, in hartrees</summary><dl>'
    + `<dt>E</dt><dd>${t.energy.toFixed(6)}</dd><dt>U</dt><dd>${t.internalEnergy.toFixed(6)}</dd>`
    + `<dt>H</dt><dd>${t.enthalpy.toFixed(6)}</dd><dt>G</dt><dd>${t.freeEnergy.toFixed(6)}</dd></dl>`
    + '<p>An absolute energy compares only with another of the same atoms: an isomer, a conformer.</p></details>'
    + '<details class="thermo-fold"><summary>The model</summary>'
    + `<p>${t.temperature} K, 1 atm, a mole of ideal gas. Rigid rotor (σ = ${t.symmetryNumber}${t.linear ? ', linear' : ''}), `
    + 'harmonic oscillator, a soft mode’s entropy and heat capacity tending to a free rotor’s (quasi-RRHO, 50 cm⁻¹, as xtb). '
    + 'C<sub>p</sub> counts translation’s 3/2 R with the R of pV, as xtb and MolCalc book it. '
    + 'On GFN2-xTB’s frequencies: semiempirical, typically within 5–10 % of experiment.</p>'
    + `${notes}</details>`;
}

/** Draw the readout for a structure's thermochemistry. `onPlay` is called
 *  with a mode's index (into the structure's normal modes) when its row is
 *  clicked. */
export function drawThermoReadout(el: HTMLElement, t: Thermochemistry, onPlay: (index: number) => void): void {
  el.innerHTML = `<div class="thermo-subhead">Building G from E · kcal/mol above E · click a step for its formula</div>`
    + `<div class="ledger">${ledgerHtml(t, t.modes.length)}</div>`
    + entropyHtml(t) + heatCapacityHtml(t) + modesHtml(t) + foldedHtml(t);
  el.querySelectorAll<HTMLButtonElement>('.ledger-row[data-formula]').forEach((row) => {
    row.addEventListener('click', () => {
      const formula = el.querySelector(`[data-formula-of="${row.dataset.formula}"]`);
      const open = formula?.classList.toggle('hidden') === false;
      row.setAttribute('aria-expanded', String(open));
    });
  });
  el.querySelectorAll<HTMLButtonElement>('.mode-row').forEach((row) => {
    row.addEventListener('click', () => onPlay(Number(row.dataset.mode)));
  });
}

/** Mark the mode playing (or none), opening the fold if it is hidden there. */
export function markPlayingMode(el: HTMLElement, index: number | null): void {
  el.querySelectorAll<HTMLElement>('.mode-row').forEach((row) => {
    const playing = Number(row.dataset.mode) === index;
    row.classList.toggle('playing', playing);
    if (playing) row.closest('details')?.setAttribute('open', '');
  });
}
