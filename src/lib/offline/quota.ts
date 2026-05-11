/**
 * Storage quota helpers. Browsers expose two relevant numbers:
 *
 *  - `navigator.storage.estimate()` — best-effort total used + quota
 *  - `navigator.storage.persist()` — request the data won't be evicted
 *    under storage pressure (Chrome auto-grants for installed PWAs).
 */

export interface StorageEstimate {
  /** Bytes used across all of this origin's storage (IDB + Cache + OPFS). */
  usage: number;
  /** Hard cap, per browser. */
  quota: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (!("storage" in navigator) || !navigator.storage.estimate) return null;
  const est = await navigator.storage.estimate();
  return {
    usage: est.usage ?? 0,
    quota: est.quota ?? 0,
  };
}

export async function isPersisted(): Promise<boolean> {
  if (!("storage" in navigator) || !navigator.storage.persisted) return false;
  return navigator.storage.persisted();
}

/**
 * Ask the browser to mark this origin's storage as persistent so it
 * isn't evicted under pressure. Safe to call repeatedly; returns the
 * current persistence state.
 */
export async function requestPersistent(): Promise<boolean> {
  if (!("storage" in navigator) || !navigator.storage.persist) return false;
  return navigator.storage.persist();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log10(bytes) / 3));
  const value = bytes / Math.pow(1000, i);
  const digits = value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}
