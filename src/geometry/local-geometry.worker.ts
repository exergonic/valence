/// <reference lib="webworker" />
/**
 * The geometry worker — runs the local pipeline (implicit hydrogens,
 * graph-walk embedder, MMFF94 refinement) off the main thread. For
 * larger molecules the optimizer takes seconds; on the main thread
 * that blocks the event loop and the browser offers "Page
 * Unresponsive". The worker keeps the page interactive.
 *
 * Protocol: one message in ({ id, molecule }), one message out
 * ({ id, molecule }). The id correlates responses to their request
 * so concurrent render calls each resolve only their own result.
 * The worker is created lazily and kept alive; Vite bundles it via
 * the `new URL(..., import.meta.url)` pattern.
 */
import { embedAndRefine } from './mmff-refine';
import type { Molecule } from '../mol-parser';

self.onmessage = (e: MessageEvent<{ id: number; molecule: Molecule }>) => {
  const { id, molecule } = e.data;
  try {
    self.postMessage({ id, molecule: embedAndRefine(molecule) });
  } catch {
    self.postMessage({ id, molecule: null });
  }
};
