import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUiStore } from "@/stores/ui-store";

/**
 * Resolves pending map clicks → route navigation.
 * All map clicks carry osmType + osmId decoded directly from tile features.
 * No Nominatim — that's only used by the search bar.
 */
export function PoiClickHandler() {
  const pendingClick = useUiStore((s) => s.pendingPoiClick);
  const clearPendingPoiClick = useUiStore((s) => s.clearPendingPoiClick);
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingClick) return;

    const { lat, lng, osmType, osmId } = pendingClick;

    if (osmType && osmId) {
      navigate({
        to: "/place/$osmType/$osmId",
        params: {
          osmType,
          osmId: String(osmId),
        },
        search: {
          lat,
          lon: lng,
          name: pendingClick.name || undefined,
          kind: pendingClick.kind || undefined,
          ...(pendingClick.fromSearch
            ? {
                from: "search",
                fromSearchQuery: pendingClick.fromSearch.query,
                fromSearchMode: pendingClick.fromSearch.mode,
              }
            : {}),
        },
      });
    }

    clearPendingPoiClick();
  }, [pendingClick, clearPendingPoiClick, navigate]);

  return null;
}
