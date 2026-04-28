import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type maplibregl from "maplibre-gl";
import { X, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { RouteCard } from "./RouteCard";
import type { ViewportBounds } from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Routes index page rendered in the standard left-anchored sidebar
 * layout (matches CollectionList): full-height left panel on desktop,
 * bottom sheet on mobile. The previous floating-card layout looked
 * different from the rest of the sidebar features (Collections, Search,
 * Place detail) and felt out of place.
 */
export function RouteList() {
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const map = useMapStore((s) => s.map);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const reset = useRouteCreationStore((s) => s.reset);
  const slots = useRouteCreationStore((s) => s.slots);
  const draftCount = readySlotCount(slots);

  const [tab, setTab] = useState<Tab>(publicKey ? "mine" : "viewport");

  // Track the viewport bbox in state so panning/zooming the map refetches.
  // Mirrors the pattern in MapkyPlacesLayer / CaptureMarkersLayer: read on
  // mount, then update on debounced `moveend`. Without this the bbox is
  // captured once at render and "In this area" stays frozen.
  const [bbox, setBbox] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const updateBounds = useCallback(() => {
    if (!map) return;
    setBbox(boundsOf(map));
  }, [map]);
  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 400);
    };
    if (map.loaded()) updateBounds();
    else map.once("load", updateBounds);
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBounds]);

  const userRoutes = useUserRoutes(tab === "mine" ? publicKey : null);
  const viewportRoutes = useViewportRoutes(tab === "viewport" ? bbox : null);

  const list = tab === "mine" ? userRoutes : viewportRoutes;

  // Pad fitBounds + Layers trigger out of the sidebar's way, same as
  // CollectionList / PlacePanel / DirectionsLayer.
  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  const handleCreate = () => {
    reset();
    navigate({ to: "/directions" });
  };

  const close = () => navigate({ to: "/" });

  const body = (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {publicKey && (
            <TabButton
              active={tab === "mine"}
              onClick={() => setTab("mine")}
              label="My routes"
            />
          )}
          <TabButton
            active={tab === "viewport"}
            onClick={() => setTab("viewport")}
            label="In this area"
          />
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
          title="Plan a new route"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {draftCount > 0 && (
        <button
          onClick={() => navigate({ to: "/directions" })}
          className="mb-3 w-full rounded-md border border-dashed border-accent bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
        >
          Resume draft ({draftCount} waypoints)
        </button>
      )}

      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {list.error && (
        <p className="text-xs text-red-500">{(list.error as Error).message}</p>
      )}
      {list.data && list.data.length === 0 && (
        <p className="text-xs text-muted">
          {tab === "mine"
            ? "You haven't saved any routes yet."
            : "No routes in this area yet."}
        </p>
      )}
      <div className="space-y-1.5">
        {list.data?.map((r) => <RouteCard key={r.id} route={r} />)}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: left-anchored full-height sidebar */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Routes
          </span>
          <button
            onClick={close}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{body}</div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex max-h-[85vh] flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl md:hidden">
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Routes</span>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
          {body}
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-border bg-surface text-foreground hover:border-accent"
      }`}
    >
      {label}
    </button>
  );
}

function boundsOf(map: maplibregl.Map): {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
} {
  const b = map.getBounds();
  return {
    minLat: b.getSouth(),
    minLon: b.getWest(),
    maxLat: b.getNorth(),
    maxLon: b.getEast(),
  };
}
