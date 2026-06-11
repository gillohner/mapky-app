import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { usePlaceFullDetail } from "@/lib/api/hooks";
import { useUiStore } from "@/stores/ui-store";
import { useMapStore } from "@/stores/map-store";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useBackOr } from "@/hooks/use-back-or";
import { useShareLink } from "@/lib/hooks/use-share-link";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import { PanelHeaderActions } from "@/components/shared/PanelHeaderActions";
import {
  encodeFeatureId,
  sourceLayersForType,
} from "@/lib/map/feature-id";
import { PlaceHeader } from "./PlaceHeader";
import { PlaceReviews } from "./PlaceReviews";
import { PlaceComments } from "./PlaceComments";
import { PlaceActions } from "./PlaceActions";
import { PlaceDirectionsButton } from "./PlaceDirectionsButton";
import { PlaceTags } from "./PlaceTags";
import { PlaceRoutes } from "./PlaceRoutes";
import { BitcoinAcceptance } from "./BitcoinAcceptance";

interface PlacePanelProps {
  osmType: string;
  osmId: number;
  fallbackLat?: number;
  fallbackLon?: number;
  /** Feature name from the tile (used for not-yet-indexed places) */
  tileName?: string;
  /** Feature kind from the tile */
  tileKind?: string;
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
  fromSearchQuery,
  fromSearchMode,
  from,
}: PlacePanelProps) {
  const navigate = useNavigate();
  const { data: place } = usePlaceFullDetail(osmType, osmId);
  const setSelectedFeature = useUiStore((s) => s.setSelectedFeature);
  const map = useMapStore((s) => s.map);

  // Hide captures entirely so this place stands alone, same rule the
  // places list uses.
  useAutoFocusLayer("places", { hide: true });

  // Fly to place when coordinates are available. Delay past the sidebar
  // padding easeTo (300ms) so it doesn't get cancelled.
  const flyDone = useRef(false);
  useEffect(() => {
    if (!map) return;
    if (flyDone.current) return;
    const lat = fallbackLat ?? place?.lat;
    const lon = fallbackLon ?? place?.lon;
    if (lat == null || lon == null) return;
    flyDone.current = true;
    const t = setTimeout(() => {
      map.flyTo({ center: [lon, lat], zoom: 17, duration: 1500 });
    }, 350);
    return () => clearTimeout(t);
  }, [map, fallbackLat, fallbackLon, place?.lat, place?.lon]);

  // Highlight the selected tile feature.
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

  // Top-right X always closes the entire sidebar back to the map.
  const close = () => navigate({ to: "/" });

  // Top-left back arrow steps back through history. Fallback (deep
  // link) navigates to whichever surface this place was opened from.
  const fallback = () => {
    if (fromSearchQuery) {
      navigate({
        to: "/search",
        search: {
          q: fromSearchQuery,
          mode: (fromSearchMode as "places" | "tags") ?? "places",
        },
      });
    } else if (from === "my-posts") {
      navigate({ to: "/my-posts" });
    } else {
      navigate({ to: "/places" });
    }
  };
  const back = useBackOr(fallback);
  const backLabel = fromSearchQuery
    ? "Search results"
    : from === "my-posts"
        ? "My Posts"
        : "Places";

  const share = useShareLink({ kind: "place", osmType, osmId });
  const headerActions = <PanelHeaderActions share={{ onClick: share }} />;

  return (
    <DiscoverSidebar
      title="Place"
      onClose={close}
      onBack={back}
      backLabel={backLabel}
      rightHeaderSlot={headerActions}
      mobileCollapsible
    >
      <div className="space-y-4">
        <PlaceHeader
          osmType={osmType}
          osmId={osmId}
          place={place ?? undefined}
          tileName={tileName}
          tileKind={tileKind}
        />
        <BitcoinAcceptance osmType={osmType} osmId={osmId} />
        <PlaceDirectionsButton osmType={osmType} osmId={osmId} fallbackName={tileName} />
        <div className="border-t border-border pt-4">
          <PlaceActions osmType={osmType} osmId={osmId} />
        </div>
        <PlaceTags osmType={osmType} osmId={osmId} />
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-medium text-foreground">Reviews</h3>
          <PlaceReviews osmType={osmType} osmId={osmId} />
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-medium text-foreground">Posts</h3>
          <PlaceComments osmType={osmType} osmId={osmId} />
        </div>
        <PlaceRoutes osmType={osmType} osmId={osmId} />
      </div>
    </DiscoverSidebar>
  );
}
