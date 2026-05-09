import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useBtcViewport } from "@/lib/api/hooks";
import { ClusterBubble } from "./ClusterBubble";
import type { ViewportBounds } from "@/types/mapky";

const SOURCE_ID = "mapky-btc-poi";
const CIRCLE_LAYER = "mapky-btc-circle";
const HALO_LAYER = "mapky-btc-halo";

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";

/**
 * Bitcoin-accepting POI overlay. Sits on top of (and is independent of)
 * the Places layer — flipping it on doesn't narrow Mapky data; it adds
 * a second layer of orange BTC dots / cluster bubbles. Solves the
 * impossible-AND trap of the old `placesFilters.bitcoin` boolean.
 *
 * Two-mode rendering (mirrors PlaceAnnotationsLayer):
 *
 *   - **Low zoom** (server returns `kind: "clusters"`): orange-themed
 *     ClusterBubbles via HTML markers. Cell midpoints align with the
 *     place layer's clusters in the same cell — a place that's both
 *     Mapky-engaged AND BTC produces stacked teal+orange bubbles at
 *     the same lat/lon.
 *   - **High zoom** (`kind: "places"`): GeoJSON source + circle layer
 *     so 500+ individual POIs stay smooth on pan/zoom.
 *
 * Click → `/place/{osm_type}/{osm_id}` (POIs) or flyTo deeper
 * (clusters), same flow as the Mapky place layer.
 */
export function BtcOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.btcOverlayVisible);

  // ─── Bbox + zoom tracking (mirrors PlaceAnnotationsLayer) ──────
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [zoom, setZoom] = useState<number>(() => {
    const m = useMapStore.getState().map;
    return m ? m.getZoom() : 0;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = useCallback(() => {
    if (!map) return;
    const b = map.getBounds();
    setBounds({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLon: b.getWest(),
      maxLon: b.getEast(),
    });
    setZoom(map.getZoom());
  }, [map]);

  useEffect(() => {
    if (!map || !visible) return;
    update();
    const onMoveEnd = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(update, 150);
    };
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      clearTimeout(debounceRef.current);
    };
  }, [map, visible, update]);

  const { data: envelope } = useBtcViewport(visible ? bounds : null, zoom);

  // Discriminate the envelope into the two modes. Either branch is an
  // empty array when the response is in the other mode, so downstream
  // memos / effects don't need null-guarding.
  const clusters = envelope?.kind === "clusters" ? envelope.clusters : [];
  const pois = envelope?.kind === "places" ? envelope.places : [];

  // ─── HIGH ZOOM: GeoJSON source + circle layer for individual POIs

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: pois.map((p) => ({
        type: "Feature",
        id: `${p.osm_type}:${p.osm_id}`,
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          osm_type: p.osm_type,
          osm_id: p.osm_id,
          name: p.name,
        },
      })),
    };
  }, [pois]);

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: featureCollection,
        });
      }
      if (!map.getLayer(HALO_LAYER)) {
        map.addLayer({
          id: HALO_LAYER,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              4,
              16,
              12,
            ],
            "circle-color": BTC_ORANGE,
            "circle-opacity": 0.25,
            "circle-blur": 0.6,
          },
        });
      }
      if (!map.getLayer(CIRCLE_LAYER)) {
        map.addLayer({
          id: CIRCLE_LAYER,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              2.5,
              16,
              7,
            ],
            "circle-color": BTC_ORANGE,
            "circle-stroke-color": BTC_ORANGE_DARK,
            "circle-stroke-width": 1,
          },
        });
      }
    };

    const remove = () => {
      if (map.getLayer(CIRCLE_LAYER)) map.removeLayer(CIRCLE_LAYER);
      if (map.getLayer(HALO_LAYER)) map.removeLayer(HALO_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
      remove();
      return;
    }

    const onStyleData = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE_ID)) ensure();
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, visible, featureCollection]);

  useEffect(() => {
    if (!map || !visible) return;
    const src = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) src.setData(featureCollection);
  }, [map, visible, featureCollection]);

  // POI click → place panel.
  useEffect(() => {
    if (!map || !visible) return;
    const onClick = (
      e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] },
    ) => {
      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as
        | { osm_type?: string; osm_id?: number }
        | undefined;
      if (!props?.osm_type || !props.osm_id) return;
      navigate({
        to: "/place/$osmType/$osmId",
        params: { osmType: props.osm_type, osmId: String(props.osm_id) },
      });
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", CIRCLE_LAYER, onClick);
    map.on("mouseenter", CIRCLE_LAYER, onEnter);
    map.on("mouseleave", CIRCLE_LAYER, onLeave);
    return () => {
      map.off("click", CIRCLE_LAYER, onClick);
      map.off("mouseenter", CIRCLE_LAYER, onEnter);
      map.off("mouseleave", CIRCLE_LAYER, onLeave);
    };
  }, [map, visible, navigate]);

  // ─── LOW ZOOM: HTML markers carrying <ClusterBubble variant="btc" />

  // Maintain one Marker per cluster cell. Keyed by cell midpoint
  // (server returns deterministic lat/lon per cell, so the key stays
  // stable across re-fetches at the same zoom).
  type ClusterEntry = {
    marker: maplibregl.Marker;
    el: HTMLDivElement;
    total: number;
  };
  const markersRef = useRef<Map<string, ClusterEntry>>(new Map());

  const handleClusterClick = useCallback(
    (lat: number, lon: number) => {
      if (!map) return;
      // Drill in roughly two zoom levels — splits a cell of ~8 cells
      // wide into ~32 cells, enough to break cluster aggregation
      // visibly. Cap at the cluster threshold so the user lands in
      // place mode if they were already close.
      const next = Math.min(map.getZoom() + 2, 11);
      map.flyTo({ center: [lon, lat], zoom: next, duration: 600 });
    },
    [map],
  );

  // Rebuild marker set when clusters change. Cheap diff: drop markers
  // not in the new set, add new ones, leave matching ones.
  useEffect(() => {
    if (!map) return;
    const live = markersRef.current;

    if (!visible) {
      for (const entry of live.values()) entry.marker.remove();
      live.clear();
      return;
    }

    const seen = new Set<string>();
    for (const c of clusters) {
      const key = `${c.lat.toFixed(6)}:${c.lon.toFixed(6)}`;
      seen.add(key);
      const existing = live.get(key);
      if (existing) {
        existing.total = c.total;
        continue;
      }
      const el = document.createElement("div");
      // pointer-events:auto so clicks land on the bubble. Wrapper
      // shrinks to the bubble's natural size; ClusterBubble takes
      // care of internal layout.
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([c.lon, c.lat])
        .addTo(map);
      live.set(key, { marker, el, total: c.total });
    }
    // Remove cells no longer in the response.
    for (const [key, entry] of live) {
      if (!seen.has(key)) {
        entry.marker.remove();
        live.delete(key);
      }
    }
  }, [map, visible, clusters]);

  // Cleanup on unmount.
  useEffect(() => {
    const live = markersRef.current;
    return () => {
      for (const entry of live.values()) entry.marker.remove();
      live.clear();
    };
  }, []);

  // Portal a <ClusterBubble> into each marker element. Keyed by the
  // entry's stable cell key so React reconciles correctly across
  // pan/zoom diffs.
  const portals = useMemo(() => {
    if (!visible) return null;
    return clusters.map((c) => {
      const key = `${c.lat.toFixed(6)}:${c.lon.toFixed(6)}`;
      const entry = markersRef.current.get(key);
      if (!entry) return null;
      return createPortal(
        <button
          type="button"
          aria-label={`${c.total} Bitcoin POI${c.total === 1 ? "" : "s"} in this area`}
          onClick={(e) => {
            e.stopPropagation();
            handleClusterClick(c.lat, c.lon);
          }}
          className="block bg-transparent p-0"
        >
          <ClusterBubble total={c.total} variant="btc" />
        </button>,
        entry.el,
        key,
      );
    });
  }, [visible, clusters, handleClusterClick]);

  return <>{portals}</>;
}
