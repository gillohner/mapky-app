import { useState, useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown, ChevronLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { usePlaceDetail, useCollection } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useBackOr } from "@/hooks/use-back-or";
import {
  encodeFeatureId,
  sourceLayersForType,
} from "@/lib/map/feature-id";
import { PlaceHeader } from "./PlaceHeader";
import { PlacePosts } from "./PlacePosts";
import { PlaceActions } from "./PlaceActions";
import { PlaceDirectionsButton } from "./PlaceDirectionsButton";
import { PlaceTags } from "./PlaceTags";
import { PlaceCollections } from "./PlaceCollections";
import { PlaceRoutes } from "./PlaceRoutes";

interface PlacePanelProps {
  osmType: string;
  osmId: number;
  fallbackLat?: number;
  fallbackLon?: number;
  /** Feature name from the tile (used for not-yet-indexed places) */
  tileName?: string;
  /** Feature kind from the tile */
  tileKind?: string;
  /** Back-navigation: collection author */
  fromAuthor?: string;
  /** Back-navigation: collection ID */
  fromCollection?: string;
  /** Back-navigation: search query */
  fromSearchQuery?: string;
  /** Back-navigation: search mode */
  fromSearchMode?: string;
  /** Back-navigation: source view */
  from?: string;
}

export function PlacePanel({
  osmType,
  osmId,
  fallbackLat,
  fallbackLon,
  tileName,
  tileKind,
  fromAuthor,
  fromCollection,
  fromSearchQuery,
  fromSearchMode,
  from,
}: PlacePanelProps) {
  const navigate = useNavigate();
  const { data: place } = usePlaceDetail(osmType, osmId);
  const { data: parentCollection } = useCollection(
    fromAuthor ?? "",
    fromCollection ?? "",
  );
  const [expanded, setExpanded] = useState(false);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSelectedFeature = useUiStore((s) => s.setSelectedFeature);

  const map = useMapStore((s) => s.map);

  // Signal sidebar open/close for map padding
  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

  useAutoFocusLayer("places");

  // Fly to place when coordinates are available (from search params or API).
  // Delay past the sidebar padding easeTo (300ms) so it doesn't get cancelled.
  const flyDone = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (flyDone.current) return;
    // Use fallback coords first, then place API coords when they load
    const lat = fallbackLat ?? place?.lat;
    const lon = fallbackLon ?? place?.lon;
    if (lat == null || lon == null) return;
    flyDone.current = true;
    const t = setTimeout(() => {
      map.flyTo({ center: [lon, lat], zoom: 17, duration: 1500 });
    }, 350);
    return () => clearTimeout(t);
  }, [map, fallbackLat, fallbackLon, place?.lat, place?.lon]);

  // Highlight the selected tile feature
  useEffect(() => {
    const lat = place?.lat ?? fallbackLat;
    const lon = place?.lon ?? fallbackLon;
    const fid = encodeFeatureId(osmType, osmId);
    if (fid && lat != null && lon != null) {
      setSelectedFeature({
        osmType,
        osmId,
        featureId: fid,
        sourceLayers: sourceLayersForType(osmType),
        lng: lon,
        lat,
        name: tileName,
      });
    }
    return () => setSelectedFeature(null);
  }, [osmType, osmId, place?.lat, place?.lon, tileName, fallbackLat, fallbackLon, setSelectedFeature]);

  // Close → history.back so the user lands on whatever surface they
  // came from (places list, search, collection, my-posts) with its
  // URL state intact. Falls back to "/" for deep links.
  const close = useBackOr(() => navigate({ to: "/" }));

  return (
    <>
      {/* Desktop: full-height sidebar panel */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        {/* Close button */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          {fromSearchQuery ? (
            <button
              onClick={() =>
                navigate({
                  to: "/search",
                  search: { q: fromSearchQuery, mode: (fromSearchMode as "places" | "tags") ?? "places" },
                })
              }
              className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Search results
            </button>
          ) : fromCollection && fromAuthor ? (
            <button
              onClick={() =>
                navigate({
                  to: "/collection/$authorId/$collectionId",
                  params: { authorId: fromAuthor, collectionId: fromCollection },
                })
              }
              className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {parentCollection?.name ?? "Collection"}
            </button>
          ) : from === "my-posts" ? (
            <button
              onClick={() => navigate({ to: "/my-posts" })}
              className="flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              My Posts
            </button>
          ) : (
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Place
            </span>
          )}
          <button
            onClick={close}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content. Children render unconditionally — gating
            them on isLoading caused a mount/unmount feedback loop when a
            child (PlaceDirectionsButton) also subscribes to usePlaceDetail:
            its mount triggered a refetch, which flipped isLoading true,
            which unmounted the child, which on next render re-mounted
            and re-triggered the refetch (~50× per second). Each child
            renders its own loading state. */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-4">
            <PlaceHeader osmType={osmType} osmId={osmId} place={place ?? undefined} tileName={tileName} tileKind={tileKind} />
            <PlaceDirectionsButton osmType={osmType} osmId={osmId} fallbackName={tileName} />
            <div className="border-t border-border pt-4">
              <PlaceActions osmType={osmType} osmId={osmId} />
            </div>
            <PlaceTags osmType={osmType} osmId={osmId} />
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-medium text-foreground">
                Posts & Reviews
              </h3>
              <PlacePosts osmType={osmType} osmId={osmId} />
            </div>
            <PlaceCollections osmType={osmType} osmId={osmId} />
            <PlaceRoutes osmType={osmType} osmId={osmId} />
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={`pointer-events-auto absolute bottom-0 left-12 right-0 z-10 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-[max-height] duration-300 ease-out md:hidden ${
          expanded ? "max-h-[85vh]" : "max-h-[200px]"
        }`}
      >
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          {fromSearchQuery ? (
            <button
              onClick={() =>
                navigate({
                  to: "/search",
                  search: { q: fromSearchQuery, mode: (fromSearchMode as "places" | "tags") ?? "places" },
                })
              }
              className="mb-1 flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              Search results
            </button>
          ) : fromCollection && fromAuthor ? (
            <button
              onClick={() =>
                navigate({
                  to: "/collection/$authorId/$collectionId",
                  params: { authorId: fromAuthor, collectionId: fromCollection },
                })
              }
              className="mb-1 flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              {parentCollection?.name ?? "Collection"}
            </button>
          ) : from === "my-posts" ? (
            <button
              onClick={() => navigate({ to: "/my-posts" })}
              className="mb-1 flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              My Posts
            </button>
          ) : null}

          <PlaceHeader osmType={osmType} osmId={osmId} place={place ?? undefined} tileName={tileName} tileKind={tileKind} />

          <div className="absolute right-2 top-2 flex items-center gap-1">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {expanded ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="flex-1 overflow-y-auto border-t border-border px-4 py-3">
            <div className="space-y-4">
              <PlaceDirectionsButton
                osmType={osmType}
                osmId={osmId}
                fallbackName={tileName}
              />
              <PlaceActions osmType={osmType} osmId={osmId} />
              <PlaceTags osmType={osmType} osmId={osmId} />
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  Posts & Reviews
                </h3>
                <PlacePosts osmType={osmType} osmId={osmId} />
              </div>
              <PlaceCollections osmType={osmType} osmId={osmId} />
              <PlaceRoutes osmType={osmType} osmId={osmId} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

