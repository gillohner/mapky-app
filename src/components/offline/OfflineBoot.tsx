import { useEffect, useRef } from "react";
import { useRegionDownloadStore } from "@/stores/region-download-store";

/**
 * Invisible component that runs offline-housekeeping once at app
 * boot. Currently: re-kick region downloads left stuck at
 * `status: "downloading"` after a reload mid-fetch (the in-memory
 * download store gets wiped but the region row in IDB is still
 * marked as downloading). Mounts under the root so it fires
 * regardless of auth state — region downloads aren't user-scoped.
 */
export function OfflineBoot() {
  const resumeStuck = useRegionDownloadStore((s) => s.resumeStuck);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void resumeStuck().catch((err) => {
      console.warn("[offline-boot] resumeStuck failed", err);
    });
  }, [resumeStuck]);

  return null;
}
