import { getDB, type OutboxEntry, type OutboxStatus } from "./db";

export type NewOutboxEntry = Omit<
  OutboxEntry,
  "id" | "createdAt" | "attempts" | "status"
> & {
  status?: OutboxStatus;
};

export async function enqueueWrite(entry: NewOutboxEntry): Promise<number> {
  const db = await getDB();
  const value: OutboxEntry = {
    ...entry,
    attempts: 0,
    createdAt: Date.now(),
    status: entry.status ?? "pending",
  };
  return db.add("outbox", value) as Promise<number>;
}

export async function listByStatus(
  status: OutboxStatus,
): Promise<OutboxEntry[]> {
  const db = await getDB();
  return db.getAllFromIndex("outbox", "by-status", status);
}

export async function listAll(): Promise<OutboxEntry[]> {
  const db = await getDB();
  return db.getAll("outbox");
}

export async function markOutboxStatus(
  id: number,
  status: OutboxStatus,
  lastError?: string,
): Promise<void> {
  const db = await getDB();
  const entry = await db.get("outbox", id);
  if (!entry) return;
  entry.status = status;
  entry.lastAttemptAt = Date.now();
  if (status === "syncing" || status === "failed") {
    entry.attempts += 1;
  }
  entry.lastError = lastError;
  await db.put("outbox", entry);
}

export async function removeOutboxEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("outbox", id);
}

export async function pendingCount(): Promise<number> {
  const db = await getDB();
  return db.countFromIndex("outbox", "by-status", "pending");
}
