import { useEffect, useState } from "react";
import { pendingCount } from "@/lib/offline/outbox";

/**
 * Pending outbox count, polled at a low cadence. Polling instead of
 * a proper subscription because IDB has no native change events and
 * the only writers are our own enqueue/drain helpers — anyone using
 * this hook is fine seeing the count update a beat after a write.
 */
export function useOutboxCount(intervalMs = 4000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await pendingCount();
        if (!cancelled) setCount(n);
      } catch {
        /* swallow — count is best-effort */
      }
    };
    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return count;
}
