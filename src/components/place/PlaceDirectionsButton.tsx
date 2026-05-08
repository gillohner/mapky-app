import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";
import { usePlaceFullDetail } from "@/lib/api/hooks";
import { lookupOsmElement } from "@/lib/api/nominatim";
import { useUserLocation } from "@/lib/hooks/useUserLocation";

interface PlaceDirectionsButtonProps {
  osmType: string;
  osmId: number;
  /**
   * Optional fallback name when the indexer doesn't have the place yet.
   * Currently unused at the click-handler level — the URL-stateful
   * directions route shows just the OSM ref label until Nominatim
   * resolves a friendlier name. Kept in the API for future use.
   */
  fallbackName?: string;
}

/**
 * "Directions" CTA on the place panel. Opens directions mode with this
 * place as the destination and "Your location" as the origin if
 * geolocation is granted.
 *
 * Coordinate resolution order:
 *   1. Mapky indexer (`usePlaceDetail`) — fast, available when the place
 *      already has reviews/tags.
 *   2. Nominatim OSM lookup — fallback for places not yet indexed in
 *      Mapky. Slower but always available for valid OSM elements.
 *
 * Anyone can use this — directions is a fully public flow. Saving the
 * route is what requires sign-in, handled later in RouteSummaryCard.
 */
export function PlaceDirectionsButton({
  osmType,
  osmId,
  fallbackName: _fallbackName,
}: PlaceDirectionsButtonProps) {
  const navigate = useNavigate();
  const { data: place } = usePlaceFullDetail(osmType, osmId);
  const userLoc = useUserLocation();
  const [resolving, setResolving] = useState(false);

  const handleClick = async () => {
    setResolving(true);
    try {
      // 1. Indexer (fast).
      let lat = place?.lat;
      let lon = place?.lon;

      // 2. Nominatim fallback for unindexed OSM places.
      if (lat == null || lon == null) {
        try {
          const nom = await lookupOsmElement(osmType, osmId);
          if (nom?.lat != null && nom?.lon != null) {
            lat = nom.lat;
            lon = nom.lon;
          }
        } catch {
          // fall through to error toast below
        }
      }

      if (lat == null || lon == null) {
        toast.error(
          "Couldn't locate this place — try opening directions and searching by name.",
        );
        return;
      }

      // GPS origin if available; else leave empty so the user fills it.
      const fromLoc = userLoc.location ?? (await userLoc.request());

      // Navigate to /directions with this place encoded as the To slot.
      // Using URL params (vs. setState directly) gives us shareable links
      // and reload-preservation for free — the /directions route file
      // hydrates the store from the URL on mount.
      const fromParam = fromLoc ? "gps" : undefined;
      const toParam = `${lat!.toFixed(6)},${lon!.toFixed(6)}@${osmType}:${osmId}`;
      navigate({
        to: "/directions",
        search: {
          from: fromParam,
          to: toParam,
          // Keep mode unset to inherit whatever the user last picked
          // (the store remembers across navigation within a session).
        },
      });
    } finally {
      setResolving(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={resolving}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
      title="Get directions to this place"
    >
      {resolving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Navigation className="h-4 w-4" />
      )}
      Directions
    </button>
  );
}
