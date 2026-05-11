import type { Session } from "@synonymdev/pubky";
import {
  enqueueWrite,
  listByStatus,
  markOutboxStatus,
  removeOutboxEntry,
  type NewOutboxEntry,
} from "./outbox";
import type { OutboxEntry } from "./db";

/**
 * Try a homeserver write; on a network-shaped failure, persist it to
 * the outbox so the drain loop can retry once we're back online.
 *
 * The first attempt always goes through the live SDK so the happy
 * path keeps its latency profile and the UI keeps its current
 * optimistic-update story (most callers patch the TanStack cache
 * after a successful write — that's still what fires when we're
 * online). The outbox is the fallback, not the primary path.
 *
 * Returns:
 *   - `{ status: "written" }` on success
 *   - `{ status: "queued", id }` if the network failed and we queued
 *   - throws for non-network errors (auth, payload validation)
 */
export type OutboxWriteResult =
  | { status: "written" }
  | { status: "queued"; id: number };

interface BasePutOptions {
  session: Session;
  userId: string;
  path: `/pub/${string}`;
}

export async function outboxPutText(
  opts: BasePutOptions & { text: string },
): Promise<OutboxWriteResult> {
  return attempt(opts, async () => {
    await opts.session.storage.putText(opts.path, opts.text);
  }, {
    op: "put",
    path: opts.path,
    payload: opts.text,
    contentType: "application/json",
    userId: opts.userId,
  });
}

export async function outboxDelete(
  opts: BasePutOptions,
): Promise<OutboxWriteResult> {
  return attempt(opts, async () => {
    await opts.session.storage.delete(opts.path);
  }, {
    op: "delete",
    path: opts.path,
    userId: opts.userId,
  });
}

async function attempt(
  _opts: BasePutOptions,
  doIt: () => Promise<void>,
  enqueueIfFailed: NewOutboxEntry,
): Promise<OutboxWriteResult> {
  try {
    await doIt();
    return { status: "written" };
  } catch (err) {
    if (isNetworkShapedError(err)) {
      const id = await enqueueWrite(enqueueIfFailed);
      return { status: "queued", id };
    }
    throw err;
  }
}

/**
 * Identify errors we should fall back to the outbox for. Network
 * failures from the pubky SDK come through as plain Error / TypeError
 * with a message — there's no rich error class to switch on, so we
 * lean on `navigator.onLine` plus a few common message fragments.
 */
function isNetworkShapedError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (err instanceof TypeError) return true; // fetch usually throws TypeError on network failure
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("offline")
  );
}

/**
 * Drain pending outbox entries against the supplied session. Idempotent
 * — entries that have been marked `done` are removed; entries that
 * fail again stay `failed` and will be retried on the next drain.
 */
export async function drainOutbox(
  session: Session,
  userId: string,
  signal?: AbortSignal,
): Promise<{ written: number; failed: number }> {
  const pending: OutboxEntry[] = [
    ...(await listByStatus("pending")),
    ...(await listByStatus("failed")),
  ];
  // Stable order so dependent writes (e.g. blob → file metadata) land
  // in the same sequence they were enqueued.
  pending.sort((a, b) => a.createdAt - b.createdAt);

  let written = 0;
  let failed = 0;
  for (const entry of pending) {
    if (signal?.aborted) break;
    if (entry.id === undefined) continue;
    if (entry.userId !== userId) continue; // only drain the active user's queue

    await markOutboxStatus(entry.id, "syncing");
    try {
      if (entry.op === "delete") {
        await session.storage.delete(entry.path as `/pub/${string}`);
      } else if (entry.op === "put") {
        await session.storage.putText(
          entry.path as `/pub/${string}`,
          String(entry.payload ?? ""),
        );
      } else if (entry.op === "putBlob") {
        if (!(entry.payload instanceof Uint8Array)) {
          throw new Error("putBlob payload missing or not Uint8Array");
        }
        await session.storage.putBytes(
          entry.path as `/pub/${string}`,
          entry.payload,
        );
      }
      await removeOutboxEntry(entry.id);
      written += 1;
    } catch (err) {
      await markOutboxStatus(
        entry.id,
        "failed",
        err instanceof Error ? err.message : String(err),
      );
      failed += 1;
      // If we just hit a network error, the rest of the queue is
      // almost certainly going to fail too — bail early.
      if (isNetworkShapedError(err)) break;
    }
  }

  return { written, failed };
}
