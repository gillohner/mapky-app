import { useState, useEffect } from "react";
import { X, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { usePlaceDetail } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import {
  encodeFeatureId,
  sourceLayersForType,
} from "@/lib/map/feature-id";
import { PlaceHeader } from "./PlaceHeader";
import { PlacePosts } from "./PlacePosts";
import { PlaceActions } from "./PlaceActions";

interface PlacePanelProps {
  osmType: string;
  osmId: number;
  fallbackLat?: number;
  fallbackLon?: number;
  /** Feature name from the tile (used for not-yet-indexed places) */
  tileName?: string;
  /** Feature kind from the tile */
  tileKind?: string;
}

export function PlacePanel({
  osmType,
  osmId,
  fallbackLat,
  fallbackLon,
  tileName,
  tileKind,
}: PlacePanelProps) {
  const navigate = useNavigate();
  const { data: place, isLoading, error } = usePlaceDetail(osmType, osmId);
  const [expanded, setExpanded] = useState(false);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSelectedFeature = useUiStore((s) => s.setSelectedFeature);

  // Signal sidebar open/close for map padding
  useEffect(() => {
    setSidebarOpen(true);
    return () => setSidebarOpen(false);
  }, [setSidebarOpen]);

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
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Place
          </span>
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
          {place && <PlaceContent osmType={osmType} osmId={osmId} place={place} />}
          {error && (
            <NotIndexedContent
              osmType={osmType}
              osmId={osmId}
              tileName={tileName}
              tileKind={tileKind}
            />
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

          {isLoading && <LoadingSkeleton />}
          {place && <PlaceHeader place={place} />}
          {error && (
            <NotIndexedHeader
              osmType={osmType}
              osmId={osmId}
              tileName={tileName}
              tileKind={tileKind}
            />
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
            {place && (
              <div className="space-y-4">
                <PlaceActions />
                <div className="border-t border-border pt-4">
                  <h3 className="mb-2 text-sm font-medium text-foreground">
                    Posts & Reviews
                  </h3>
                  <PlacePosts osmType={osmType} osmId={osmId} />
                </div>
              </div>
            )}
            {error && (
              <div className="space-y-3">
                <PlaceActions />
                <p className="text-center text-sm text-muted">
                  Be the first to review this place on Mapky!
                </p>
              </div>
            )}
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

function PlaceContent({
  osmType,
  osmId,
  place,
}: {
  osmType: string;
  osmId: number;
  place: import("@/types/mapky").PlaceDetails;
}) {
  return (
    <div className="space-y-4">
      <PlaceHeader place={place} />
      <div className="border-t border-border pt-4">
        <PlaceActions />
      </div>
      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-medium text-foreground">
          Posts & Reviews
        </h3>
        <PlacePosts osmType={osmType} osmId={osmId} />
      </div>
    </div>
  );
}


function NotIndexedHeader({
  osmType,
  osmId,
  tileName,
  tileKind,
}: {
  osmType: string;
  osmId: number;
  tileName?: string;
  tileKind?: string;
}) {
  const placeName = tileName || `${osmType}/${osmId}`;
  const locationType = tileKind?.replace(/_/g, " ") || null;
  const osmUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;

  return (
    <div>
      <h2 className="pr-16 text-lg font-semibold text-foreground">
        {placeName}
      </h2>
      {locationType && (
        <span className="mt-1 inline-block rounded bg-surface px-2 py-0.5 text-xs capitalize text-muted">
          {locationType}
        </span>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
          Not yet on Mapky
        </span>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          OSM
        </a>
      </div>
    </div>
  );
}

function NotIndexedContent({
  osmType,
  osmId,
  tileName,
  tileKind,
}: {
  osmType: string;
  osmId: number;
  tileName?: string;
  tileKind?: string;
}) {
  return (
    <div className="space-y-4">
      <NotIndexedHeader osmType={osmType} osmId={osmId} tileName={tileName} tileKind={tileKind} />
      <div className="border-t border-border pt-4">
        <PlaceActions />
      </div>
      <p className="text-center text-sm text-muted">
        Be the first to review this place on Mapky!
      </p>
    </div>
  );
}
