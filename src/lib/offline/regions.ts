import { getDB, type Region, type RegionStatus } from "./db";

export async function listRegions(): Promise<Region[]> {
  const db = await getDB();
  return db.getAll("regions");
}

export async function getRegion(id: string): Promise<Region | undefined> {
  const db = await getDB();
  return db.get("regions", id);
}

export async function putRegion(region: Region): Promise<void> {
  const db = await getDB();
  await db.put("regions", region);
}

export async function deleteRegion(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("regions", id);
}

export async function setRegionStatus(
  id: string,
  status: RegionStatus,
  error?: string,
): Promise<void> {
  const db = await getDB();
  const region = await db.get("regions", id);
  if (!region) return;
  region.status = status;
  region.error = error;
  await db.put("regions", region);
}
