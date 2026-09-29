/**
 * Regenerate the extended-Hückel fixtures from the YAeHMOP oracle.
 *
 *   bun run scripts/eht-fixtures.ts            # uses `ssh lenovo`
 *
 * The oracle is YAeHMOP `bind` 3.1.0b2 built from source on lenovo
 * (~/yaehmop/tightbind/bind). For each molecule this writes a bind input,
 * runs it there, pulls the output back and distills the printed matrices
 * into tests/references/eht/eht-reference.json — the file
 * tests/extended-huckel.test.ts pins S, H and the orbital ladder against.
 *
 * Two things the inputs must get right, both learned the hard way:
 *  - `nonweighted`, because bind defaults to the ABTH-weighted Hij form while
 *    the app (per PLAN.md) uses Hoffmann's plain K = 1.75;
 *  - the coordinates are the molecule ALIGNED to its principal axes, because
 *    that is the frame the solver runs in (see
 *    src/chem/extended-huckel/align-principal-axes.ts). Feed the oracle the
 *    same geometry or the comparison is meaningless.
 *
 * The raw `.out` files are committed beside the JSON as the provenance.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseMolBlock, type Molecule } from '../src/mol-parser';
import { EXAMPLES } from '../src/ui/examples';
import { alignToPrincipalAxes } from '../src/chem/extended-huckel/align-principal-axes';

const DIR = 'tests/references/eht';
const REMOTE = '/tmp/ehtfixtures';
const CHOSEN = ['Water (H₂O)', 'Methane (CH₄)', 'Ethene (C₂H₄)', 'Ethyne (C₂H₂)', 'Benzene (C₆H₆)', 'Nitrogen (N₂)'];
const VALENCE: Record<string, number> = { H: 1, C: 4, N: 5, O: 6, F: 7, P: 5, S: 6, Cl: 7 };

interface Prepared {
  name: string;
  slug: string;
  atoms: Array<{ element: string; x: number; y: number; z: number }>;
  electrons: number;
}

const prepared: Prepared[] = CHOSEN.map((name) => {
  const example = EXAMPLES.find((e) => e.name === name);
  if (!example) throw new Error(`example not found: ${name}`);
  const molecule = parseMolBlock(example.mol);
  const electrons = molecule.atoms.reduce((s, a) => s + (VALENCE[a.element] ?? 0), 0);
  // the frame the solver will run in
  const frame = alignToPrincipalAxes(molecule);
  return {
    name,
    slug: name.replace(/[^A-Za-z0-9]/g, '').toLowerCase(),
    atoms: frame.atoms.map((a) => ({ element: a.element, x: a.x, y: a.y, z: a.z })),
    electrons,
  };
});

// ── inputs ────────────────────────────────────────────────────────────────
const inputFor = (m: Prepared): string => {
  const lines = [m.slug, 'geometry', String(m.atoms.length)];
  m.atoms.forEach((a, i) => lines.push(`${i + 1} ${a.element} ${a.x.toFixed(6)} ${a.y.toFixed(6)} ${a.z.toFixed(6)}`));
  lines.push('electrons', String(m.electrons), 'molecular', 'nonweighted');
  lines.push('printing', 'overlap', 'hamil', 'wave functions', 'orbital mapping', 'end_print');
  return lines.join('\n') + '\n';
};
for (const m of prepared) writeFileSync(`${DIR}/${m.slug}.in`, inputFor(m));
console.log(`wrote ${prepared.length} inputs (aligned to the principal axes)`);

// ── oracle run ────────────────────────────────────────────────────────────
const runner = `set -e
cd ${REMOTE}
for f in *.in; do
  ~/yaehmop/tightbind/bind "$f" >/dev/null 2>&1 || echo "bind failed: $f"
done
echo "outputs: $(ls *.out 2>/dev/null | wc -l)"
`;
writeFileSync(`${DIR}/.run-oracle.sh`, runner);
const push = await Bun.$`ssh lenovo ${`rm -rf ${REMOTE} && mkdir -p ${REMOTE}`}`.nothrow().quiet();
if (push.exitCode !== 0) throw new Error(`ssh lenovo failed: ${push.stderr.toString()}`);
for (const m of prepared) {
  await Bun.$`scp -q ${DIR}/${m.slug}.in ${`lenovo:${REMOTE}/`}`.quiet();
}
await Bun.$`scp -q ${DIR}/.run-oracle.sh ${`lenovo:${REMOTE}/run.sh`}`.quiet();
const run = await Bun.$`ssh lenovo ${`bash ${REMOTE}/run.sh`}`.nothrow().quiet();
console.log(run.stdout.toString().trim() || run.stderr.toString().trim());
for (const m of prepared) {
  await Bun.$`scp -q ${`lenovo:${REMOTE}/${m.slug}.in.out`} ${DIR}/`.quiet();
}
console.log('pulled the oracle outputs');

// ── distill ───────────────────────────────────────────────────────────────
function normalize(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

/** AO labels in canonical order, from the "; Orbital Mapping" block. */
function parseLabels(text: string): string[] {
  const start = text.indexOf('; Orbital Mapping');
  if (start < 0) throw new Error('no orbital mapping');
  const out: string[] = [];
  for (const line of text.slice(start).split('\n').slice(1)) {
    const m = line.match(/^(\d+)\s+(.+?)\s*$/);
    if (!m) { if (out.length > 0) break; else continue; }
    if (Number(m[1]) !== out.length + 1) break;
    out.push(normalize(m[2]));
  }
  return out;
}

/** One printed matrix: bind prints the UPPER triangle (lower entries zeroed)
 *  in blocks of three columns, repeating all rows in AO order per block. */
function parseMatrix(text: string, header: string, labels: string[]): number[][] {
  const n = labels.length;
  const blocks = Math.ceil(n / 3);
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  let block = -1;
  let row = 0;
  for (const line of text.slice(text.indexOf(header) + header.length).split('\n')) {
    if (line.includes('---')) { if (row > 0) break; else continue; }
    if (line.trim().length === 0 || line.startsWith(';') || line.startsWith('#')) continue;
    const first = line.search(/-?\d+\.\d+/);
    if (first < 0) { block++; row = 0; continue; }
    const numbers = line.match(/-?\d+\.\d+/g)!;
    const label = normalize(line.slice(0, first));
    if (label !== labels[row]) throw new Error(`row ${row}: "${label}" vs "${labels[row]}"`);
    numbers.forEach((v, c) => { matrix[row][block * 3 + c] = Number(v); });
    row++;
    if (row === n && block === blocks - 1) break;
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) matrix[i][j] = matrix[j][i];
  return matrix;
}

function parseEnergies(text: string): { energies: number[]; occupations: number[] } {
  const energies: number[] = [];
  const occupations: number[] = [];
  for (const line of text.slice(text.indexOf('Energies (in eV)')).split('\n').slice(1)) {
    const m = line.match(/^(\d+):--->\s+(-?\d+\.?\d*)\s+\[(\d+\.?\d*)\s/);
    if (!m) { if (energies.length > 0) break; else continue; }
    energies.push(Number(m[2]));
    occupations.push(Number(m[3]));
  }
  return { energies, occupations };
}

const out = {
  provenance: {
    oracle: 'YAeHMOP bind 3.1.0b2 (built from source on lenovo)',
    parameters: 'eht_parms.dat — the Alvarez extended-Hückel table as shipped by YAeHMOP',
    k: 1.75,
    hij: 'nonweighted (Hoffmann plain form; bind defaults to the ABTH-weighted variant)',
    bohr: 0.52918,
    frame: 'coordinates are the app example geometries ALIGNED to their principal axes — the frame the solver runs in',
    note: 'bind takes Å coordinates and evaluates its integrals in bohr (bind.h: BOHR .52918); matrices are printed to 4 decimals, so comparisons need ~2e-4',
    generated: new Date().toISOString().slice(0, 10),
  },
  molecules: prepared.map((m) => {
    const text = readFileSync(`${DIR}/${m.slug}.in.out`, 'utf8');
    const labels = parseLabels(text);
    const { energies, occupations } = parseEnergies(text);
    return {
      name: m.name,
      electrons: m.electrons,
      atoms: m.atoms,
      aoLabels: labels,
      S: parseMatrix(text, '--- Overlap Matrix S(R) ---', labels),
      H: parseMatrix(text, '--- Hamiltonian H(R) ---', labels),
      energies,
      occupations,
    };
  }),
};
writeFileSync(`${DIR}/eht-reference.json`, JSON.stringify(out, null, 1));
writeFileSync(`${DIR}/.run-oracle.sh`, '');
console.log(`wrote ${DIR}/eht-reference.json`);
void (0 as unknown as Molecule);
