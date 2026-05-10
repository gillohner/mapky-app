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
import { useMapViewport, useOsmLookupBatch } from "@/lib/api/hooks";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";
import { fetchCollection } from "@/lib/api/mapky";
import { parseOsmCanonical } from "@/lib/map/osm-url";
import { categoryIcon } from "@/lib/places/category-icon";
import { PlaceBalloon, type BalloonVariant } from "./PlaceBalloon";
import { ClusterBubble } from "./ClusterBubble";
import type { PlaceCluster, ViewportBounds } from "@/types/mapky";

/**
 * Renders the Mapky place layer in two modes off a single
 * server-side envelope:
 *
 *   - At low zoom (server returns `kind: "clusters"`), shows
 *     ClusterBubbles with the total Mapky-engaged-place count and a
 *     stronger ring when the cell carries any reviewed places. Bitcoin
 *     merchants no longer factor into the cluster — they live in the
 *     dedicated BTC overlay. Click → flyTo deeper.
 *   - At high zoom (`kind: "places"`), shows individual PlaceBalloons
 *     in two variants: place-btc (accent teal + BTC corner badge) for
 *     bitcoin-accepting places, and plain place (muted slate) for
 *     everything else. Variant is decided from `place.accepts_bitcoin`
 *     in the same render frame as the place arrives — no flicker.
 *
 * The "Bitcoin accepted" / "Reviewed" / "Tagged" filter pills under
 * the Places section narrow both modes (server applies the predicate).
 *
 * The currently-selected place is skipped here so SelectedPlaceMarker
 * (red, larger) owns the highlight without a smaller balloon stacking
 * under it.
 */
export function PlaceAnnotationsLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();

  // ─── Bbox + zoom tracking (immediate-fire on mount) ──────────────

  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [zoom, setZoom] = useState<number>(() => {
    const m = useMapStore.getState().map;
    return m ? m.getZoom() : 0;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateBoundsAndZoom = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      minLat: b.getSouth(),
      minLon: b.getWest(),
      maxLat: b.getNorth(),
      maxLon: b.getEast(),
    });
    setZoom(map.getZoom());
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(updateBoundsAndZoom, 400);
    };
    updateBoundsAndZoom();
    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, updateBoundsAndZoom]);

  // ─── Inputs ────────────────────────────────────────────────────────

  const placesToggle = useUiStore((s) => s.placesLayerVisible);
  const placesFilters = useUiStore((s) => s.placesFilters);
  const visiblePlaceKeys = useUiStore((s) => s.visiblePlaceKeys);
  // /places sidebar overrides the Layers-sheet toggle: if the user
  // explicitly opened the Places list, they want the dots regardless
  // of the toggle state. Same precedence the dim helper uses for the
  // GeoJSON layers — focus mode wins over user preference.
  const placesEnabled = placesToggle || visiblePlaceKeys !== null;
  const selectedKey = useUiStore((s) =>
    s.selectedFeature
      ? `${s.selectedFeature.osmType}:${s.selectedFeature.osmId}`
      : null,
  );

  // Composite map-viewport: shared queryKey with CaptureMarkersLayer
  // and SequenceCoverageLayer so all three render off ONE request per
  // pan. We always pass `bounds` (not gated on `placesEnabled`) so the
  // request fires even when the place layer is hidden — the captures
  // layer still needs it. We just gate the rendered slice locally.
  const viewportQuery = useMapViewport(bounds, zoom, placesFilters);
  const envelope = placesEnabled ? viewportQuery.data?.places : undefined;

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

  // ─── Cluster mode: build cluster features ─────────────────────────
  //
  // When the server says `kind: "clusters"` we render ClusterBubble
  // markers. Cluster keys are derived from rounded centroid coords —
  // stable across pans within the same zoom snap so MapLibre marker
  // identity stays put.

  const clusters: PlaceCluster[] = useMemo(
    () => (envelope?.kind === "clusters" ? envelope.clusters : []),
    [envelope],
  );
  const clusterFeatures = useMemo(() => {
    return clusters.map((c) => ({
      // `c-` prefix to avoid colliding with place keys.
      key: `c-${c.lat.toFixed(4)}:${c.lon.toFixed(4)}`,
      lat: c.lat,
      lon: c.lon,
      total: c.total,
      reviewed: c.reviewed,
    }));
  }, [clusters]);

  // ─── Place mode: build per-feature data the balloons read ─────────
  //
  // Two passes: the first pass collects every place we have native
  // coords for (Mapky, with server-driven BTC flag), the second pass
  // adds collection items that only have an OSM URL — those need
  // Nominatim to resolve their coordinates before they can render.

  const places = useMemo(
    () => (envelope?.kind === "places" ? envelope.places : []),
    [envelope],
  );
  const baseFeatures = useMemo(() => {
    if (envelope?.kind !== "places" || !placesEnabled) return [];
    const out = new Map<string, Feature>();
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
        // BTC flag drives the variant in the same render frame as the
        // place arrives — no separate query, no flicker.
        variant: p.accepts_bitcoin ? "place-btc" : "place",
      });
    }
    return Array.from(out.values());
  }, [envelope, places, placesEnabled, visiblePlaceKeys, selectedKey]);

  // Collection items that AREN'T already covered by the base set —
  // typically OSM POIs that were saved into a collection but aren't
  // Mapky-indexed. Their lat/lon comes from Nominatim (resolved in
  // the unified lookup batch below).
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
  // ONE batched lookup for every visible place feature instead of one
  // request per marker. The plugin caches Redis-side and pre-seeds
  // BTC POIs from the BTCMap dump, so most lookups resolve instantly.
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
  // here so we don't paint balloons that aren't on screen.
  const features = useMemo(() => {
    if (collectionOnlyRefs.length === 0) return baseFeatures;
    const out = [...baseFeatures];
    for (const ref of collectionOnlyRefs) {
      const nom = nominatimByKey.get(ref.key);
      if (!nom?.lat || !nom?.lon) continue;
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
        // Variant body is overridden by collectionColor downstream.
        variant: "place",
      });
    }
    return out;
  }, [baseFeatures, collectionOnlyRefs, nominatimByKey, bounds]);

  const iconByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof categoryIcon> | null>();
    for (const f of features) {
      const type = nominatimByKey.get(f.key)?.type;
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
  // after a feature reorder.
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

  // ─── Marker lifecycle (unified for clusters + places) ─────────────
  //
  // Markers stay in a ref (creating/removing them is imperative), but
  // their host elements live in STATE so React re-renders the portal
  // tree once the elements exist.

  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const [elements, setElements] = useState<
    ReadonlyMap<string, HTMLDivElement>
  >(() => new Map());

  const placesDim = useLayerOpacityMultiplier("places");

  // Single source of truth for what's on the map this render: clusters
  // when in cluster mode, place balloons when in place mode. Keys are
  // disjoint by prefix (`c-` for cluster, `osm_type:osm_id` for places).
  type Marker =
    | { kind: "place"; key: string; lat: number; lon: number; feature: Feature }
    | { kind: "cluster"; key: string; lat: number; lon: number; cluster: PlaceCluster };
  const markerSpecs = useMemo<Marker[]>(() => {
    if (envelope?.kind === "clusters") {
      return clusterFeatures.map((c) => ({
        kind: "cluster" as const,
        key: c.key,
        lat: c.lat,
        lon: c.lon,
        cluster: { lat: c.lat, lon: c.lon, total: c.total, reviewed: c.reviewed },
      }));
    }
    return features.map((f) => ({
      kind: "place" as const,
      key: f.key,
      lat: f.lat,
      lon: f.lon,
      feature: f,
    }));
  }, [envelope, clusterFeatures, features]);

  const placesDimRef = useRef(placesDim);
  placesDimRef.current = placesDim;
  const collectionColorByKeyRef = useRef(collectionColorByKey);
  collectionColorByKeyRef.current = collectionColorByKey;

  useEffect(() => {
    if (!map) return;
    const wantedKeys = new Set(markerSpecs.map((s) => s.key));

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
      for (const spec of markerSpecs) {
        let marker = markersRef.current.get(spec.key);
        if (!marker) {
          const el = document.createElement("div");
          el.className =
            spec.kind === "cluster"
              ? "mapky-place-cluster"
              : "mapky-place-balloon";
          el.style.cursor = "pointer";
          // Apply current dim at creation, before the element ever
          // attaches to the map. Without this, opening a sidebar then
          // panning briefly shows newly-arrived markers at full
          // opacity before the dim effect catches them.
          const inActiveCollection =
            spec.kind === "place" &&
            collectionColorByKeyRef.current.has(spec.key);
          const baseDim = placesDimRef.current;
          const featureDim =
            baseDim === 0 && inActiveCollection ? 1 : baseDim;
          if (featureDim === 0) {
            el.style.display = "none";
            el.style.pointerEvents = "none";
          } else {
            el.style.opacity = String(featureDim);
            el.style.pointerEvents = "auto";
          }
          marker = new maplibregl.Marker({
            element: el,
            // Cluster bubbles center on the centroid; balloon
            // teardrops anchor at the bottom (head over the lat/lon).
            anchor: spec.kind === "cluster" ? "center" : "bottom",
          })
            .setLngLat([spec.lon, spec.lat])
            .addTo(map);
          markersRef.current.set(spec.key, marker);
          next.set(spec.key, el);
          changed = true;
        } else {
          marker.setLngLat([spec.lon, spec.lat]);
        }
      }

      return changed ? next : prev;
    });
  }, [map, markerSpecs]);

  // Cleanup on unmount.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const m of markers.values()) m.remove();
      markers.clear();
    };
  }, []);

  // Per-marker dim — places follow the layer dim; cluster bubbles
  // follow the same value (both ARE the Places layer). Collection
  // members override the dim so /collections shows pinned places
  // even when the rest of the layer is hidden.
  useEffect(() => {
    for (const spec of markerSpecs) {
      const el = elements.get(spec.key);
      if (!el) continue;
      const inActiveCollection =
        spec.kind === "place" && collectionColorByKey.has(spec.key);
      const featureDim =
        placesDim === 0 && inActiveCollection ? 1 : placesDim;
      if (featureDim === 0) {
        el.style.display = "none";
        el.style.pointerEvents = "none";
      } else {
        el.style.display = "";
        el.style.opacity = String(featureDim);
        el.style.pointerEvents = "auto";
      }
    }
  }, [placesDim, elements, markerSpecs, collectionColorByKey]);

  // Hover tooltip — one shared `maplibregl.Popup` reused across every
  // place marker. (Cluster bubbles already show their count in-place.)
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
    const cleanups: (() => void)[] = [];
    for (const spec of markerSpecs) {
      if (spec.kind !== "place") continue;
      const el = elements.get(spec.key);
      if (!el) continue;
      const name = nameByKey.get(spec.key);
      const onEnter = () => {
        if (!name) return;
        const popup = hoverPopupRef.current;
        if (!popup) return;
        popup
          .setLngLat([spec.lon, spec.lat])
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
      hoverPopupRef.current?.remove();
    };
  }, [map, markerSpecs, elements, nameByKey]);

  const handlePlaceClick = useCallback(
    (
      osmType: string,
      osmId: number,
      lat: number,
      lon: number,
      name: string | undefined,
    ) => {
      // When directions is in "Choose on map" mode, the balloon
      // should fill that slot (same outcome the basemap picker
      // produces, but bypassing it because HTML markers swallow
      // canvas clicks via stopPropagation).
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

      // Visual feedback: fly the map to the balloon before the panel
      // mounts. Always center on the click; zoom in to a "you're at
      // this place" zoom (16) when the user is currently zoomed
      // farther out. If they're already that close or closer, just
      // pan — don't yank them to a different zoom they didn't ask for.
      if (map) {
        const here = map.getZoom();
        const target = Math.max(here, 16);
        map.flyTo({ center: [lon, lat], zoom: target, duration: 500 });
      }

      navigate({
        to: "/place/$osmType/$osmId",
        params: { osmType, osmId: String(osmId) },
        search: { lat, lon },
      });
    },
    [navigate, map],
  );

  // Cluster click — drill in enough that the cluster visibly breaks
  // apart. Three rules combined:
  //
  //   1. Compute the zoom that fits the cluster's cell (server told us
  //      the cell size in the envelope). That's the natural "break
  //      this cluster open" target.
  //   2. Then drill 2 zoom levels PAST the fit so we land in the
  //      next level of detail, not on the same cell again.
  //   3. Floor at `current + 3` so even a tiny cell still meaningfully
  //      advances when clicked — protects against the "click does
  //      nothing visible" complaint at far-away zooms.
  //
  // Capped at 14 (one above the cluster threshold) so the deepest
  // click always lands in place mode with individual balloons.
  const cell = envelope?.kind === "clusters" ? envelope.cell : null;
  const handleClusterClick = useCallback(
    (lat: number, lon: number) => {
      if (!map) return;
      const here = map.getZoom();
      // Cap at the map's max zoom — NOT the cluster threshold.
      // Reasoning: if the click handler fires at all, we're in
      // cluster mode somehow (maybe nexus hasn't restarted with the
      // newer threshold, maybe the cell is very small and one click
      // can't fully break it apart). Either way, the click must
      // visibly advance, so we never clamp to the user's current
      // zoom.
      const cap = map.getMaxZoom?.() ?? 18;
      let target: number;
      if (cell != null) {
        // cameraForBounds gives the zoom that fits the cluster cell.
        // Drill 2 past it so the click visibly breaks the cluster open.
        const half = cell / 2;
        const cam = map.cameraForBounds([
          [lon - half, lat - half],
          [lon + half, lat + half],
        ]);
        const fit = cam?.zoom ?? here + 3;
        target = Math.max(fit + 2, here + 2);
      } else {
        target = here + 3;
      }
      target = Math.min(target, cap);
      // Last-line guard: even with weird math the click must move.
      if (target <= here + 0.5) target = Math.min(here + 2, cap);
      map.flyTo({ center: [lon, lat], zoom: target, duration: 600 });
    },
    [map, cell],
  );

  return (
    <>
      {markerSpecs.map((spec) => {
        const el = elements.get(spec.key);
        if (!el) return null;
        if (spec.kind === "cluster") {
          return createPortal(
            <button
              type="button"
              aria-label={`${spec.cluster.total} places in this area`}
              onClick={(e) => {
                e.stopPropagation();
                handleClusterClick(spec.lat, spec.lon);
              }}
              className="block bg-transparent p-0"
            >
              <ClusterBubble
                total={spec.cluster.total}
                reviewed={spec.cluster.reviewed}
              />
            </button>,
            el,
            spec.key,
          );
        }
        const f = spec.feature;
        return createPortal(
          <button
            type="button"
            aria-label="Open place"
            onClick={(e) => {
              e.stopPropagation();
              handlePlaceClick(
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
