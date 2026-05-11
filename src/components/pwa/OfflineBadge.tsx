import { CloudOff, Download } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useOutboxCount } from "@/hooks/use-outbox-count";
import { useRegionDownloadStore } from "@/stores/region-download-store";

/**
 * Small chip pinned to the top-center that surfaces background
 * state: offline mode, queued writes waiting to sync, region
 * downloads in flight. All three can stack; we show one chip per
 * concern so the user can see what's happening even when not on
 * the settings page.
 */
export function OfflineBadge() {
  const online = useOnlineStatus();
  const pending = useOutboxCount();
  const active = useRegionDownloadStore((s) => s.active);

  const running = Object.values(active).filter((d) => d.status === "running");
  const hasNetworkBadge = !online || pending > 0;
  if (!hasNetworkBadge && running.length === 0) return null;

  const networkLabel = online
    ? `${pending} write${pending === 1 ? "" : "s"} queued`
    : pending > 0
      ? `Offline — ${pending} write${pending === 1 ? "" : "s"} pending`
      : "Offline — using cached data";

  // Sits just below the SearchBar (top-3, ~48 px tall) so the
  // chips never collide with the search input on mobile.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5"
    >
      {hasNetworkBadge && (
        <div className="rounded-full bg-amber-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm dark:bg-amber-600/95">
          <span className="inline-flex items-center gap-1.5">
            <CloudOff className="h-3.5 w-3.5" />
            {networkLabel}
          </span>
        </div>
      )}
      {running.map((d) => {
        const pct =
          d.progress.total > 0
            ? Math.round((d.progress.done / d.progress.total) * 100)
            : 0;
        return (
          <div
            key={d.id}
            className="rounded-full bg-blue-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm dark:bg-blue-600/95"
          >
            <span className="inline-flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              {d.name} · {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
