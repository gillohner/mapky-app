import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { syncOwnResources } from "@/lib/offline/sync-own";
import { drainOutbox } from "@/lib/offline/outbox-drain";

/**
 * Invisible component that mirrors the signed-in user's own MapKy
 * resources into IDB and drains any pending writes from the outbox.
 * Mounts under AuthProvider, watches `publicKey`, and triggers:
 *
 *   - eager-sync once on initial sign-in (transition `null → publicKey`)
 *   - both eager-sync and outbox drain whenever the browser reports
 *     a transition to `online`
 *
 * Idempotent — a second sync trigger while one is in flight is
 * short-circuited via a ref guard.
 */
export function OwnDataSync() {
  const publicKey = useAuthStore((s) => s.publicKey);
  const session = useAuthStore((s) => s.session);
  const lastSyncedKey = useRef<string | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (!publicKey) {
      lastSyncedKey.current = null;
      return;
    }

    const triggerSync = async () => {
      if (inFlight.current) return;
      inFlight.current = syncOwnResources(publicKey)
        .then((summary) => {
          if (import.meta.env.DEV) {
            console.info("[own-sync] complete", summary);
          }
          lastSyncedKey.current = publicKey;
        })
        .catch((err) => {
          console.warn("[own-sync] failed", err);
        })
        .finally(() => {
          inFlight.current = null;
        });
    };

    const triggerDrain = async () => {
      if (!session) return;
      try {
        const result = await drainOutbox(session, publicKey);
        if (import.meta.env.DEV && (result.written || result.failed)) {
          console.info("[outbox-drain] result", result);
        }
      } catch (err) {
        console.warn("[outbox-drain] failed", err);
      }
    };

    if (lastSyncedKey.current !== publicKey) {
      void triggerSync();
      void triggerDrain();
    }

    const onOnline = () => {
      void triggerSync();
      void triggerDrain();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [publicKey, session]);

  return null;
}
