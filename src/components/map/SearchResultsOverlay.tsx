import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useViewportBitcoinPois } from "@/lib/btcmap/use-viewport-bitcoin-pois";
import { useOsmLookupBatch } from "@/lib/api/hooks";
import { categoryIcon } from "@/lib/places/category-icon";
import { PlaceBalloon, type BalloonVariant } from "./PlaceBalloon";
import type { EnrichedResult } from "@/lib/places/enrich-search";

interface SearchResultsOverlayProps {
  results: EnrichedResult[];
  searchQuery: string;
  searchMode: string;
}

interface SearchFeature {
  key: string;
  osmType: string;
  osmId: number;
  lat: number;
  lon: number;
  rating: string | null;
  variant: BalloonVariant;
  name: string;
}

/**
 * Renders search hits as the same teardrop balloons every other place
 * surface uses (PlaceAnnotationsLayer + selected pin), so the user
 * doesn't have to re-learn a marker style mid-flow. Reuses the
 * `PlaceBalloon` SVG with the Mapky / Bitcoin / both variant logic
 * driven by the indexer's enrichment + the shared Bitcoin viewport
 * cache.
 *
 * Click → `setPendingPoiClick` fires the same place-panel hand-off
 * the previous overlay used, so back-navigation stays "back to search".
 */
export function SearchResultsOverlay({
  results,
  searchQuery,
  searchMode,
}: SearchResultsOverlayProps) {
  const map = useMapStore((s) => s.map);

  // Viewport-snapped Bitcoin keys → drives "both" variant on results
  // that are also tagged Bitcoin-accepting. Same shared hook the
  // PlaceAnnotationsLayer uses, so this is a free cache hit.
  const zoomEnough = useMapStore((s) => s.zoom >= 9);
  const bounds = useMemo(() => {
    if (!map) return null;
    const b = map.getBounds();
    return {
      minLat: b.getSouth(),
      minLon: b.getWest(),
      maxLat: b.getNorth(),
      maxLon: b.getEast(),
    };
  }, [map]);
  const { keys: bitcoinKeys } = useViewportBitcoinPois(bounds, zoomEnough);

  // Build the feature set the balloons render against.
  const features = useMemo<SearchFeature[]>(() => {
    return results.map(({ result, place }) => {
      const key = `${result.osm_type}:${result.osm_id}`;
      const ratedNum =
        place && place.review_count > 0 ? place.avg_rating / 2 : null;
      const isBitcoin = bitcoinKeys.has(key);
      const variant: BalloonVariant = isBitcoin
        ? ratedNum != null
          ? "both"
          : "bitcoin"
        : "mapky";
      return {
        key,
        osmType: result.osm_type,
        osmId: result.osm_id,
        lat: result.lat,
        lon: result.lon,
        rating: ratedNum != null ? ratedNum.toFixed(1) : null,
        variant,
        name: result.name,
      };
    });
  }, [results, bitcoinKeys]);

  // Batched Nominatim lookup for category icons (free cache hit when
  // the user just left /places, since PlaceList seeds the same key).
  const lookupRefs = useMemo(
    () => features.map((f) => ({ osmType: f.osmType, osmId: f.osmId })),
    [features],
  );
  const { byKey: nominatimByKey } = useOsmLookupBatch(lookupRefs);
  const iconByKey = useMemo(() => {
    const m = new Map<string, ReturnType<typeof categoryIcon> | null>();
    for (const f of features) {
      // Indexed by key (not array position) so a reordered features
      // list can't pin one place's icon onto another's balloon.
      const type = nominatimByKey.get(f.key)?.type;
      if (!type || type === "yes" || type === "unclassified") {
        m.set(f.key, null);
      } else {
        m.set(f.key, categoryIcon(type));
      }
    }
    return m;
  }, [features, nominatimByKey]);

  // Marker lifecycle — same pattern PlaceAnnotationsLayer uses
  // (HTML markers + portal'd PlaceBalloon). State (not just ref) for
  // the elements so the portal tree re-renders once the host divs
  // exist; without that, balloons would briefly render empty.
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const [elements, setElements] = useState<
    ReadonlyMap<string, HTMLDivElement>
  >(() => new Map());

  useEffect(() => {
    if (!map) return;
    const wantedKeys = new Set(features.map((f) => f.key));
    setElements((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const key of next.keys()) {
        if (wantedKeys.has(key)) continue;
        const m = markersRef.current.get(key);
        if (m) {
          m.remove();
          markersRef.current.delete(key);
        }
        next.delete(key);
        changed = true;
      }
      for (const f of features) {
        let marker = markersRef.current.get(f.key);
        if (!marker) {
          const el = document.createElement("div");
          el.className = "mapky-place-balloon";
          el.style.cursor = "pointer";
          marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([f.lon, f.lat])
            .addTo(map);
          markersRef.current.set(f.key, marker);
          next.set(f.key, el);
          changed = true;
        } else {
          marker.setLngLat([f.lon, f.lat]);
        }
      }
      return changed ? next : prev;
    });
  }, [map, features]);

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const m of markers.values()) m.remove();
      markers.clear();
    };
  }, []);

  // Hover popup — shares CSS with the basemap / PlaceAnnotationsLayer
  // tooltip so search markers feel like part of the same family.
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    if (!map) return;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "mapky-hover-tooltip",
      offset: [0, -10],
    });
    hoverPopupRef.current = popup;
    return () => {
      popup.remove();
      hoverPopupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const cleanups: Array<() => void> = [];
    for (const f of features) {
      const el = elements.get(f.key);
      if (!el) continue;
      const onEnter = () => {
        const popup = hoverPopupRef.current;
        if (!popup) return;
        popup
          .setLngLat([f.lon, f.lat])
          .setHTML(`<span>${escapeHtml(f.name)}</span>`)
          .addTo(map);
      };
      const onLeave = () => {
        hoverPopupRef.current?.remove();
      };
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
      cleanups.push(() => {
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
      });
    }
    return () => {
      for (const fn of cleanups) fn();
      hoverPopupRef.current?.remove();
    };
  }, [map, features, elements]);

  const handleClick = useCallback(
    (f: SearchFeature) => {
      useUiStore.getState().setPendingPoiClick({
        lng: f.lon,
        lat: f.lat,
        name: f.name,
        kind: "",
        osmType: f.osmType,
        osmId: f.osmId,
        fromSearch: { query: searchQuery, mode: searchMode },
      });
    },
    [searchQuery, searchMode],
  );

  return (
    <>
      {features.map((f) => {
        const el = elements.get(f.key);
        if (!el) return null;
        return createPortal(
          <button
            type="button"
            aria-label={`Open ${f.name}`}
            onClick={(e) => {
              e.stopPropagation();
              handleClick(f);
            }}
            className="block bg-transparent p-0 transition-transform hover:scale-110"
          >
            <PlaceBalloon
              variant={f.variant}
              rating={f.rating}
              Icon={iconByKey.get(f.key) ?? null}
            />
          </button>,
          el,
          f.key,
        );
      })}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
