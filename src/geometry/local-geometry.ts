/**
 * The local geometry pipeline behind a Web Worker — the remedy for the
 * "Page Unresponsive" lockup. place3D + MMFF94 refinement on a
 * 20-30-atom molecule takes seconds, and running it on the main thread
 * blocks the event loop past Chrome's unresponsive threshold. The
 * worker keeps the page interactive while the geometry computes.
 *
 * Falls back to the synchronous pipeline when Workers are unavailable
 * (very old browsers / strict CSP) — the pre-worker behavior.
 *
 * Reentrant: the worker is a long-lived singleton, and concurrent
 * render requests each get a unique id; the response carries that id so
 * each caller resolves only its own result. The disabled render button
 * in the UI still serializes user-driven requests, but the pipeline no
 * longer silently cross-wires if that guard ever fails.
 */
import type { Molecule } from '../mol-parser';
import { embedAndRefine } from './mmff-refine';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Molecule | null) => void; reject: () => void }>();

function ensureWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./local-geometry.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, molecule } = e.data as { id: number; molecule: Molecule | null };
      const entry = pending.get(id);
      if (entry) {
        pending.delete(id);
        entry.resolve(molecule ?? null);
      }
    };
    worker.onerror = () => {
      // Reject all pending requests — the worker is dying, and a
      // fresh call will spin up a new one.
      for (const [, entry] of pending) entry.reject();
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

export function computeLocalGeometry(molecule: Molecule): Promise<Molecule | null> {
  const w = ensureWorker();
  if (!w) {
    return Promise.resolve(safeRefine(molecule));
  }

  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, molecule });
  });
}

/** Synchronous fallback — never throws. */
function safeRefine(molecule: Molecule): Molecule | null {
  try {
    return embedAndRefine(molecule);
  } catch {
    return null;
  }
}
