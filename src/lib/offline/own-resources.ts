import { getDB, type OwnResource, type OwnResourceType } from "./db";

export async function putOwnResource(
  resource: OwnResource,
): Promise<void> {
  const db = await getDB();
  await db.put("own_resources", resource);
}

export async function putOwnResources(
  resources: OwnResource[],
): Promise<void> {
  if (resources.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("own_resources", "readwrite");
  await Promise.all([...resources.map((r) => tx.store.put(r)), tx.done]);
}

export async function getOwnResource<T = unknown>(
  userId: string,
  type: OwnResourceType,
  id: string,
): Promise<OwnResource<T> | undefined> {
  const db = await getDB();
  return (await db.get("own_resources", [userId, type, id])) as
    | OwnResource<T>
    | undefined;
}

export async function listOwnByUserType(
  userId: string,
  type: OwnResourceType,
): Promise<OwnResource[]> {
  const db = await getDB();
  return db.getAllFromIndex("own_resources", "by-userId-type", [userId, type]);
}

export async function listOwnByUser(userId: string): Promise<OwnResource[]> {
  const db = await getDB();
  return db.getAllFromIndex("own_resources", "by-userId", userId);
}

export async function deleteOwnResource(
  userId: string,
  type: OwnResourceType,
  id: string,
): Promise<void> {
  const db = await getDB();
  await db.delete("own_resources", [userId, type, id]);
}

export async function clearUserOwnResources(userId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("own_resources", "readwrite");
  const keys = await tx.store.index("by-userId").getAllKeys(userId);
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
}

/**
 * Per-type counts for a single user. Used by the offline settings page
 * to show what's mirrored locally.
 */
export async function countOwnByUserType(
  userId: string,
): Promise<Record<OwnResourceType, number>> {
  const types: OwnResourceType[] = [
    "post",
    "review",
    "incident",
    "geoCapture",
    "sequence",
    "route",
  ];
  const db = await getDB();
  const tx = db.transaction("own_resources", "readonly");
  const idx = tx.store.index("by-userId-type");
  const result: Record<OwnResourceType, number> = {
    post: 0,
    review: 0,
    incident: 0,
    geoCapture: 0,
    sequence: 0,
    route: 0,
  };
  for (const t of types) {
    result[t] = await idx.count([userId, t]);
  }
  await tx.done;
  return result;
}
