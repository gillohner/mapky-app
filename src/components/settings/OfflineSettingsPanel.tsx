import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Database,
  RefreshCw,
  Trash2,
  HardDrive,
  Clock,
  AlertTriangle,
  Layers,
  Plus,
  MapPin,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOutboxCount } from "@/hooks/use-outbox-count";
import {
  formatBytes,
  requestPersistent,
} from "@/lib/offline/quota";
import { clearRoutesCache } from "@/lib/offline/routes-cache";
import { clearUserOwnResources } from "@/lib/offline/own-resources";
import { removeOutboxEntry } from "@/lib/offline/outbox";
import { syncOwnResources } from "@/lib/offline/sync-own";
import { drainOutbox } from "@/lib/offline/outbox-drain";
import { deleteRegion } from "@/lib/offline/regions";
import { clearAllOfflineTiles } from "@/lib/offline/offline-tiles";
import { useRegionDownloadStore } from "@/stores/region-download-store";
import { useOfflineStatsStore } from "@/stores/offline-stats-store";
import type {
  OutboxEntry,
  OwnResourceType,
  Region,
} from "@/lib/offline/db";
import { AddRegionDialog } from "./AddRegionDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

const OWN_TYPE_LABELS: Record<OwnResourceType, string> = {
  post: "Posts",
  review: "Reviews",
  collection: "Collections",
  incident: "Incidents",
  geoCapture: "Geo-captures",
  sequence: "Sequences",
  route: "Routes",
};

type ConfirmKind =
  | { kind: "clear-own" }
  | { kind: "clear-routes" }
  | { kind: "clear-tiles" }
  | { kind: "remove-region"; region: Region }
  | { kind: "drop-outbox"; entry: OutboxEntry };

export function OfflineSettingsPanel() {
  const navigate = useNavigate();
  const { publicKey, session } = useAuth();
  const pending = useOutboxCount(2000);

  // Hoisted snapshot — survives route changes so re-entering the
  // panel paints last-known values instantly while a background
  // refresh runs.
  const stats = useOfflineStatsStore();
  const {
    storage,
    persistent,
    regions,
    outboxEntries,
    routesCount,
    tilesCount,
    tilesBytes,
    ownCounts,
    refresh,
    patch,
    refreshing,
  } = stats;
  const loaded = stats.loadedAt !== null;

  const activeDownloads = useRegionDownloadStore((s) => s.active);
  const cancelDownload = useRegionDownloadStore((s) => s.cancel);
  const clearDownload = useRegionDownloadStore((s) => s.clear);

  // Stable signature of which downloads are present (independent of
  // per-tile progress updates). Lets us refresh the panel data once
  // when a download is added/removed/finished, without firing on
  // every progress callback.
  const downloadSig = useMemo(
    () =>
      Object.values(activeDownloads)
        .map((d) => `${d.id}:${d.status}`)
        .sort()
        .join(","),
    [activeDownloads],
  );

  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  useEffect(() => {
    void refresh(publicKey);
  }, [refresh, publicKey, pending, downloadSig]);

  // Merge IDB regions + any active downloads that haven't been
  // committed to IDB yet, so a freshly-started download shows a row
  // immediately (and its progress can render).
  const displayedRegions = useMemo<Region[]>(() => {
    const byId = new Map<string, Region>();
    for (const r of regions) byId.set(r.id, r);
    for (const id of Object.keys(activeDownloads)) {
      if (byId.has(id)) continue;
      const d = activeDownloads[id];
      byId.set(id, {
        id,
        name: d.name,
        bbox: [0, 0, 0, 0],
        tier: "basic",
        pmtilesPath: "",
        sizeBytes: d.progress.bytesStored,
        downloadedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        status: d.status === "running" ? "downloading" : "ready",
      });
    }
    return [...byId.values()];
  }, [regions, activeDownloads]);

  const handlePersistent = async () => {
    const granted = await requestPersistent();
    patch({ persistent: granted });
    if (granted) {
      toast.success("Storage marked persistent.");
    } else {
      toast.info(
        "Browser hasn't granted persistent storage yet. Chromium typically auto-grants once the PWA has high engagement — visit again later.",
      );
    }
  };

  const handleResync = async () => {
    if (!publicKey) return;
    setSyncing(true);
    try {
      await syncOwnResources(publicKey);
      toast.success("Resynced own data");
      await refresh(publicKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleClearOwn = async () => {
    if (!publicKey) return;
    // Optimistic: clear UI immediately, then run the IDB op + refresh.
    patch({
      ownCounts: {
        post: 0,
        review: 0,
        collection: 0,
        incident: 0,
        geoCapture: 0,
        sequence: 0,
        route: 0,
      },
    });
    await clearUserOwnResources(publicKey);
    toast.success("Cleared local copy of your data");
    void refresh(publicKey);
  };

  const handleClearRoutes = async () => {
    patch({ routesCount: 0 });
    await clearRoutesCache();
    toast.success("Cleared cached routes");
    void refresh(publicKey);
  };

  const handleClearTiles = async () => {
    patch({ tilesCount: 0, tilesBytes: 0 });
    await clearAllOfflineTiles();
    toast.success("Cleared all offline tiles");
    void refresh(publicKey);
  };

  const handleRetryOutbox = async () => {
    if (!session || !publicKey) {
      toast.error("Sign in to retry queued writes.");
      return;
    }
    const result = await drainOutbox(session, publicKey);
    toast.success(
      `Drained ${result.written} write${result.written === 1 ? "" : "s"}`,
    );
    void refresh(publicKey);
  };

  const handleDeleteEntry = async (entry: OutboxEntry) => {
    if (entry.id === undefined) return;
    patch({ outboxEntries: outboxEntries.filter((e) => e.id !== entry.id) });
    await removeOutboxEntry(entry.id);
    void refresh(publicKey);
  };

  const handleRemoveRegion = async (region: Region) => {
    patch({ regions: regions.filter((r) => r.id !== region.id) });
    clearDownload(region.id);
    await deleteRegion(region.id);
    void refresh(publicKey);
  };

  const confirmBodies: Record<ConfirmKind["kind"], string> = {
    "clear-own":
      "Removes your locally-cached posts, reviews, collections, captures, sequences and routes. Originals on your homeserver are untouched — the next sync will pull them back.",
    "clear-routes":
      "Removes every snapped route cached for offline replay. You can recompute them while online.",
    "clear-tiles":
      "Removes every offline map tile across all regions. The map will need to re-download tiles when you next pan over an area.",
    "remove-region": "",
    "drop-outbox": "",
  };

  return (
    <DiscoverSidebar
      title="Offline"
      onClose={() => navigate({ to: "/" })}
    >
      <div className="space-y-6 p-4">
        <Section
          icon={<HardDrive className="h-4 w-4" />}
          title="Storage"
          subtitle={
            storage
              ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} used`
              : loaded
                ? "Not available in this browser"
                : "Reading…"
          }
        >
          {storage && storage.quota > 0 && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%`,
                }}
              />
            </div>
          )}
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-muted">
              {persistent
                ? "Storage is persistent — browser won't evict under pressure."
                : "Storage is non-persistent — may be evicted under pressure."}
            </span>
            {!persistent && (
              <button
                onClick={handlePersistent}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
              >
                Make persistent
              </button>
            )}
          </div>
        </Section>

        <Section
          icon={<Database className="h-4 w-4" />}
          title="Your data"
          subtitle={
            publicKey
              ? "Mirrored locally so detail pages work offline."
              : "Sign in to mirror your own posts, routes, and captures."
          }
        >
          {publicKey && ownCounts && (
            <>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {(Object.keys(OWN_TYPE_LABELS) as OwnResourceType[]).map(
                  (t) => (
                    <li
                      key={t}
                      className="flex items-center justify-between"
                    >
                      <span className="text-muted">{OWN_TYPE_LABELS[t]}</span>
                      <span className="font-mono text-foreground">
                        {ownCounts[t]}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface/60 disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
                  />
                  Resync
                </button>
                <button
                  onClick={() => setConfirm({ kind: "clear-own" })}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </>
          )}
        </Section>

        <Section
          icon={<Clock className="h-4 w-4" />}
          title="Pending writes"
          subtitle={
            outboxEntries.length === 0
              ? "Nothing queued."
              : `${outboxEntries.length} write${outboxEntries.length === 1 ? "" : "s"} waiting to sync.`
          }
        >
          {outboxEntries.length > 0 && (
            <>
              <ul className="mt-2 space-y-1.5">
                {outboxEntries.slice(0, 6).map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-xs"
                  >
                    <span
                      className={`flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                        entry.status === "failed"
                          ? "bg-red-500"
                          : entry.status === "syncing"
                            ? "bg-blue-500"
                            : "bg-amber-500"
                      }`}
                    />
                    <span className="truncate font-mono text-[11px] text-foreground">
                      {entry.op.toUpperCase()} {entry.path}
                    </span>
                    {entry.lastError && (
                      <span
                        title={entry.lastError}
                        className="flex-shrink-0 text-amber-500"
                      >
                        <AlertTriangle className="h-3 w-3" />
                      </span>
                    )}
                    <button
                      onClick={() => setConfirm({ kind: "drop-outbox", entry })}
                      className="ml-auto rounded p-0.5 text-muted hover:text-red-500"
                      aria-label="Drop this entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {outboxEntries.length > 6 && (
                  <li className="text-[11px] text-muted">
                    +{outboxEntries.length - 6} more
                  </li>
                )}
              </ul>
              <button
                onClick={handleRetryOutbox}
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
              >
                <RefreshCw className="h-3 w-3" />
                Retry now
              </button>
            </>
          )}
        </Section>

        <Section
          icon={<Layers className="h-4 w-4" />}
          title="Cached routes"
          subtitle={
            routesCount === 0
              ? "No routes cached yet."
              : `${routesCount} snapped route${routesCount === 1 ? "" : "s"} stored for offline replay.`
          }
        >
          {routesCount > 0 && (
            <button
              onClick={() => setConfirm({ kind: "clear-routes" })}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          )}
        </Section>

        <Section
          icon={<MapPin className="h-4 w-4" />}
          title="Offline regions"
          subtitle={
            tilesCount === 0
              ? "Download a region to make its map tiles available offline."
              : `${tilesCount} tiles stored locally · ${formatBytes(tilesBytes)} on disk.${refreshing ? " refreshing…" : ""}`
          }
        >
          {displayedRegions.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {displayedRegions.map((r) => {
                const live = activeDownloads[r.id];
                const isRunning = live?.status === "running";
                const pct =
                  live && live.progress.total > 0
                    ? Math.round(
                        (live.progress.done / live.progress.total) * 100,
                      )
                    : 0;
                const liveBytes = live
                  ? formatBytes(live.progress.bytesStored)
                  : null;
                return (
                  <li
                    key={r.id}
                    className="rounded border border-border bg-surface px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          isRunning
                            ? "bg-blue-500"
                            : live?.status === "errored"
                              ? "bg-red-500"
                              : r.status === "ready"
                                ? "bg-green-500"
                                : r.status === "downloading"
                                  ? "bg-blue-500"
                                  : r.status === "error"
                                    ? "bg-red-500"
                                    : "bg-amber-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-foreground">
                          {r.name}
                        </div>
                        <div className="text-[11px] text-muted">
                          {isRunning
                            ? live.progress.total > 0
                              ? `${pct}% · ${live.progress.done} / ${live.progress.total} tiles · ${liveBytes}`
                              : "Preparing…"
                            : live?.status === "errored"
                              ? live.error ?? "Download failed"
                              : `${formatBytes(r.sizeBytes)} · ${r.status}`}
                        </div>
                      </div>
                      {isRunning ? (
                        <button
                          onClick={() => cancelDownload(r.id)}
                          className="rounded p-0.5 text-muted hover:text-red-500"
                          aria-label="Cancel download"
                          title="Cancel — tiles already stored stay on disk"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirm({ kind: "remove-region", region: r })
                          }
                          className="rounded p-0.5 text-muted hover:text-red-500"
                          aria-label="Remove region"
                          title="Remove region from this list"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {isRunning && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
            >
              <Plus className="h-3 w-3" />
              Add region
            </button>
            {tilesCount > 0 && (
              <button
                onClick={() => setConfirm({ kind: "clear-tiles" })}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-3 w-3" />
                Clear all tiles
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Tiles are stored in IndexedDB and served back through a custom
            MapLibre protocol — they survive reloads and work fully offline.
          </p>
        </Section>
      </div>
      {addOpen && (
        <AddRegionDialog
          onClose={() => setAddOpen(false)}
          onAdded={() => void refresh(publicKey)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirmTitle(confirm)}
          body={
            confirm.kind === "remove-region"
              ? `Remove "${confirm.region.name}" from the list? The cached tiles for this region stay on disk (other regions may share them) — use "Clear all tiles" to wipe tile storage entirely.`
              : confirm.kind === "drop-outbox"
                ? `Drop this queued ${confirm.entry.op.toUpperCase()} write? It will not be retried.`
                : confirmBodies[confirm.kind]
          }
          confirmLabel={confirmLabel(confirm)}
          onConfirm={() => {
            switch (confirm.kind) {
              case "clear-own":
                void handleClearOwn();
                break;
              case "clear-routes":
                void handleClearRoutes();
                break;
              case "clear-tiles":
                void handleClearTiles();
                break;
              case "remove-region":
                void handleRemoveRegion(confirm.region);
                break;
              case "drop-outbox":
                void handleDeleteEntry(confirm.entry);
                break;
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </DiscoverSidebar>
  );
}

function confirmTitle(c: ConfirmKind): string {
  switch (c.kind) {
    case "clear-own":
      return "Clear your local data?";
    case "clear-routes":
      return "Clear cached routes?";
    case "clear-tiles":
      return "Clear all offline tiles?";
    case "remove-region":
      return "Remove region?";
    case "drop-outbox":
      return "Drop queued write?";
  }
}

function confirmLabel(c: ConfirmKind): string {
  switch (c.kind) {
    case "clear-own":
      return "Clear data";
    case "clear-routes":
      return "Clear routes";
    case "clear-tiles":
      return "Clear tiles";
    case "remove-region":
      return "Remove";
    case "drop-outbox":
      return "Drop";
  }
}

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <header className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted">
          {icon}
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          )}
        </div>
      </header>
      {children && <div className="mt-2">{children}</div>}
    </section>
  );
}
