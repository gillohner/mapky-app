import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { useAuth } from "@/components/auth/AuthProvider";
import { useOutboxCount } from "@/hooks/use-outbox-count";
import {
  formatBytes,
  getStorageEstimate,
  isPersisted,
  requestPersistent,
  type StorageEstimate,
} from "@/lib/offline/quota";
import {
  countCachedRoutes,
  clearRoutesCache,
} from "@/lib/offline/routes-cache";
import {
  countOwnByUserType,
  clearUserOwnResources,
} from "@/lib/offline/own-resources";
import {
  listAll as listOutboxAll,
  removeOutboxEntry,
} from "@/lib/offline/outbox";
import { syncOwnResources } from "@/lib/offline/sync-own";
import { drainOutbox } from "@/lib/offline/outbox-drain";
import { listRegions, deleteRegion } from "@/lib/offline/regions";
import type {
  OutboxEntry,
  OwnResourceType,
  Region,
} from "@/lib/offline/db";
import { AddRegionDialog } from "./AddRegionDialog";

interface OwnCounts {
  post: number;
  review: number;
  collection: number;
  incident: number;
  geoCapture: number;
  sequence: number;
  route: number;
}

const OWN_TYPE_LABELS: Record<OwnResourceType, string> = {
  post: "Posts",
  review: "Reviews",
  collection: "Collections",
  incident: "Incidents",
  geoCapture: "Geo-captures",
  sequence: "Sequences",
  route: "Routes",
};

export function OfflineSettingsPanel() {
  const navigate = useNavigate();
  const { publicKey, session } = useAuth();
  const pending = useOutboxCount(2000);

  const [storage, setStorage] = useState<StorageEstimate | null>(null);
  const [persistent, setPersistent] = useState(false);
  const [ownCounts, setOwnCounts] = useState<OwnCounts | null>(null);
  const [routesCount, setRoutesCount] = useState(0);
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const refreshAll = useCallback(async () => {
    const [est, persist, routes, entries, regs] = await Promise.all([
      getStorageEstimate(),
      isPersisted(),
      countCachedRoutes(),
      listOutboxAll(),
      listRegions(),
    ]);
    setStorage(est);
    setPersistent(persist);
    setRoutesCount(routes);
    setOutboxEntries(entries);
    setRegions(regs);
    if (publicKey) {
      setOwnCounts(await countOwnByUserType(publicKey));
    } else {
      setOwnCounts(null);
    }
  }, [publicKey]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll, pending]);

  const handlePersistent = async () => {
    const granted = await requestPersistent();
    setPersistent(granted);
    toast[granted ? "success" : "info"](
      granted
        ? "Storage marked persistent."
        : "Browser declined the persistence request.",
    );
  };

  const handleResync = async () => {
    if (!publicKey) return;
    setSyncing(true);
    try {
      await syncOwnResources(publicKey);
      toast.success("Resynced own data");
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleClearOwn = async () => {
    if (!publicKey) return;
    await clearUserOwnResources(publicKey);
    toast.success("Cleared local copy of your data");
    await refreshAll();
  };

  const handleClearRoutes = async () => {
    await clearRoutesCache();
    toast.success("Cleared cached routes");
    await refreshAll();
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
    await refreshAll();
  };

  const handleDeleteEntry = async (id?: number) => {
    if (id === undefined) return;
    await removeOutboxEntry(id);
    await refreshAll();
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
              : "Not available in this browser"
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
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface"
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
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`}
                  />
                  Resync
                </button>
                <button
                  onClick={handleClearOwn}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
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
                      onClick={() => handleDeleteEntry(entry.id)}
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
                className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface"
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
              onClick={handleClearRoutes}
              className="mt-2 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
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
            regions.length === 0
              ? "Pre-warm a region's map tiles so the map renders fully even without network."
              : `${regions.length} region${regions.length === 1 ? "" : "s"} downloaded.`
          }
        >
          {regions.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {regions.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded border border-border bg-surface px-2 py-1.5 text-xs"
                >
                  <span
                    className={`flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      r.status === "ready"
                        ? "bg-green-500"
                        : r.status === "downloading"
                          ? "bg-blue-500"
                          : r.status === "error"
                            ? "bg-red-500"
                            : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted">
                      {formatBytes(r.sizeBytes)} · {r.status}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await deleteRegion(r.id);
                      await refreshAll();
                    }}
                    className="rounded p-0.5 text-muted hover:text-red-500"
                    aria-label="Remove region"
                    title="Remove region from this list (cached tiles will age out of the SW cache on their own)"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface"
          >
            <Plus className="h-3 w-3" />
            Add region
          </button>
          <p className="mt-2 text-[11px] text-muted">
            Tiles are stored in the browser's HTTP cache. They're available
            as long as the cache hasn't aged them out; a future update will
            move them into a dedicated per-region store.
          </p>
        </Section>
      </div>
      {addOpen && (
        <AddRegionDialog
          onClose={() => setAddOpen(false)}
          onAdded={refreshAll}
        />
      )}
    </DiscoverSidebar>
  );
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
