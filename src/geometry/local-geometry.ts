/**
 * The local geometry pipeline behind a Web Worker — the remedy for the
 * "Page Unresponsive" lockup. place3D + MMFF94 refinement on a
 * 20-30-atom molecule takes seconds, and running it on the main thread
 * blocks the event loop past Chrome's unresponsive threshold. The
 * worker keeps the page interactive while the geometry computes.
 *
 * Falls back to the synchronous pipeline when Workers are unavailable
 * (very old browsers / strict CSP) — the pre-worker behavior.
 */
import type { Molecule } from '../mol-parser';
import { embedAndRefine } from './mmff-refine';

let worker: Worker | null = null;

export function computeLocalGeometry(molecule: Molecule): Promise<Molecule | null> {
  if (typeof Worker === 'undefined') {
    return Promise.resolve(embedAndRefine(molecule));
  }
  try {
    worker ??= new Worker(new URL('./local-geometry.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return Promise.resolve(embedAndRefine(molecule));
  }
  // Narrowed local: the executor closure cannot see the ??= narrowing.
  const w = worker;
  if (!w) return Promise.resolve(embedAndRefine(molecule));

  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent) => {
      cleanup();
      resolve((e.data as Molecule) ?? null);
    };
    const onError = () => {
      cleanup();
      resolve(null);
    };
    const cleanup = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage(molecule);
  });
}
