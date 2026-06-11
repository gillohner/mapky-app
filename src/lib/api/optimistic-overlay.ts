/**
 * Per-queryKey pending-mutation overlay.
 *
 * Problem: a quick burst of writes (add tag A, add tag B, add place X)
 * each schedules a delayed `invalidateQueries` to reconcile with nexus.
 * The earliest invalidate fires before nexus has indexed the *latest*
 * write — its refetch returns server data that's missing the still-
 * pending write, and the wholesale `setQueryData` from the refetch
 * stomps the optimistic entry. The user sees their last add disappear
 * for a few seconds until the next invalidate catches up. (Issue #7.)
 *
 * Fix: separate "what the cache currently holds" from "what the user
 * sees". The cache stays the literal server response, and consumers
 * pass server data through `applyPending(queryKey, data)` (typically
 * via TanStack Query's `select`) which re-applies any pending ops
 * registered against that queryKey — until either the server's own
 * response includes the change (`isConfirmed`) or the TTL elapses.
 *
 * Each op carries:
 *   - `id`: stable identifier so repeated registrations replace, not stack
 *   - `apply`: pure (data) => data patcher, idempotent against confirmed data
 *   - `isConfirmed`: predicate that returns true once the server's data
 *     reflects the change — drops the op from the registry on next read
 *   - `expiresAt`: hard upper bound (TTL) so a never-indexed write can't
 *     haunt the UI forever
 */
import type { QueryKey } from "@tanstack/react-query";

export interface PendingOp<T = unknown> {
  id: string;
  apply: (data: T) => T;
  isConfirmed: (data: T) => boolean;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60_000;

const pendingByKey = new Map<string, PendingOp[]>();

function keyOf(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

/** Register a pending op against a queryKey. Re-registering the same
 *  `id` replaces the prior entry rather than stacking. */
export function registerPending<T>(
  queryKey: QueryKey,
  op: Omit<PendingOp<T>, "expiresAt"> & { ttlMs?: number },
): void {
  const k = keyOf(queryKey);
  const list = (pendingByKey.get(k) ?? []).filter((p) => p.id !== op.id);
  list.push({
    id: op.id,
    apply: op.apply as (d: unknown) => unknown,
    isConfirmed: op.isConfirmed as (d: unknown) => boolean,
    expiresAt: Date.now() + (op.ttlMs ?? DEFAULT_TTL_MS),
  });
  pendingByKey.set(k, list);
}

/** Drop a pending op explicitly (rare — usually `isConfirmed` does this
 *  automatically on the next read). */
export function clearPending(queryKey: QueryKey, id: string): void {
  const k = keyOf(queryKey);
  const list = pendingByKey.get(k);
  if (!list) return;
  const filtered = list.filter((p) => p.id !== id);
  if (filtered.length === 0) pendingByKey.delete(k);
  else pendingByKey.set(k, filtered);
}

/** Apply every still-pending op for a queryKey to `data`. Pure for
 *  callers; the only side-effect is the registry pruning entries that
 *  have either expired or whose `isConfirmed(data)` returned true.
 *  Safe to call from a TanStack Query `select`. */
export function applyPending<T>(queryKey: QueryKey, data: T): T {
  const k = keyOf(queryKey);
  const list = pendingByKey.get(k);
  if (!list || list.length === 0) return data;

  const now = Date.now();
  const fresh: PendingOp[] = [];
  let result: T = data;
  for (const op of list) {
    if (op.expiresAt <= now) continue;
    if (op.isConfirmed(result)) continue;
    fresh.push(op);
    result = op.apply(result) as T;
  }

  if (fresh.length === 0) pendingByKey.delete(k);
  else if (fresh.length !== list.length) pendingByKey.set(k, fresh);

  return result;
}

// ---------- helpers for the two shapes Mapky uses today ----------

/** List-of-items overlay (e.g. tags on a place). `getId` is the per-item
 *  identity (label, OSM url, etc.). Set `tombstone: true` to model removal. */
export function pendingListAdd<T>(opts: {
  queryKey: QueryKey;
  opId: string;
  item: T;
  getId: (item: T) => string;
  /** Custom merge — defaults to "append if missing". */
  merge?: (old: T[] | undefined, item: T) => T[];
  ttlMs?: number;
}): void {
  const { queryKey, opId, item, getId, merge, ttlMs } = opts;
  const itemId = getId(item);
  const defaultMerge = (old: T[] | undefined, x: T): T[] => {
    if (!old) return [x];
    return old.some((o) => getId(o) === getId(x)) ? old : [...old, x];
  };
  registerPending<T[] | undefined>(queryKey, {
    id: opId,
    apply: (data) => (merge ?? defaultMerge)(data, item),
    isConfirmed: (data) => !!data && data.some((o) => getId(o) === itemId),
    ttlMs,
  });
}

/** List-of-items removal overlay — tombstones an entry until the server
 *  refetch confirms it's gone. */
export function pendingListRemove<T>(opts: {
  queryKey: QueryKey;
  opId: string;
  itemId: string;
  getId: (item: T) => string;
  ttlMs?: number;
}): void {
  const { queryKey, opId, itemId, getId, ttlMs } = opts;
  registerPending<T[] | undefined>(queryKey, {
    id: opId,
    apply: (data) => (data ? data.filter((o) => getId(o) !== itemId) : data),
    isConfirmed: (data) => !data || !data.some((o) => getId(o) === itemId),
    ttlMs,
  });
}

/** Patch a single field on every entity in a list whose key matches. */
export function pendingEntityFieldPatch<E, F>(opts: {
  queryKey: QueryKey;
  opId: string;
  entityId: string;
  getEntityId: (e: E) => string;
  field: keyof E;
  value: F;
  /** Returns true once the server's entity in the list already has this value. */
  matches: (current: F, expected: F) => boolean;
  ttlMs?: number;
}): void {
  const { queryKey, opId, entityId, getEntityId, field, value, matches, ttlMs } =
    opts;
  registerPending<E[] | undefined>(queryKey, {
    id: opId,
    apply: (data) =>
      data
        ? data.map((e) =>
            getEntityId(e) === entityId ? { ...e, [field]: value } : e,
          )
        : data,
    isConfirmed: (data) => {
      if (!data) return false;
      const e = data.find((x) => getEntityId(x) === entityId);
      // If the entity has dropped out of the list (e.g. permission
      // change) we can't keep replaying this op forever — treat as
      // confirmed so the TTL doesn't have to bail us out.
      if (!e) return true;
      return matches(e[field] as F, value);
    },
    ttlMs,
  });
}

/** Patch a single field on a single entity (the entity *is* the cached
 *  value, not an item in a list). */
export function pendingSingleFieldPatch<E, F>(opts: {
  queryKey: QueryKey;
  opId: string;
  field: keyof E;
  value: F;
  matches: (current: F, expected: F) => boolean;
  ttlMs?: number;
}): void {
  const { queryKey, opId, field, value, matches, ttlMs } = opts;
  registerPending<E | undefined>(queryKey, {
    id: opId,
    apply: (data) => (data ? { ...data, [field]: value } : data),
    isConfirmed: (data) =>
      !!data && matches(data[field] as F, value),
    ttlMs,
  });
}

/** Test-only — clear every entry. Production callers should never need this. */
export function __resetPendingForTests(): void {
  pendingByKey.clear();
}
