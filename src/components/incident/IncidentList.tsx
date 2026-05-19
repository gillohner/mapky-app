import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Crosshair,
  Loader2,
  Navigation,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  DiscoverFilter,
  type CategoryOption,
} from "@/components/discover/Filter";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import {
  DiscoverSidebar,
  type DiscoverTab,
} from "@/components/discover/DiscoverSidebar";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useFrozenWhile } from "@/hooks/use-frozen-while";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useUserIncidents, useViewportIncidents } from "@/lib/api/hooks";
import { createIncident } from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { useMapStore } from "@/stores/map-store";
import type {
  IncidentDetails,
  IncidentSeverity,
  IncidentType,
} from "@/types/mapky";
import { Route as IncidentsRoute } from "@/routes/incidents";
import type maplibregl from "maplibre-gl";

type Tab = "mine" | "viewport";
type ExpiryChoice = "none" | "1h" | "6h" | "24h";

const INCIDENT_TYPES: IncidentType[] = [
  "accident",
  "hazard",
  "road_closure",
  "police",
  "flooding",
  "ice_snow",
  "poor_visibility",
  "danger",
  "other",
];

const INCIDENT_SEVERITIES: IncidentSeverity[] = ["low", "medium", "high"];

function titleCaseSnake(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toMillis(ts: number): number {
  if (ts > 1e14) return Math.floor(ts / 1000);
  if (ts < 1e12) return ts * 1000;
  return ts;
}

function stripAuthorPrefix(authorId: string, incidentId: string): string {
  const prefix = `${authorId}:`;
  if (incidentId.startsWith(prefix)) return incidentId.slice(prefix.length);
  const idx = incidentId.indexOf(":");
  return idx >= 0 ? incidentId.slice(idx + 1) : incidentId;
}

function severityBadge(severity: string): string {
  if (severity === "high") {
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  }
  if (severity === "medium") {
    return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  }
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

function parseOptionalNumber(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function expirySeconds(choice: ExpiryChoice): number | null {
  if (choice === "none") return null;
  if (choice === "1h") return 3600;
  if (choice === "6h") return 21_600;
  return 86_400;
}

function initialCoords(
  map: ReturnType<typeof useMapStore.getState>["map"],
  fallbackCenter: [number, number],
): { lat: string; lon: string } {
  if (map) {
    const c = map.getCenter();
    return { lat: c.lat.toFixed(6), lon: c.lng.toFixed(6) };
  }
  return {
    lat: fallbackCenter[1].toFixed(6),
    lon: fallbackCenter[0].toFixed(6),
  };
}

/**
 * Incidents discover sidebar with two flows:
 * - Browse incidents in "Mine" / "In this area"
 * - Report a new incident from map center or manual coordinates
 */
export function IncidentList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = IncidentsRoute.useSearch();
  const { publicKey, session } = useAuth();
  const map = useMapStore((s) => s.map);
  const center = useMapStore((s) => s.center);

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/incidents", search: { tab: next }, replace: true });
  };

  const [filter, setFilter] = useState("");
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeSeverity, setActiveSeverity] = useState<IncidentSeverity | null>(
    null,
  );
  const filterActive =
    filter.trim().length > 0 || activeType !== null || activeSeverity !== null;

  const liveBbox = useViewportBounds(tab === "viewport");
  const bbox = useFrozenWhile(liveBbox, filterActive);

  const mine = useUserIncidents(tab === "mine" ? publicKey : null);
  const nearby = useViewportIncidents(tab === "viewport" ? bbox : null);
  const list = tab === "mine" ? mine : nearby;

  const tabs: DiscoverTab[] = useMemo(() => {
    const out: DiscoverTab[] = [];
    if (publicKey) out.push({ id: "mine", label: "Mine" });
    out.push({ id: "viewport", label: "In this area" });
    return out;
  }, [publicKey]);

  const allIncidents = useMemo(() => {
    const data = list.data ?? [];
    return [...data].sort((a, b) => toMillis(b.indexed_at) - toMillis(a.indexed_at));
  }, [list.data]);

  const typeCategories = useMemo<CategoryOption[]>(() => {
    const counts = new Map<string, number>();
    for (const incident of allIncidents) {
      const key = String(incident.incident_type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        label: titleCaseSnake(value),
        count,
      }));
  }, [allIncidents]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return allIncidents.filter((incident) => {
      if (activeType && String(incident.incident_type) !== activeType) return false;
      if (activeSeverity && String(incident.severity) !== activeSeverity) {
        return false;
      }
      if (!needle) return true;
      return [
        incident.description,
        String(incident.incident_type),
        String(incident.severity),
      ]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(needle));
    });
  }, [allIncidents, filter, activeType, activeSeverity]);

  const close = () => navigate({ to: "/" });

  useAutoFocusLayer("incidents", { hide: true });

  const [composerOpen, setComposerOpen] = useState(false);
  const [incidentType, setIncidentType] = useState<IncidentType>("hazard");
  const [severity, setSeverity] = useState<IncidentSeverity>("medium");
  const [description, setDescription] = useState("");
  const [latInput, setLatInput] = useState(center[1].toFixed(6));
  const [lonInput, setLonInput] = useState(center[0].toFixed(6));
  const [headingInput, setHeadingInput] = useState("");
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>("6h");
  const [submitting, setSubmitting] = useState(false);
  const [pickingOnMap, setPickingOnMap] = useState(false);

  useEffect(() => {
    if (!map || !composerOpen || !pickingOnMap) return;

    const canvas = map.getCanvas();
    const previousCursor = canvas.style.cursor;
    canvas.style.cursor = "crosshair";

    const onClick = (e: maplibregl.MapMouseEvent) => {
      setLatInput(e.lngLat.lat.toFixed(6));
      setLonInput(e.lngLat.lng.toFixed(6));
      setPickingOnMap(false);
      e.originalEvent.stopPropagation();
      toast.success("Incident location selected");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickingOnMap(false);
      }
    };

    map.once("click", onClick);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      canvas.style.cursor = previousCursor;
      map.off("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [map, composerOpen, pickingOnMap]);

  const openComposer = () => {
    if (!session || !publicKey) {
      toast.info("Sign in to report incidents");
      navigate({ to: "/login" });
      return;
    }
    const seeded = initialCoords(map, center);
    setLatInput(seeded.lat);
    setLonInput(seeded.lon);
    setPickingOnMap(false);
    setComposerOpen(true);
  };

  const useMapCenter = () => {
    const seeded = initialCoords(map, center);
    setLatInput(seeded.lat);
    setLonInput(seeded.lon);
  };

  const submitIncident = async () => {
    if (!session || !publicKey) return;

    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      toast.error("Latitude must be between -90 and 90");
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      toast.error("Longitude must be between -180 and 180");
      return;
    }

    const heading = parseOptionalNumber(headingInput);
    if (headingInput.trim() && heading == null) {
      toast.error("Heading must be a number");
      return;
    }
    if (heading != null && (heading < 0 || heading > 360)) {
      toast.error("Heading must be between 0 and 360");
      return;
    }

    const expiresIn = expirySeconds(expiryChoice);
    const expiresAt =
      expiresIn != null ? Date.now() * 1000 + expiresIn * 1_000_000 : null;

    setSubmitting(true);
    try {
      const built = createIncident(publicKey, {
        incidentType,
        severity,
        lat,
        lon,
        heading,
        description: description.trim() || null,
        expiresAt,
      });
      await session.storage.putText(built.path as `/pub/${string}`, built.json);

      const optimistic: IncidentDetails = {
        id: `${publicKey}:${built.incidentId}`,
        author_id: publicKey,
        incident_type: incidentType,
        severity,
        lat,
        lon,
        heading,
        description: description.trim() || null,
        attachments: [],
        expires_at: expiresAt,
        indexed_at: Math.floor(Date.now() / 1000),
      };

      queryClient.setQueryData<IncidentDetails[]>(
        ["mapky", "incidents", "user", publicKey],
        (prev) => (prev ? [optimistic, ...prev] : [optimistic]),
      );

      queryClient.invalidateQueries({ queryKey: ["mapky", "incidents", "viewport"] });
      queryClient.invalidateQueries({
        queryKey: ["mapky", "incidents", "user", publicKey],
      });

      ingestUserIntoNexus(publicKey).then(() => {
        queryClient.invalidateQueries({
          queryKey: ["mapky", "incidents", "user", publicKey],
        });
        queryClient.invalidateQueries({
          queryKey: ["mapky", "incidents", "viewport"],
        });
      });

      setComposerOpen(false);
      setPickingOnMap(false);
      setDescription("");
      setHeadingInput("");
      toast.success("Incident reported");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to report incident";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DiscoverSidebar
      title="Incidents"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      <DiscoverNewButton
        onClick={() => {
          if (composerOpen) {
            setComposerOpen(false);
            setPickingOnMap(false);
            return;
          }
          openComposer();
        }}
        label={composerOpen ? "Cancel report" : "Report incident"}
      />

      {composerOpen && (
        <div className="mb-3 space-y-2 rounded-lg border border-border bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              <span>Type</span>
              <select
                value={incidentType}
                onChange={(e) => setIncidentType(e.target.value as IncidentType)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {titleCaseSnake(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span>Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                {INCIDENT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {titleCaseSnake(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-xs text-muted">
            <span>Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="What is happening here?"
              className="w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              <span>Latitude</span>
              <input
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span>Longitude</span>
              <input
                value={lonInput}
                onChange={(e) => setLonInput(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              <span>Heading (optional)</span>
              <input
                value={headingInput}
                onChange={(e) => setHeadingInput(e.target.value)}
                placeholder="0-360"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              <span>Expiry</span>
              <select
                value={expiryChoice}
                onChange={(e) => setExpiryChoice(e.target.value as ExpiryChoice)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="none">No expiry</option>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={useMapCenter}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted hover:text-foreground"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Use map center
            </button>
            <button
              onClick={() => {
                if (!map) {
                  toast.error("Map is not ready yet");
                  return;
                }
                setPickingOnMap((v) => !v);
              }}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                pickingOnMap
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-background text-muted hover:text-foreground"
              }`}
            >
              <Crosshair className="h-3.5 w-3.5" />
              {pickingOnMap ? "Click map..." : "Pick on map"}
            </button>
            <button
              onClick={submitIncident}
              disabled={submitting}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Reporting…
                </>
              ) : (
                <>
                  <Navigation className="h-3.5 w-3.5" />
                  Report
                </>
              )}
            </button>
          </div>

          {pickingOnMap && (
            <p className="text-[11px] text-muted">
              Click anywhere on the map to set incident coordinates. Press Esc
              to cancel.
            </p>
          )}
        </div>
      )}

      <DiscoverFilter
        value={filter}
        onChange={setFilter}
        placeholder="Filter by type, severity, description…"
        categories={typeCategories}
        activeCategory={activeType}
        onCategoryChange={setActiveType}
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {([null, ...INCIDENT_SEVERITIES] as const).map((s) => {
          const active = s === activeSeverity;
          const label = s ? titleCaseSnake(s) : "All severities";
          return (
            <button
              key={s ?? "all"}
              onClick={() => setActiveSeverity(s)}
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-background text-muted hover:border-accent"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading incidents…
        </p>
      )}
      {list.error && (
        <p className="text-xs text-red-500">{(list.error as Error).message}</p>
      )}

      {list.data && filtered.length === 0 && (
        <p className="text-xs text-muted">
          {filterActive
            ? "No incidents match your filters."
            : tab === "mine"
              ? "You have not reported any active incidents yet."
              : "No active incidents in this area."}
        </p>
      )}

      <div className="space-y-1.5">
        {filtered.map((incident) => {
          const incidentId = stripAuthorPrefix(incident.author_id, incident.id);
          const title =
            incident.description?.trim() ||
            titleCaseSnake(String(incident.incident_type));
          const expiresAt =
            incident.expires_at != null ? toMillis(incident.expires_at) : null;

          return (
            <button
              key={incident.id}
              onClick={() =>
                navigate({
                  to: "/incident/$authorId/$incidentId",
                  params: { authorId: incident.author_id, incidentId },
                })
              }
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent/60 hover:bg-background"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{title}</p>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase ${severityBadge(String(incident.severity))}`}
                    >
                      {String(incident.severity)}
                    </span>
                  </div>
                  <p className="text-xs uppercase text-muted">
                    {titleCaseSnake(String(incident.incident_type))}
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    {incident.lat.toFixed(5)}, {incident.lon.toFixed(5)}
                  </p>
                  {expiresAt != null && (
                    <p className="text-[11px] text-muted">
                      Expires {new Date(expiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!publicKey && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-muted">
          <ShieldAlert className="h-3.5 w-3.5" />
          Sign in to report your own incidents.
        </div>
      )}
    </DiscoverSidebar>
  );
}
