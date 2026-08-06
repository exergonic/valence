/// <reference lib="webworker" />
/**
 * The geometry worker — runs the local pipeline (implicit hydrogens,
 * graph-walk embedder, MMFF94 refinement) off the main thread. For
 * larger molecules the optimizer takes seconds; on the main thread
 * that blocks the event loop and the browser offers "Page
 * Unresponsive". The worker keeps the page interactive.
 *
 * Protocol: one message in (the Molecule JSON), one message out (the
 * best geometry — refined, or the placed guess — or null on failure).
 * The worker is created lazily and kept alive; Vite bundles it via
 * the `new URL(..., import.meta.url)` pattern.
 */
import { embedAndRefine } from './mmff-refine';
import type { Molecule } from '../mol-parser';

self.onmessage = (e: MessageEvent<Molecule>) => {
  try {
    self.postMessage(embedAndRefine(e.data));
  } catch {
    self.postMessage(null);
  }
};
