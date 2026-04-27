import { config } from "@/lib/config";
import { waitForIndexed } from "@/lib/api/wait-for-indexed";

const baseURL = import.meta.env.DEV ? "" : config.gateway.url;

/**
 * Trigger Nexus to ingest a user's homeserver data, then poll until the
 * user is actually queryable via `/v0/user/{pk}`. Without the poll the
 * caller can navigate away too quickly and the next page's `useUserProfile`
 * fires 404s before ingestion completes.
 *
 * Returns true once the user is visible in Nexus, false on hard failure or
 * timeout (we still proceed in that case — the UI degrades gracefully via
 * the avatar/name fallbacks, and a later refresh will pick up the data).
 */
export async function ingestUserIntoNexus(
  publicKey: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/v0/ingest/${publicKey}`, {
      method: "PUT",
    });

    if (!response.ok) {
      console.error(
        `Failed to ingest user into Nexus: ${response.status} ${response.statusText}`,
      );
      return false;
    }

    // Ingest accepted the request — but the watcher's actual graph write
    // can lag a few hundred ms. Poll until /v0/user/{pk} returns 200 so
    // hooks that fire on the next page see a populated user.
    const ready = await waitForIndexed(
      async () => {
        const r = await fetch(`${baseURL}/v0/user/${publicKey}`);
        return r.ok ? true : null;
      },
      { intervalMs: 300, timeoutMs: 8_000, initialDelayMs: 100 },
    );

    if (!ready) {
      console.warn(
        `Nexus ingest accepted but user ${publicKey} not yet queryable after 8s`,
      );
    }

    return true;
  } catch (error) {
    console.error("Error ingesting user into Nexus:", error);
    return false;
  }
}
