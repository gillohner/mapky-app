import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Compass, Loader2, MapPin, User } from "lucide-react";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { PanelHeaderActions } from "@/components/shared/PanelHeaderActions";
import { ResourceDiscussion } from "@/components/posts/ResourceDiscussion";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { useIncidentDetail, useUserProfile } from "@/lib/api/hooks";
import { useEnsureIngested } from "@/lib/nexus/use-ensure-ingested";
import { truncatePublicKey } from "@/lib/api/user";
import { useBackOr } from "@/hooks/use-back-or";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useMapStore } from "@/stores/map-store";
import { useShareLink } from "@/lib/hooks/use-share-link";

interface IncidentDetailPanelProps {
  authorId: string;
  incidentId: string;
}

function toMillis(ts: number): number {
  if (ts > 1e14) return Math.floor(ts / 1000);
  if (ts < 1e12) return ts * 1000;
  return ts;
}

function titleCaseSnake(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityClass(severity: string): string {
  if (severity === "high") {
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  }
  if (severity === "medium") {
    return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  }
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

export function IncidentDetailPanel({
  authorId,
  incidentId,
}: IncidentDetailPanelProps) {
  const navigate = useNavigate();
  const close = () => navigate({ to: "/" });
  const back = useBackOr(() => navigate({ to: "/" }));
  const map = useMapStore((s) => s.map);

  const { data, isLoading, error } = useIncidentDetail(authorId, incidentId);
  useEnsureIngested(authorId);
  const { data: authorProfile } = useUserProfile(authorId);

  const authorName =
    authorProfile?.name?.trim() || truncatePublicKey(authorId);
  const share = useShareLink({ kind: "incident", authorId, resourceId: incidentId });

  // Incident-focused mode: hide places/captures while this panel is open.
  useAutoFocusLayer("incidents", { hide: true });

  useEffect(() => {
    if (!map || !data) return;
    map.flyTo({
      center: [data.lon, data.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 700,
    });
  }, [map, data]);

  const expiresAtMs = useMemo(
    () => (data?.expires_at != null ? toMillis(data.expires_at) : null),
    [data?.expires_at],
  );
  const isExpired = expiresAtMs != null && expiresAtMs <= Date.now();

  const headerActions = <PanelHeaderActions share={{ onClick: share }} />;

  if (isLoading) {
    return (
      <DiscoverSidebar
        title="Incident"
        onClose={close}
        onBack={back}
        backLabel="Back"
        rightHeaderSlot={headerActions}
        mobileCollapsible
      >
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading incident…
        </p>
      </DiscoverSidebar>
    );
  }

  if (error || !data) {
    return (
      <DiscoverSidebar
        title="Incident"
        onClose={close}
        onBack={back}
        backLabel="Back"
        rightHeaderSlot={headerActions}
        mobileCollapsible
      >
        <p className="text-sm text-red-500">
          {error instanceof Error ? error.message : "Incident not found"}
        </p>
      </DiscoverSidebar>
    );
  }

  return (
    <DiscoverSidebar
      title="Incident"
      onClose={close}
      onBack={back}
      backLabel="Back"
      rightHeaderSlot={headerActions}
      mobileCollapsible
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {titleCaseSnake(String(data.incident_type))}
            </h2>
            <p className="text-[11px] uppercase text-muted">Incident report</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${severityClass(String(data.severity))}`}
            >
              {String(data.severity)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                isExpired
                  ? "bg-zinc-500/20 text-zinc-700 dark:text-zinc-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {isExpired ? "Expired" : "Active"}
            </span>
          </div>
        </div>

        {data.description && (
          <p className="whitespace-pre-line text-sm text-foreground">
            {data.description}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted">
          <User className="h-3.5 w-3.5" />
          <UserAvatar userId={authorId} size={6} />
          <span className="truncate text-foreground">{authorName}</span>
        </div>

        <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-muted">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-mono text-foreground">
              {data.lat.toFixed(6)}, {data.lon.toFixed(6)}
            </span>
          </div>
          {data.heading != null && (
            <div className="mt-1 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5" />
              <span>{Math.round(data.heading)}° heading</span>
            </div>
          )}
          {expiresAtMs != null && (
            <div className="mt-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Expires {new Date(expiresAtMs).toLocaleString()}</span>
            </div>
          )}
        </div>

        {data.attachments.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
              Attachments
            </h3>
            <ul className="space-y-1">
              {data.attachments.map((uri) => (
                <li key={uri}>
                  <a
                    href={uri}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate rounded-md border border-border bg-surface px-2 py-1 text-xs text-accent hover:underline"
                  >
                    {uri}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-muted">
          Indexed {new Date(toMillis(data.indexed_at)).toLocaleString()}
        </p>

        <ResourceDiscussion
          resourceType="incidents"
          authorId={authorId}
          resourceId={incidentId}
          parentPreview={
            data.description?.trim() || titleCaseSnake(String(data.incident_type))
          }
        />
      </div>
    </DiscoverSidebar>
  );
}
