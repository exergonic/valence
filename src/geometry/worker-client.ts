/**
 * One long-lived Web Worker per engine, and the requests sent to it — the
 * plumbing the GFN2-xTB and Hartree–Fock engines share (gfn2-refine.ts,
 * hf-single-point.ts).
 *
 * Reentrant: one id per request, so concurrent callers each resolve only
 * their own answer. An engine is synchronous inside its worker, so a run is
 * stopped by terminating the worker; every request in flight is rejected and
 * the next one starts a fresh worker.
 */

export interface WorkerClient<Progress> {
  /** Send the worker one task; the promise settles with its answer. */
  ask<T>(message: object, onProgress?: (progress: Progress) => void): Promise<T>;
  /** Reject every request in flight with `reason` and terminate the worker. */
  drop(reason: () => Error): void;
  /** Whether any request is in flight. */
  busy(): boolean;
}

/**
 * `start` makes the worker — `new Worker(new URL('./x.worker.ts',
 * import.meta.url), { type: 'module' })`, written in the engine's own module
 * so the bundler sees it. `unavailable` is the error for a browser without
 * Workers; `failed` the message when the worker itself dies.
 */
export function workerClient<Progress>(start: () => Worker, unavailable: () => Error, failed: string): WorkerClient<Progress> {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolvers: PromiseWithResolvers<any>; onProgress?: (progress: Progress) => void }>();

  const drop = (reason: () => Error) => {
    for (const [, run] of pending) run.resolvers.reject(reason());
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  const ensure = (): Worker | null => {
    if (typeof Worker === 'undefined') return null;
    if (worker) return worker;
    try {
      worker = start();
      worker.onmessage = (e: MessageEvent) => {
        const { id, result, error, progress } = e.data as { id: number; result?: unknown; error?: string; progress?: Progress };
        const run = pending.get(id);
        if (!run) return;
        if (progress) {
          run.onProgress?.(progress);
          return;
        }
        pending.delete(id);
        if (error) run.resolvers.reject(new Error(error));
        else run.resolvers.resolve(result ?? null);
      };
      worker.onerror = () => drop(() => new Error(failed));
    } catch {
      worker = null;
    }
    return worker;
  };

  return {
    ask<T>(message: object, onProgress?: (progress: Progress) => void): Promise<T> {
      const w = ensure();
      if (!w) return Promise.reject(unavailable());
      const resolvers = Promise.withResolvers<T>();
      const id = nextId++;
      pending.set(id, { resolvers, onProgress });
      w.postMessage({ id, ...message });
      return resolvers.promise;
    },
    drop,
    busy: () => pending.size > 0,
  };
}
