import { useState, useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown, ChevronLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { usePlaceDetail, useCollection } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import {
  encodeFeatureId,
  sourceLayersForType,
} from "@/lib/map/feature-id";
import { PlaceHeader } from "./PlaceHeader";
import { PlacePosts } from "./PlacePosts";
import { PlaceActions } from "./PlaceActions";
import { PlaceTags } from "./PlaceTags";
import { PlaceCollections } from "./PlaceCollections";

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
}: PlacePanelProps) {
  const navigate = useNavigate();
  const { data: place, isLoading, error } = usePlaceDetail(osmType, osmId);
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
      });
    }
    return () => setSelectedFeature(null);
  }, [osmType, osmId, place?.lat, place?.lon, fallbackLat, fallbackLon, setSelectedFeature]);

  const close = () => navigate({ to: "/" });

  return (
    <>
      {/* Desktop: full-height sidebar panel */}
      <div className="pointer-events-auto absolute inset-y-0 left-12 z-10 hidden w-[380px] flex-col border-r border-border bg-background shadow-xl md:flex">
        {/* Close button */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          {fromCollection && fromAuthor ? (
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading && <LoadingSkeleton />}
          {!isLoading && (
            <div className="space-y-4">
              <PlaceHeader osmType={osmType} osmId={osmId} place={place ?? undefined} tileName={tileName} tileKind={tileKind} />
              <div className="border-t border-border pt-4">
                <PlaceActions osmType={osmType} osmId={osmId} />
              </div>
              {(place || !error) && <PlaceTags osmType={osmType} osmId={osmId} />}
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-medium text-foreground">
                  Posts & Reviews
                </h3>
                {place ? (
                  <PlacePosts osmType={osmType} osmId={osmId} />
                ) : (
                  <p className="py-4 text-center text-sm text-muted">
                    Be the first to review this place on Mapky!
                  </p>
                )}
              </div>
              <PlaceCollections osmType={osmType} osmId={osmId} />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={`pointer-events-auto absolute bottom-0 left-0 right-0 z-10 flex flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl transition-[max-height] duration-300 ease-out md:hidden ${
          expanded ? "max-h-[85vh]" : "max-h-[200px]"
        }`}
      >
        <div className="flex-shrink-0 px-4 pt-2 pb-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
          {fromCollection && fromAuthor && (
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
          )}

          {isLoading && <LoadingSkeleton />}
          {!isLoading && (
            <PlaceHeader osmType={osmType} osmId={osmId} place={place ?? undefined} tileName={tileName} tileKind={tileKind} />
          )}

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
              <PlaceActions osmType={osmType} osmId={osmId} />
              {place ? (
                <>
                  <PlaceTags osmType={osmType} osmId={osmId} />
                  <div className="border-t border-border pt-4">
                    <h3 className="mb-2 text-sm font-medium text-foreground">
                      Posts & Reviews
                    </h3>
                    <PlacePosts osmType={osmType} osmId={osmId} />
                  </div>
                  <PlaceCollections osmType={osmType} osmId={osmId} />
                </>
              ) : (
                <p className="text-center text-sm text-muted">
                  Be the first to review this place on Mapky!
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-5 w-48 animate-pulse rounded bg-border" />
      <div className="h-4 w-32 animate-pulse rounded bg-border" />
      <div className="h-4 w-64 animate-pulse rounded bg-border" />
    </div>
  );
}

