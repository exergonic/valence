/**
 * Kekulization of JSME's aromatic SMILES output → explicit single/double bonds.
 *
 * JSME's `smiles()` emits aromatic lower-case SMILES for rings it perceives
 * as aromatic — "c1ccc1" for a drawn cyclobutadiene. That encoding is
 * ambiguous for antiaromatic rings: PubChem and CIR both canonicalize the
 * aromatic 4-ring form to the SATURATED ring (cyclobutane, CID 9250) instead
 * of the drawn diene. (Avogadro, by contrast, emits an explicit "C1=CC=C1",
 * which resolves correctly.) This module rewrites monocyclic aromatic rings
 * into explicit Kekulé bonds so the SMILES that reaches PubChem
 * unambiguously encodes the drawn molecule.
 *
 * Design constraints:
 * - Non-aromatic SMILES pass through byte-for-byte unchanged.
 * - Only MONOCYCLIC aromatic components (a single cycle in which every atom
 *   is aromatic) are Kekulized. Genuine aromatics (benzene, pyridine,
 *   pyrrole, imidazole, phenol, furan, thiophene) become valid Kekulé forms;
 *   the antiaromatic 4-ring becomes the correct "C1=CC=C1".
 * - Fused / polycyclic or any ambiguous aromatic content is left untouched —
 *   that is current behavior, and genuine aromatics already resolve
 *   correctly at PubChem. The fetched-structure guard (validate-structure.ts)
 *   still catches any residual mismatch and falls back to the local pipeline.
 * - Any parse ambiguity, valence mismatch, or unsupported atom (charge,
 *   isotope, exotic element) falls back to returning the input unchanged —
 *   never a best-effort wrong molecule.
 */
export function kekulizeSmiles(smiles: string): string {
  // No aromatic atom (lowercase c/n/o/p/s/b) → nothing to Kekulize.
  if (!smiles || !/[bcnops]/.test(smiles)) return smiles;

  try {
    const parsed = parseGraph(smiles);
    if (!parsed) return smiles;

    const components = aromaticComponents(parsed);
    if (components.length === 0) return smiles;

    const edits: Edit[] = [];
    for (const comp of components) {
      const plan = kekulizeCycle(parsed, comp);
      if (!plan) return smiles; // any ring we cannot handle → hand back original
      edits.push(...plan);
    }
    return applyEdits(smiles, edits);
  } catch {
    return smiles;
  }
}

// ── SMILES tokenizer ─────────────────────────────────────────────────────────

interface AtomToken {
  kind: 'atom';
  start: number;
  end: number;
  element: string;
  aromatic: boolean;
  bracket: boolean;
  explicitH: number;
  clean: boolean;
}

type Token =
  | AtomToken
  | { kind: 'bond'; start: number; end: number; order: number }
  | { kind: 'open'; start: number; end: number }
  | { kind: 'close'; start: number; end: number }
  | { kind: 'dot'; start: number; end: number }
  | { kind: 'num'; start: number; end: number };

interface Edge {
  a: number;
  b: number;
  order: number; // 1/2/3 explicit; 4 = aromatic
  aromatic: boolean;
}

interface Parsed {
  atoms: AtomToken[];
  tokens: Token[];
  edges: Edge[];
}

// Two-letter elements JSME can emit — keeps "Cl"/"Br"/"Si" from being parsed
// as two one-letter atoms.
const TWO_LETTER = new Set([
  'Al', 'Ar', 'As', 'Ba', 'Be', 'Br', 'Ca', 'Cd', 'Cl', 'Co', 'Cr', 'Cu',
  'Fe', 'Ga', 'Ge', 'He', 'Ir', 'Kr', 'Li', 'Mg', 'Mn', 'Mo', 'Na', 'Nb',
  'Ne', 'Ni', 'Os', 'Pb', 'Pd', 'Pt', 'Rb', 'Rh', 'Ru', 'Sb', 'Sc', 'Se',
  'Si', 'Sn', 'Sr', 'Te', 'Ti', 'V', 'W', 'Xe', 'Zn', 'Zr',
]);

// Neutral valence for the elements that can appear in aromatic rings.
const VALENCE: Record<string, number> = {
  B: 3, C: 4, N: 3, O: 2, F: 1, Si: 4, P: 3, S: 2, Cl: 1, As: 3, Se: 2, Br: 1, I: 1,
};

function parseGraph(smiles: string): Parsed | null {
  const tokens = tokenize(smiles);
  if (!tokens) return null;

  const atoms: AtomToken[] = [];
  const edges: Edge[] = [];
  const ring = new Map<number, { idx: number; order: number }>();

  let prev: number | null = null;
  const stack: (number | null)[] = [];
  let pendingOrder = 1;
  let seenBond = false;

  const addEdge = (a: number, b: number, order: number) => {
    const aromatic =
      order === 4 && atoms[a].aromatic && atoms[b].aromatic;
    edges.push({
      a,
      b,
      order: aromatic ? 4 : order,
      aromatic,
    });
  };

  for (const tok of tokens) {
    switch (tok.kind) {
      case 'open':
        stack.push(prev);
        break;
      case 'close':
        prev = stack.pop() ?? null;
        break;
      case 'dot':
        prev = null;
        break;
      case 'bond':
        pendingOrder = tok.order ?? 1;
        seenBond = true;
        break;
      case 'num': {
        if (prev === null) return null;
        const digits = smiles.slice(tok.start, tok.end).replace('%', '');
        const n = parseInt(digits, 10);
        const open = ring.get(n);
        if (open) {
          addEdge(prev, open.idx, open.order);
          ring.delete(n);
        } else {
          ring.set(n, {
            idx: prev,
            order: atoms[prev].aromatic ? 4 : seenBond ? pendingOrder : 1,
          });
        }
        break;
      }
      case 'atom': {
        const idx = atoms.length;
        atoms.push(tok);
        if (prev !== null) {
          // No bond symbol between two aromatic atoms → aromatic bond.
          const order = seenBond
            ? pendingOrder
            : atoms[prev].aromatic && tok.aromatic
              ? 4
              : 1;
          addEdge(prev, idx, order);
        }
        prev = idx;
        seenBond = false;
        pendingOrder = 1;
        break;
      }
    }
  }

  if (ring.size > 0) return null; // unclosed ring closure
  return { atoms, tokens, edges };
}

function tokenize(smiles: string): Token[] | null {
  const toks: Token[] = [];
  let i = 0;
  while (i < smiles.length) {
    const ch = smiles[i];
    if (ch === '(' || ch === ')') {
      toks.push(ch === '(' ? { kind: 'open', start: i, end: i + 1 } : { kind: 'close', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '.') {
      toks.push({ kind: 'dot', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '-' || ch === '=' || ch === '#' || ch === ':' || ch === '/' || ch === '\\') {
      const order = ch === '=' ? 2 : ch === '#' ? 3 : ch === ':' ? 4 : 1;
      toks.push({ kind: 'bond', start: i, end: i + 1, order });
      i++;
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      const m = /^(\d|%\d{2})/.exec(smiles.slice(i));
      if (!m) return null;
      toks.push({ kind: 'num', start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (ch === '[') {
      const close = smiles.indexOf(']', i);
      if (close === -1) return null;
      const content = smiles.slice(i + 1, close);
      const m = /^(\d+)?([A-Za-z][a-z]?)(H\d?)?(.*)$/.exec(content);
      if (!m) return null;
      const element = m[2][0].toUpperCase() + m[2].slice(1);
      const clean = !m[1] && m[4] === ''; // no isotope, no charge
      const explicitH = m[3] ? (m[3] === 'H' ? 1 : parseInt(m[3].slice(1), 10)) : 0;
      toks.push({
        kind: 'atom', start: i, end: close + 1,
        element,
        aromatic: /[a-z]/.test(m[2]),
        bracket: true,
        explicitH,
        clean,
      });
      i = close + 1;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const two = smiles.slice(i, i + 2);
      let element: string;
      let end: number;
      if (
        /[A-Z]/.test(ch) && two.length === 2 && /[a-z]/.test(two[1]) && TWO_LETTER.has(two)
      ) {
        element = two; // Cl, Br, Si, ...
        end = i + 2;
      } else if (two === 'se' || two === 'as') {
        // Genuine lowercase two-letter aromatics (Se/As). Any other two-letter
        // combination collides with an element when upper-cased ("co"→Co,
        // "cs"→Cs) and must NOT merge — common aromatic pairs are single
        // letters (c, n, o, s, p, b).
        element = two;
        end = i + 2;
      } else {
        element = ch;
        end = i + 1;
      }
      toks.push({
        kind: 'atom', start: i, end,
        element: element[0].toUpperCase() + element.slice(1),
        aromatic: /[a-z]/.test(element[0]),
        bracket: false,
        explicitH: 0,
        clean: true,
      });
      i = end;
      continue;
    }
    return null; // unexpected character — do not touch the string
  }
  return toks;
}

// ── Aromatic component detection ─────────────────────────────────────────────

/** Maximal connected sets of aromatic atoms joined by aromatic bonds. */
function aromaticComponents(p: Parsed): number[][] {
  const adj = Array.from({ length: p.atoms.length }, () => [] as number[]);
  for (const e of p.edges) {
    if (e.aromatic) {
      adj[e.a].push(e.b);
      adj[e.b].push(e.a);
    }
  }

  const comps: number[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < p.atoms.length; i++) {
    if (seen.has(i) || !p.atoms[i].aromatic) continue;
    const comp: number[] = [];
    const queue = [i];
    seen.add(i);
    while (queue.length) {
      const c = queue.shift()!;
      comp.push(c);
      for (const nb of adj[c]) {
        if (!seen.has(nb) && p.atoms[nb].aromatic) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// ── Kekulé assignment ────────────────────────────────────────────────────────

interface Edit {
  start: number;
  end: number;
  text: string;
}

/**
 * Assign explicit bond orders to one monocyclic aromatic ring and produce the
 * edits that splice them in. Returns null when the component is not a single
 * cycle or has no valid Kekulé structure under the neutral-valence rules.
 */
function kekulizeCycle(p: Parsed, comp: number[]): Edit[] | null {
  const n = comp.length;
  if (n < 3) return null;

  // Aromatic-neighbor adjacency (only aromatic bonds).
  const aroAdj = new Map<number, number[]>();
  for (const e of p.edges) {
    if (!e.aromatic) continue;
    if (!aroAdj.has(e.a)) aroAdj.set(e.a, []);
    if (!aroAdj.has(e.b)) aroAdj.set(e.b, []);
    aroAdj.get(e.a)!.push(e.b);
    aroAdj.get(e.b)!.push(e.a);
  }
  for (const a of comp) {
    if ((aroAdj.get(a)?.length ?? 0) !== 2) return null; // fused / branched
  }

  // Traverse the cycle in order, starting at the leftmost atom (which carries
  // the ring-closure number in JSME's "c1...1" output).
  const order: number[] = [comp[0]];
  let prevAtom = comp[0];
  let curr = aroAdj.get(comp[0])![0];
  while (curr !== comp[0]) {
    order.push(curr);
    const nexts = aroAdj.get(curr)!.filter((x) => x !== prevAtom);
    if (nexts.length !== 1) return null;
    prevAtom = curr;
    curr = nexts[0];
  }
  if (order.length !== n) return null;

  // Ring double bonds each atom NEEDS (0 or 1) to reach neutral valence while
  // keeping its implicit hydrogens. Every ring atom already counts two σ ring
  // single bonds — hence the "- 2" — and h is the hydrogen count implied by
  // the aromatic SMILES form (explicit for "[nH]", else valence-driven).
  const need = order.map((a) => {
    const t = p.atoms[a];
    if (!t.clean || !t.aromatic) return -1;
    const valence = VALENCE[t.element];
    if (!valence) return -1;
    let nonAro = 0; // sum of non-aromatic incident bond orders
    for (const e of p.edges) {
      if ((e.a === a || e.b === a) && !e.aromatic) nonAro += e.order;
    }
    const implicitH = t.bracket
      ? t.explicitH
      : Math.max(0, valence - nonAro - 3); // each aromatic bond ≈ 1.5
    return valence - nonAro - 2 - implicitH;
  });
  if (need.some((x) => x < 0 || x > 1)) return null;

  // Parity propagation around the cycle: ring edge doubleEdge[i]
  // (order[i]→order[i+1]) is double iff
  // doubleEdge[i] + doubleEdge[i-1] == need[i]. Two seeds at most; prefer a
  // solution whose closure bond (doubleEdge[n-1]) is single — it reads
  // naturally in SMILES.
  const solve = (seed: number): number[] | null => {
    const doubleEdge: number[] = new Array(n).fill(0);
    doubleEdge[0] = seed;
    for (let i = 1; i < n; i++) doubleEdge[i] = need[i] - doubleEdge[i - 1];
    if (doubleEdge.some((v) => v < 0 || v > 1)) return null;
    if (doubleEdge[0] + doubleEdge[n - 1] !== need[0]) return null;
    return doubleEdge;
  };
  const s0 = solve(0);
  const s1 = solve(1);
  const doubleEdge =
    (s0 && s0[n - 1] === 0) ? s0 :
    (s1 && s1[n - 1] === 0) ? s1 :
    s0 ?? s1;
  if (!doubleEdge) return null;

  // Build the edits.
  const edits: Edit[] = [];
  for (let i = 0; i < n; i++) {
    const tok = p.atoms[order[i]];
    const element = tok.element.toUpperCase();
    const doubleIn = i > 0 && doubleEdge[i - 1] === 1;
    edits.push({
      start: tok.start,
      end: tok.end,
      text: (doubleIn ? '=' : '') + element,
    });
  }

  // Closure bond (order[n-1] → order[0]) double: mark it on the ring number
  // that follows the first atom: "c1…1" → "c=1…1".
  if (doubleEdge[n - 1] === 1) {
    const firstTok = p.atoms[order[0]];
    const numTok = p.tokens.find((t) => t.kind === 'num' && t.start === firstTok.end);
    if (!numTok) return null;
    edits.push({ start: firstTok.end, end: firstTok.end, text: '=' });
  }

  return edits;
}

/** Apply non-overlapping positional edits, right-to-left so offsets stay valid. */
function applyEdits(smiles: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = smiles;
  for (const e of sorted) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}
