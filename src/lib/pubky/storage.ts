import { Pubky, Client } from "@synonymdev/pubky";
import { config } from "@/lib/config";

let cached: Pubky | null = null;

/**
 * Lazy-cached read-only Pubky instance for fetching public blobs from
 * homeservers. Anyone can read `/pub/...` paths without auth, so this is
 * safe to share across the app.
 */
function getReader(): Pubky {
  if (cached) return cached;
  if (config.env === "testnet") {
    cached = Pubky.testnet();
  } else {
    const client = new Client({ pkarr: { relays: config.pkarr.relays } });
    cached = Pubky.withClient(client);
  }
  return cached;
}

/**
 * Read a JSON blob stored at /pub/{path} on the homeserver of the given
 * user (z32-encoded public key).
 */
export async function readPublicJson<T>(
  userId: string,
  pubPath: string,
): Promise<T> {
  const reader = getReader();
  const cleanPath = pubPath.replace(/^\/+/, "") as `pub/${string}`;
  const address: `pubky${string}/pub/${string}` = `pubky${userId}/${cleanPath}`;
  return (await reader.publicStorage.getJson(address)) as T;
}

/** Convenience reader for the canonical mapky.app route path. */
export async function readRouteBody<T>(
  userId: string,
  routeId: string,
): Promise<T> {
  return readPublicJson<T>(userId, `pub/mapky.app/routes/${routeId}`);
}
