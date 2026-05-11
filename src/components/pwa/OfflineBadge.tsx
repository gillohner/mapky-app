import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * Small chip pinned to the top-center that appears when the browser
 * reports offline. Stays out of the way of search/HUD; non-blocking
 * because the SW serves cached data underneath.
 */
export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;

  // Sits just below the SearchBar (top-3, ~48 px tall) so the chip
  // never collides with the search input on mobile.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-amber-500/95 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-sm dark:bg-amber-600/95"
    >
      <span className="inline-flex items-center gap-1.5">
        <CloudOff className="h-3.5 w-3.5" />
        Offline — using cached data
      </span>
    </div>
  );
}
