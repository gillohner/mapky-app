import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  LogIn,
  MoreHorizontal,
  Save,
  Ship,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  slotToWaypoint,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import {
  createRoute,
  updateRouteJson,
  type RouteActivityKey,
} from "@/lib/mapky-specs";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { fetchUserRoutes } from "@/lib/api/mapky";
import { waitForIndexed } from "@/lib/api/wait-for-indexed";
import { emitGpx, gpxFilename } from "@/lib/gpx/emit";
import type { RouteDetails } from "@/types/mapky";

export function RouteSummaryCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, publicKey, isAuthenticated } = useAuth();

  const isOpen = useRouteCreationStore((s) => s.isOpen);
  const slots = useRouteCreationStore((s) => s.slots);
  const computed = useRouteCreationStore((s) => s.computed);
  const alternates = useRouteCreationStore((s) => s.alternates);
  const selectedAlternate = useRouteCreationStore((s) => s.selectedAlternate);
  const computeError = useRouteCreationStore((s) => s.computeError);
  const computeErrorHint = useRouteCreationStore((s) => s.computeErrorHint);
  const isComputing = useRouteCreationStore((s) => s.isComputing);
  const showSaveForm = useRouteCreationStore((s) => s.showSaveForm);
  const setShowSaveForm = useRouteCreationStore((s) => s.setShowSaveForm);
  const isPublishing = useRouteCreationStore((s) => s.isPublishing);
  const setPublishing = useRouteCreationStore((s) => s.setPublishing);
  const activity = useRouteCreationStore((s) => s.activity);
  const name = useRouteCreationStore((s) => s.name);
  const setName = useRouteCreationStore((s) => s.setName);
  const description = useRouteCreationStore((s) => s.description);
  const setDescription = useRouteCreationStore((s) => s.setDescription);
  const mode = useRouteCreationStore((s) => s.mode);
  const editingFromAuthor = useRouteCreationStore((s) => s.editingFromAuthor);
  const editingFromId = useRouteCreationStore((s) => s.editingFromId);
  const reset = useRouteCreationStore((s) => s.reset);
  const close = useRouteCreationStore((s) => s.close);

  const [stepsOpen, setStepsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isOpen) return null;
  if (!computed && !isComputing && !computeError) return null;

  const usableWaypoints = slots
    .map((s) => slotToWaypoint(s))
    .filter((w): w is NonNullable<ReturnType<typeof slotToWaypoint>> =>
      w !== null,
    );
  const canCompute = usableWaypoints.length >= 2;

  const handleSaveStart = () => {
    if (!isAuthenticated) {
      toast.info("Sign in to save routes to your homeserver");
      navigate({ to: "/login" });
      return;
    }
    setShowSaveForm(true);
  };

  // Owners can either save in place or fork; non-owners can only fork.
  // Driven explicitly by which button the user clicked so the UI can
  // reflect the choice precisely.
  const canEditInPlace =
    mode === "edit" &&
    editingFromAuthor === publicKey &&
    editingFromId !== null;

  const handleSaveConfirm = async (options: { asNew: boolean } = { asNew: false }) => {
    if (!session || !publicKey || !computed || !canCompute) return;
    if (name.trim().length === 0) {
      toast.error("Give your route a name");
      return;
    }
    setPublishing(true);

    // Edit-in-place when the signed-in user is also the route's author
    // AND the user explicitly chose "Save changes". For "Save as new" or
    // any non-owner edit, mint a new TimestampId path. The watcher's PUT
    // is idempotent — same id MERGEs into the existing :MapkyAppRoute
    // node; a fresh id creates a new one.
    const isOwnerEdit = canEditInPlace && !options.asNew;

    const opts = {
      description: description.trim() || null,
      geometry: {
        polyline: computed.polyline,
        engine: computed.engine,
        costing: computed.costing,
        computed_at: computed.computed_at,
      },
      distance_m: computed.distance_m,
      elevation_gain_m: computed.elevation_gain_m ?? null,
      elevation_loss_m: computed.elevation_loss_m ?? null,
      estimated_duration_s: Math.round(computed.duration_s),
    };

    try {
      let path: `/pub/${string}`;
      let json: string;
      let routeId: string;

      if (isOwnerEdit) {
        json = updateRouteJson(
          name.trim(),
          activity as RouteActivityKey,
          usableWaypoints,
          opts,
        );
        routeId = editingFromId!;
        path = `/pub/mapky.app/routes/${routeId}` as `/pub/${string}`;
      } else {
        const result = createRoute(
          publicKey,
          name.trim(),
          activity as RouteActivityKey,
          usableWaypoints,
          opts,
        );
        json = result.json;
        path = result.path as `/pub/${string}`;
        routeId = result.path.split("/").pop()!;
      }

      await session.storage.putText(path, json);

      const optimistic: RouteDetails = {
        id: `${publicKey}:${routeId}`,
        author_id: publicKey,
        name: name.trim(),
        description: description.trim() || null,
        activity,
        distance_m: computed.distance_m,
        elevation_gain_m: computed.elevation_gain_m ?? null,
        elevation_loss_m: computed.elevation_loss_m ?? null,
        estimated_duration_s: Math.round(computed.duration_s),
        image_uri: null,
        min_lat: Math.min(...usableWaypoints.map((w) => w.lat)),
        min_lon: Math.min(...usableWaypoints.map((w) => w.lon)),
        max_lat: Math.max(...usableWaypoints.map((w) => w.lat)),
        max_lon: Math.max(...usableWaypoints.map((w) => w.lon)),
        start_lat: usableWaypoints[0].lat,
        start_lon: usableWaypoints[0].lon,
        waypoint_count: usableWaypoints.length,
        indexed_at: Date.now() / 1000,
      };
      await queryClient.cancelQueries({
        queryKey: ["mapky", "routes", "user", publicKey],
      });
      queryClient.setQueryData<RouteDetails[]>(
        ["mapky", "routes", "user", publicKey],
        (old) => {
          if (!old) return [optimistic];
          // Owner-edit replaces the existing entry by compound id.
          if (isOwnerEdit) {
            return old.map((r) => (r.id === optimistic.id ? optimistic : r));
          }
          return [...old, optimistic];
        },
      );

      toast.success(
        isOwnerEdit
          ? "Route updated"
          : mode === "edit"
            ? "Saved as new route"
            : "Route saved",
      );

      // Trigger ingest and wait until the indexer can serve this route
      // before navigating to the detail page — otherwise the detail page
      // briefly 404s and shows "Route not found" before re-loading.
      const routeReady = ingestUserIntoNexus(publicKey).then(() =>
        waitForIndexed(
          async () => {
            const list = await fetchUserRoutes(publicKey);
            return list.find((r) => r.id.endsWith(`:${routeId}`)) ?? null;
          },
          { intervalMs: 400, timeoutMs: 12_000, initialDelayMs: 200 },
        ),
      );
      // Race: navigate as soon as either the route is indexed OR a short
      // grace period elapses. Worst case the detail panel briefly shows
      // its loading spinner instead of "not found".
      await Promise.race([
        routeReady,
        new Promise((r) => setTimeout(r, 4_000)),
      ]);
      queryClient.invalidateQueries({
        queryKey: ["mapky", "routes", "user", publicKey],
      });
      // Owner edit: also bust the route detail cache so the viewer
      // refetches the fresh metadata + body.
      if (isOwnerEdit) {
        queryClient.invalidateQueries({
          queryKey: ["mapky", "route", publicKey, routeId],
        });
        queryClient.invalidateQueries({
          queryKey: ["mapky", "route-body", publicKey, routeId],
        });
      }
      reset();
      navigate({
        to: "/route/$authorId/$routeId",
        params: { authorId: publicKey, routeId },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save route");
    } finally {
      setPublishing(false);
    }
  };

  const handleExportGpx = () => {
    if (!computed) return;
    const gpxName = name.trim() || "Route";
    const gpx = emitGpx({
      name: gpxName,
      description: description.trim() || null,
      waypoints: usableWaypoints,
      geometry: computed.decoded.length >= 2 ? computed.decoded : null,
    });
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = gpxFilename(gpxName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-background">
      {!showSaveForm && (
        <div className="p-3">
          {isComputing && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Snapping route to roads…
            </p>
          )}
          {computeError && (
            <div className="rounded-md border border-red-300 bg-red-50 px-2 py-1.5 text-xs dark:border-red-800/60 dark:bg-red-950/40">
              <p className="font-medium text-red-700 dark:text-red-300">
                {computeError}
              </p>
              {computeErrorHint && (
                <p className="mt-0.5 text-red-600/80 dark:text-red-300/70">
                  {computeErrorHint}
                </p>
              )}
            </div>
          )}
          {computed && alternates.length > 0 && (
            <p className="mb-1.5 text-[10px] text-muted">
              {alternates.length} alternative{alternates.length === 1 ? "" : "s"} on the map — tap any route to switch
              {selectedAlternate > 0 && " · viewing alternative"}
            </p>
          )}
          {computed && (
            <>
              {/* Row 1: stats. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-semibold text-foreground">
                  {formatDistance(computed.distance_m)}
                </span>
                <span className="text-sm text-muted">
                  · {formatDuration(computed.duration_s)}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  · {activity}
                </span>
              </div>
              {/* Row 2: primary action + overflow + close. Save expands to
                  fill the available width so it stays the dominant target;
                  GPX and other power-user actions live in the kebab menu. */}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={handleSaveStart}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  {isAuthenticated ? (
                    <Save className="h-3.5 w-3.5" />
                  ) : (
                    <LogIn className="h-3.5 w-3.5" />
                  )}
                  {isAuthenticated ? "Save" : "Sign in to save"}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setMoreOpen((v) => !v)}
                    className="rounded-md border border-border bg-surface p-1.5 text-muted hover:border-accent hover:text-foreground"
                    aria-label="More actions"
                    title="More"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                  {moreOpen && (
                    <div
                      className="absolute right-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-border bg-background p-1 shadow-lg"
                      onMouseLeave={() => setMoreOpen(false)}
                    >
                      <button
                        onClick={() => {
                          handleExportGpx();
                          setMoreOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-surface"
                      >
                        <Download className="h-3.5 w-3.5 text-muted" />
                        Export GPX
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    reset();
                    close();
                  }}
                  className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {(computed.elevation_gain_m ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-muted">
                  ↑ {Math.round(computed.elevation_gain_m ?? 0)} m  ·  ↓{" "}
                  {Math.round(computed.elevation_loss_m ?? 0)} m
                </p>
              )}
              {computed.hasFerry && (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Ship className="mt-0.5 h-3 w-3 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">Route includes a ferry</p>
                    <p className="text-amber-700/80 dark:text-amber-300/70">
                      We don't know if it actually runs — verify the
                      schedule. Public transit routing is on the roadmap.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showSaveForm && (
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {mode === "edit" ? "Save as new route" : "Save route"}
            </h3>
            <button
              onClick={() => setShowSaveForm(false)}
              className="rounded p-1 text-muted hover:text-foreground"
              aria-label="Cancel save"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            placeholder="Route name"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            autoFocus
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="Description (optional)"
            rows={2}
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setStepsOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            >
              {stepsOpen ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {usableWaypoints.length} waypoints
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowSaveForm(false)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:border-border/60"
            >
              Cancel
            </button>

            {/* Owner-edit gets two clear options; everyone else (non-owner
                editing, or fresh create) gets a single primary action with
                a label that matches the actual behavior. */}
            {canEditInPlace ? (
              <>
                <button
                  onClick={() => handleSaveConfirm({ asNew: true })}
                  disabled={!name.trim() || isPublishing}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-foreground hover:border-accent disabled:opacity-50"
                  title="Save as a new route (keeps the original)"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save as new
                </button>
                <button
                  onClick={() => handleSaveConfirm({ asNew: false })}
                  disabled={!name.trim() || isPublishing}
                  className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  title="Update the original route in place"
                >
                  {isPublishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save changes
                </button>
              </>
            ) : (
              <button
                onClick={() => handleSaveConfirm({ asNew: false })}
                disabled={!name.trim() || isPublishing}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                title={
                  mode === "edit"
                    ? "Save a copy of this route to your homeserver"
                    : "Save this route to your homeserver"
                }
              >
                {isPublishing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {mode === "edit" ? "Save as my route" : "Save route"}
              </button>
            )}
          </div>
          {stepsOpen && (
            <ul className="rounded-md border border-border bg-surface p-1.5 text-[11px] text-muted">
              {slots
                .filter((s) => s.kind !== "empty")
                .map((s, i, all) => (
                  <li key={s.id} className="flex items-center gap-2 py-0.5">
                    <span className="font-mono">
                      {i === 0 ? "A" : i === all.length - 1 ? "B" : i}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 2 : 1)} km`;
}

function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
