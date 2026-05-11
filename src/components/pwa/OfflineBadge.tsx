import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useOutboxCount } from "@/hooks/use-outbox-count";

/**
 * Small chip pinned to the top-center that appears when the browser
 * reports offline OR when writes are queued in the outbox. Stays out
 * of the way of search/HUD; non-blocking because the SW serves
 * cached data underneath and queued writes drain automatically on
 * reconnect.
 *
 * Region download progress is intentionally NOT surfaced here —
 * downloads are visible only from /settings/offline so they don't
 * persistently nag the user across every route.
 */
export function OfflineBadge() {
  const online = useOnlineStatus();
  const pending = useOutboxCount();
  if (online && pending === 0) return null;

  const label = online
    ? `${pending} write${pending === 1 ? "" : "s"} queued`
    : pending > 0
      ? `Offline — ${pending} write${pending === 1 ? "" : "s"} pending`
      : "Offline — using cached data";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-amber-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm dark:bg-amber-600/95"
    >
      <span className="inline-flex items-center gap-1.5">
        <CloudOff className="h-3.5 w-3.5" />
        {label}
      </span>
    </div>
  );
}
