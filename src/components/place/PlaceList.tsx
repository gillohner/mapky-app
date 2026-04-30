import { useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, Star, Tag as TagIcon } from "lucide-react";
import { useViewportPlaces, useOsmLookup } from "@/lib/api/hooks";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useMapStore } from "@/stores/map-store";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { fallbackPlaceLabel } from "@/lib/map/osm-url";
import type { PlaceDetails } from "@/types/mapky";

/**
 * Places discover sidebar — feed of indexed places in the current map
 * viewport. Search lives in the global top SearchBar (places / tags /
 * routes modes), so this list is just a clean preview-of-places.
 */
export function PlaceList() {
  const navigate = useNavigate();
  const bbox = useViewportBounds();
  const viewport = useViewportPlaces(bbox);
  // Browsing places → fade other Mapky data so the focused layer pops.
  useAutoFocusLayer("places");
  const close = () => navigate({ to: "/" });

  return (
    <DiscoverSidebar title="Places" onClose={close}>
      {viewport.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {viewport.error && (
        <p className="text-xs text-red-500">
          {(viewport.error as Error).message}
        </p>
      )}
      {viewport.data && viewport.data.length === 0 && (
        <p className="text-xs text-muted">
          No indexed places in this area yet. Try zooming out or panning.
        </p>
      )}
      <div className="space-y-1.5">
        {viewport.data?.map((p) => (
          <PlaceRow key={`${p.osm_type}-${p.osm_id}`} place={p} />
        ))}
      </div>
    </DiscoverSidebar>
  );
}

function PlaceRow({ place }: { place: PlaceDetails }) {
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const { data: nominatim } = useOsmLookup(place.osm_type, place.osm_id, true);

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    fallbackPlaceLabel(place.osm_type, place.osm_id);
  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";

  return (
    <button
      onClick={() => {
        if (map && place.lat && place.lon) {
          map.flyTo({
            center: [place.lon, place.lat],
            zoom: 17,
            duration: 800,
          });
        }
        navigate({
          to: "/place/$osmType/$osmId",
          params: { osmType: place.osm_type, osmId: String(place.osm_id) },
        });
      }}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-accent"
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{name}</p>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          {place.review_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3" />
              {place.review_count}
            </span>
          )}
          {place.tag_count > 0 && (
            <span className="flex items-center gap-0.5">
              <TagIcon className="h-3 w-3" />
              {place.tag_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
