import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useViewportPlaces, useOsmLookupBatch } from "@/lib/api/hooks";
import { useViewportBitcoinPois } from "@/lib/btcmap/use-viewport-bitcoin-pois";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";
import { fetchCollection } from "@/lib/api/mapky";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { categoryIcon } from "@/lib/places/category-icon";
import { PlaceBalloon, type BalloonVariant } from "./PlaceBalloon";
import type { ViewportBounds } from "@/types/mapky";

/**
 * Renders Mapky-indexed places as teardrop balloon markers — same
 * shape SelectedPlaceMarker uses (one consistent visual language),
 * green body, rating digit inside.
 *
 * When the place also accepts Bitcoin (cross-referenced from the
 * Bitcoin overlay's Overpass data), the balloon's outline turns
 * orange. That replaces the standalone Bitcoin/Lightning markers
 * entirely — Bitcoin info is now a modifier on the existing
 * markers, not its own layer.
 *
 * The currently-selected place is skipped here so SelectedPlaceMarker
 * (red, larger) owns the highlight without a smaller green balloon
 * stacking under it.
 */
export function PlaceAnnotationsLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();

  // ─── Bbox tracking (immediate-fire on mount) ──────────────────────

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateBounds = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      minLat: b.getSouth(),
      minLon: b.getWest(),
      maxLat: b.getNorth(),
      maxLon: b.getEast(),
    });
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBounds, 400);
    };
    updateBounds();
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBounds]);

  // ─── Inputs ────────────────────────────────────────────────────────

  const placesToggle = useUiStore((s) => s.placesLayerVisible);
  const bitcoinEnabled = useUiStore((s) => s.bitcoinOverlayVisible);
  const visiblePlaceKeys = useUiStore((s) => s.visiblePlaceKeys);
  // /places sidebar overrides the Layers-sheet toggle: if the user
  // explicitly opened the Places list, they want the dots regardless
  // of the toggle state. Same precedence the dim helper uses for the
  // GeoJSON layers — focus mode wins over user preference.
  const placesEnabled = placesToggle || visiblePlaceKeys !== null;
  // Coarse zoom threshold subscription — only re-renders on the z=9
  // boundary crossing, not every wheel-tick during a zoom animation
  // (which was the source of the on-zoom marker flicker).
  const zoomEnough = useMapStore((s) => s.zoom >= 9);
  const selectedKey = useUiStore((s) =>
    s.selectedFeature
      ? `${s.selectedFeature.osmType}:${s.selectedFeature.osmId}`
      : null,
  );

  const { data: places } = useViewportPlaces(
    placesEnabled ? bounds : null,
  );

  // Bitcoin POIs come through a shared hook so the Places sidebar can
  // also read the Bitcoin keys (for the per-row chip) — same query,
  // same cache, no second Overpass round-trip.
  const { pois: bitcoinPois, keys: rawBitcoinKeys } =
    useViewportBitcoinPois(bounds, zoomEnough);

  // The toggle in the Layers sheet gates whether the orange ring /
  // body actually RENDERS on the map. The data is fetched either way
  // so the sidebar previews can show Bitcoin chips at all times.
  // Memoized so its identity stays stable across re-renders — the
  // merge memo's deps include this set, and a fresh reference each
  // render would needlessly cascade through markers/effects.
  const bitcoinKeys = useMemo(
    () => (bitcoinEnabled ? rawBitcoinKeys : EMPTY_SET),
    [bitcoinEnabled, rawBitcoinKeys],
  );

  // ─── Active collection memberships → collection-color border ────
  const activeCollections = useUiStore((s) => s.activeCollectionOverlays);
  const collectionEntries = useMemo(
    () => Array.from(activeCollections.values()),
    [activeCollections],
  );
  const collectionQueries = useQueries({
    queries: collectionEntries.map((entry) => ({
      queryKey: [
        "mapky",
        "collection",
        entry.authorId,
        entry.collectionId,
      ] as const,
      queryFn: () => fetchCollection(entry.authorId, entry.collectionId),
      staleTime: 60 * 1000,
      retry: 1,
    })),
  });
  const collectionColorByKey = useMemo(() => {
    const map = new Map<string, string>();
    collectionEntries.forEach((entry, i) => {
      const data = collectionQueries[i].data;
      if (!data) return;
      for (const url of data.items) {
        const parsed = parseOsmCanonical(url);
        if (!parsed) continue;
        const key = `${parsed.osmType}:${parsed.osmId}`;
        // First overlay wins — multiple-collection memberships are
        // rare and a single colored border reads cleaner than a
        // two-tone outline.
        if (!map.has(key)) map.set(key, entry.color);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    collectionEntries,
    collectionQueries.map((q) => q.dataUpdatedAt).join(","),
  ]);

  // ─── Build the per-feature data the balloons read ─────────────────
  //
  // Two passes: the first pass collects every place we have native
  // coords for (Mapky / Bitcoin), the second pass adds collection
  // items that only have an OSM URL — those need Nominatim to resolve
  // their coordinates before they can render.

  const baseFeatures = useMemo(() => {
    const out = new Map<string, Feature>();

    // Mapky-indexed places — variant is "both" when also in the
    // Bitcoin set, otherwise "mapky".
    if (placesEnabled && places?.length) {
      for (const p of places) {
        const key = `${p.osm_type}:${p.osm_id}`;
        if (selectedKey === key) continue;
        if (visiblePlaceKeys && !visiblePlaceKeys.has(key)) continue;
        out.set(key, {
          key,
          osmType: p.osm_type,
          osmId: p.osm_id,
          lat: p.lat,
          lon: p.lon,
          rating:
            p.review_count > 0 ? (p.avg_rating / 2).toFixed(1) : null,
          variant: bitcoinKeys.has(key) ? "both" : "mapky",
        });
      }
    }

    // Bitcoin-only places — render an orange balloon for places that
    // aren't already in the Mapky set. When the toggle is off,
    // bitcoinPois is undefined / bitcoinKeys is empty so this loop
    // is a no-op.
    //
    // Suppressed entirely when the /places sidebar is active (signal:
    // `visiblePlaceKeys` non-null). The Places sidebar focuses on
    // Mapky-indexed places, so showing standalone Bitcoin pins —
    // which by definition aren't Mapky-indexed — is noise. Bitcoin
    // acceptance still surfaces on Mapky places via the "both" variant
    // and the per-row chip in the sidebar.
    if (bitcoinEnabled && bitcoinPois?.length && !visiblePlaceKeys) {
      for (const b of bitcoinPois) {
        const key = `${b.osmType}:${b.osmId}`;
        if (out.has(key)) continue; // already in Mapky set
        if (selectedKey === key) continue;
        out.set(key, {
          key,
          osmType: b.osmType,
          osmId: b.osmId,
          lat: b.lat,
          lon: b.lon,
          rating: null,
          variant: "bitcoin",
        });
      }
    }

    return Array.from(out.values());
  }, [
    places,
    placesEnabled,
    bitcoinEnabled,
    bitcoinPois,
    visiblePlaceKeys,
    selectedKey,
    bitcoinKeys,
  ]);

  // Collection items that AREN'T already covered by the base set —
  // typically OSM POIs that were saved into a collection but aren't
  // Mapky-indexed. Their lat/lon comes from Nominatim (resolved in
  // the unified lookup batch below). Without this branch the deleted
  // CollectionOverlay's coord-resolution work is missing and only
  // collection items that happened to also be Mapky-indexed in the
  // current viewport would render.
  const collectionOnlyRefs = useMemo<
    Array<{ osmType: string; osmId: number; key: string }>
  >(() => {
    const inBase = new Set(baseFeatures.map((f) => f.key));
    const seen = new Set<string>();
    const refs: Array<{ osmType: string; osmId: number; key: string }> = [];
    for (const key of collectionColorByKey.keys()) {
      if (inBase.has(key)) continue;
      if (selectedKey === key) continue;
      if (seen.has(key)) continue;
      const [osmType, osmIdStr] = key.split(":");
      const osmId = Number(osmIdStr);
      if (!osmType || !osmId) continue;
      seen.add(key);
      refs.push({ osmType, osmId, key });
    }
    return refs;
  }, [baseFeatures, collectionColorByKey, selectedKey]);

  // ─── Category icons + names via Nominatim (batched) ───────────────
  //
  // ONE batched lookup for every visible feature instead of one
  // request per marker. Public Nominatim throttles per-IP, so the old
  // per-feature fan-out trip-wired 429s the moment the Bitcoin overlay
  // populated dozens of POIs. The batch hook also seeds the per-id
  // cache, so a later place-detail open or a /places sidebar that
  // shares the same OSM ref is a synchronous cache hit.
  //
  // Includes collection-only refs so we can read their resolved
  // coords back out of the same response — no second round-trip.
  const lookupRefs = useMemo(
    () => [
      ...baseFeatures.map((f) => ({ osmType: f.osmType, osmId: f.osmId })),
      ...collectionOnlyRefs.map((r) => ({
        osmType: r.osmType,
        osmId: r.osmId,
      })),
    ],
    [baseFeatures, collectionOnlyRefs],
  );
  const { byKey: nominatimByKey } = useOsmLookupBatch(lookupRefs);

  // Final feature set: base + collection-only entries that have a
  // resolved lat/lon. Out-of-viewport collection items are filtered
  // here so we don't paint balloons that aren't on screen — keeps the
  // marker count bounded for collections that span the globe.
  const features = useMemo(() => {
    if (collectionOnlyRefs.length === 0) return baseFeatures;
    const out = [...baseFeatures];
    for (const ref of collectionOnlyRefs) {
      const nom = nominatimByKey.get(ref.key);
      if (!nom?.lat || !nom?.lon) continue;
      // Viewport clip — match the rest of the layer's behavior so a
      // 200-place collection doesn't drop 200 markers in distant
      // regions every time it's pinned.
      if (
        bounds &&
        (nom.lat < bounds.minLat ||
          nom.lat > bounds.maxLat ||
          nom.lon < bounds.minLon ||
          nom.lon > bounds.maxLon)
      ) {
        continue;
      }
      out.push({
        key: ref.key,
        osmType: ref.osmType,
        osmId: ref.osmId,
        lat: nom.lat,
        lon: nom.lon,
        rating: null,
        // Variant body is overridden by collectionColor downstream;
        // "mapky" here just selects the white-stroke / no-core SVG.
        variant: "mapky",
      });
    }
    return out;
  }, [baseFeatures, collectionOnlyRefs, nominatimByKey, bounds]);

  const iconByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof categoryIcon> | null>();
    for (const f of features) {
      // Look up by key — `nominatimByKey` indexes the batch response
      // by the result's own osm_type:osm_id, so reordered features
      // can't desync against the cached array.
      const type = nominatimByKey.get(f.key)?.type;
      // "yes" / "unclassified" carry no signal — keep the dot fallback
      // until something more specific arrives.
      if (!type || type === "yes" || type === "unclassified") {
        map.set(f.key, null);
      } else {
        map.set(f.key, categoryIcon(type));
      }
    }
    return map;
  }, [features, nominatimByKey]);

  // Place name lookup — used as the hover tooltip text. Read by key
  // so a balloon can never end up labelled with another POI's name
  // after a feature reorder (e.g. when the Bitcoin overlay flips on).
  const nameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of features) {
      const nom = nominatimByKey.get(f.key);
      const name =
        nom?.name?.trim() ||
        nom?.display_name?.split(",")[0]?.trim() ||
        "";
      if (name) map.set(f.key, name);
    }
    return map;
  }, [features, nominatimByKey]);

  // ─── Marker lifecycle ─────────────────────────────────────────────
  //
  // Markers stay in a ref (creating/removing them is imperative), but
  // their host elements live in STATE so React re-renders the portal
  // tree once the elements exist. Without this, the post-render
  // effect would create an element after the JSX from that render
  // already evaluated `elements.get(key)` to undefined and rendered
  // a null portal — markers would never get their balloon content.

  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const [elements, setElements] = useState<
    ReadonlyMap<string, HTMLDivElement>
  >(() => new Map());

  // Read dim early so it can flow into BOTH the marker-creation effect
  // (apply opacity at creation time, no flash on pan) and the
  // dim-update effect (re-apply on every change). The dim-update
  // effect lives further down with its own comment.
  const placesDim = useLayerOpacityMultiplier("places");
  // Whether ANY focus mode is active. When a sidebar like /captures or
  // /routes pushes "places" into hiddenLayers, we want Bitcoin pins to
  // hide too (focused page owns the map). When no focus is active the
  // Bitcoin overlay's user toggle takes over independently of Places.
  const focusActive = useUiStore(
    (s) => s.hiddenLayers.size > 0 || s.dimmedLayers.size > 0,
  );
  // Per-variant opacity. Bitcoin-only balloons live in this same layer
  // but follow the Bitcoin toggle rather than the Places one — without
  // this branch, turning Places off would also drop every Bitcoin pin
  // even though the Bitcoin overlay is still on.
  const bitcoinDim = focusActive ? placesDim : bitcoinEnabled ? 1 : 0;
  const dimForFeature = useCallback(
    (variant: BalloonVariant): number =>
      variant === "bitcoin" ? bitcoinDim : placesDim,
    [placesDim, bitcoinDim],
  );

  // Mirror the current dim + collection-color map into refs so the
  // marker-creation effect can read the latest values without taking
  // a dep on them — otherwise we'd recreate every marker on every
  // dim change. The point of this is to apply the right opacity AT
  // CREATION TIME so freshly-added markers (e.g. when the user pans
  // into new places while a sidebar is focused) don't flash visible
  // for a tick before the dim effect catches them.
  const dimForFeatureRef = useRef(dimForFeature);
  dimForFeatureRef.current = dimForFeature;
  const collectionColorByKeyRef = useRef(collectionColorByKey);
  collectionColorByKeyRef.current = collectionColorByKey;

  useEffect(() => {
    if (!map) return;
    const wantedKeys = new Set(features.map((f) => f.key));

    setElements((prev) => {
      const next = new Map(prev);
      let changed = false;

      // Remove markers no longer present.
      for (const key of next.keys()) {
        if (wantedKeys.has(key)) continue;
        const marker = markersRef.current.get(key);
        if (marker) {
          marker.remove();
          markersRef.current.delete(key);
        }
        next.delete(key);
        changed = true;
      }

      // Add or reposition.
      for (const f of features) {
        let marker = markersRef.current.get(f.key);
        if (!marker) {
          const el = document.createElement("div");
          el.className = "mapky-place-balloon";
          el.style.cursor = "pointer";
          // Apply current dim at creation, before the element ever
          // attaches to the map. Without this, opening a sidebar then
          // panning briefly shows newly-arrived markers at full
          // opacity before the dim effect catches them. `display:
          // none` (instead of opacity 0) is the safer hide because
          // MapLibre keeps repositioning every marker on every map
          // move, and Safari can flash an opacity-0 element visible
          // mid-pan.
          const inActiveCollection =
            collectionColorByKeyRef.current.has(f.key);
          const baseDim = dimForFeatureRef.current(f.variant);
          const featureDim =
            baseDim === 0 && inActiveCollection ? 1 : baseDim;
          if (featureDim === 0) {
            el.style.display = "none";
            el.style.pointerEvents = "none";
          } else {
            el.style.opacity = String(featureDim);
            el.style.pointerEvents = "auto";
          }
          // anchor: bottom puts the teardrop tip at the lat/lon, head
          // pointing up — matches SelectedPlaceMarker's convention.
          marker = new maplibregl.Marker({
            element: el,
            anchor: "bottom",
          })
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

  // Cleanup on unmount.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const m of markers.values()) m.remove();
      markers.clear();
    };
  }, []);

  // Per-feature dim — when a sidebar focuses on captures / collections
  // / routes, "places" gets dimmed or hidden, but places in an active
  // collection stay visible regardless so /collections shows pinned
  // places. Updates existing markers; new markers get the right
  // opacity at creation via the dimRef in the markers-effect above.
  //
  // For full-hide (featureDim === 0) we also set `display: none`
  // instead of relying on opacity alone — MapLibre keeps repositioning
  // every marker on every map move (zoom, pan), and an opacity-0
  // element still flashes visible on Safari during fast pans before
  // the next paint catches up. `display: none` removes it from the
  // render tree so it can't.
  useEffect(() => {
    for (const f of features) {
      const el = elements.get(f.key);
      if (!el) continue;
      const inActiveCollection = collectionColorByKey.has(f.key);
      const base = dimForFeature(f.variant);
      const featureDim = base === 0 && inActiveCollection ? 1 : base;
      if (featureDim === 0) {
        el.style.display = "none";
        el.style.pointerEvents = "none";
      } else {
        el.style.display = "";
        el.style.opacity = String(featureDim);
        el.style.pointerEvents = "auto";
      }
    }
  }, [dimForFeature, elements, features, collectionColorByKey]);

  // Hover tooltip — one shared `maplibregl.Popup` reused across every
  // marker, with the same `mapky-hover-tooltip` CSS class the basemap
  // hover system in MapView uses. Same look, same offset, same timing
  // for our balloons and Protomaps' built-in POI labels.
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

  // Wire each marker's host element to show/hide the shared popup on
  // mouseenter/leave. We register fresh listeners every time the
  // (features, names) set changes — handlers are tiny, and removing
  // via the same captured reference is cheaper than tracking them
  // in a separate Map.
  useEffect(() => {
    if (!map) return;
    const cleanups: (() => void)[] = [];
    for (const f of features) {
      const el = elements.get(f.key);
      if (!el) continue;
      const name = nameByKey.get(f.key);
      const onEnter = () => {
        if (!name) return;
        const popup = hoverPopupRef.current;
        if (!popup) return;
        popup
          .setLngLat([f.lon, f.lat])
          .setHTML(`<span>${escapeHtml(name)}</span>`)
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
      // Hide the popup when handlers unmount mid-hover.
      hoverPopupRef.current?.remove();
    };
  }, [map, features, elements, nameByKey]);

  const handleClick = useCallback(
    (
      osmType: string,
      osmId: number,
      lat: number,
      lon: number,
      name: string | undefined,
    ) => {
      // When directions is in "Choose on map" mode for a slot, the
      // balloon should fill that slot — same outcome the basemap
      // picker (RouteMapClickHandler) produces, but bypassing it
      // entirely because HTML markers swallow the canvas click via
      // stopPropagation. Without this branch the click would just
      // hit the early-return below and do nothing.
      const route = useRouteCreationStore.getState();
      if (route.isOpen && route.pickingForSlot != null) {
        const slotIdx = route.pickingForSlot;
        const cur = route.slots[slotIdx];
        if (cur) {
          route.setSlot(slotIdx, {
            kind: "place",
            id: cur.id,
            lat,
            lon,
            label: name || `${osmType}/${osmId}`,
            osmType,
            osmId,
          });
          route.setPickingForSlot(null);
        }
        return;
      }
      // Otherwise, leave directions alone — opening a place panel
      // mid-route-edit would dismount the directions sidebar.
      if (route.isOpen) return;
      // Pass lat/lon as search params. Mapky-indexed places resolve
      // their coords via usePlaceDetail downstream, but Bitcoin-only
      // POIs aren't in nexus — without these fallbacks PlacePanel
      // can't seed `selectedFeature` and the red SelectedPlaceMarker
      // never appears for them.
      navigate({
        to: "/place/$osmType/$osmId",
        params: { osmType, osmId: String(osmId) },
        search: { lat, lon },
      });
    },
    [navigate],
  );

  // PlaceBalloon is React.memo'd on (rating, acceptsBitcoin) so this
  // map only re-creates the wrapper button on each render — the SVG
  // children short-circuit when their primitives haven't changed.
  return (
    <>
      {features.map((f) => {
        const el = elements.get(f.key);
        if (!el) return null;
        return createPortal(
          <button
            type="button"
            aria-label="Open place"
            onClick={(e) => {
              e.stopPropagation();
              handleClick(
                f.osmType,
                f.osmId,
                f.lat,
                f.lon,
                nameByKey.get(f.key),
              );
            }}
            className="block bg-transparent p-0 transition-transform hover:scale-110"
          >
            <PlaceBalloon
              variant={f.variant}
              rating={f.rating}
              Icon={iconByKey.get(f.key) ?? null}
              collectionColor={collectionColorByKey.get(f.key)}
            />
          </button>,
          el,
          f.key,
        );
      })}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────

interface Feature {
  key: string;
  osmType: string;
  osmId: number;
  lat: number;
  lon: number;
  rating: string | null;
  variant: BalloonVariant;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Escape HTML special characters before injecting place names into
 *  popup HTML. Names from OSM are user-contributed and may contain
 *  characters that would otherwise close tags or open scripts. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
