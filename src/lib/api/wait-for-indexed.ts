/**
 * Poll a check until it returns truthy or the deadline expires.
 *
 * Replaces the older `setTimeout(invalidateQueries, 5000)` hack used after
 * homeserver writes — that fixed timeout was both racy (Nominatim throttling
 * could push indexing past 5 s) and wasteful (most writes index in ~200 ms).
 *
 * `check` should return the indexed resource when found, or null/throw when
 * not yet present. We swallow throws so a transient 404 doesn't abort the
 * whole poll loop.
 */
export interface WaitForIndexedOptions {
  /** Polling cadence. Default 500 ms. */
  intervalMs?: number;
  /** Hard cap before giving up. Default 15 000 ms. */
  timeoutMs?: number;
  /** Initial delay before the first probe. Default 0. */
  initialDelayMs?: number;
}

export async function waitForIndexed<T>(
  check: () => Promise<T | null | undefined>,
  opts: WaitForIndexedOptions = {},
): Promise<T | null> {
  const interval = opts.intervalMs ?? 500;
  const timeout = opts.timeoutMs ?? 15_000;
  const initialDelay = opts.initialDelayMs ?? 0;

  if (initialDelay > 0) {
    await sleep(initialDelay);
  }

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // Transient failure (e.g. 404 before the resource shows up). Keep polling.
    }
    if (Date.now() + interval >= deadline) break;
    await sleep(interval);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
