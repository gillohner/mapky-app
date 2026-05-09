import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useBtcViewport } from "@/lib/api/hooks";
import type { ViewportBounds, BitcoinPoi } from "@/types/mapky";

const SOURCE_ID = "mapky-btc-poi";
const CIRCLE_LAYER = "mapky-btc-circle";
const HALO_LAYER = "mapky-btc-halo";

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";

/**
 * Bitcoin-accepting POI overlay. Sits on top of (and is independent of)
 * the Places layer — flipping it on doesn't narrow Mapky data; it adds
 * a second layer of orange BTC dots / cluster bubbles.
 *
 * Backed by `/v0/mapky/btc/viewport`. Zoom-aware envelope returned by
 * the new plugin: at low zoom we get `kind: "clusters"`, at high zoom
 * we get `kind: "places"`. We render both branches as GeoJSON layers
 * (circle for individual POIs, larger circle + count text for
 * clusters) — keeps the rendering pipeline a single MapLibre source
 * regardless of mode and avoids HTML-marker churn at thousands of
 * points.
 *
 * Click → `/place/{osm_type}/{osm_id}` (POIs) or flyTo two zoom levels
 * deeper (clusters), same drill-in flow as the Mapky cluster bubbles.
 */
export function BtcOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.btcOverlayVisible);

  // ─── Bbox + zoom tracking ────────────────────────────────────────
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

  // Build a single GeoJSON FeatureCollection covering both modes.
  // `kind` on the feature props lets the layer styles filter the
  // right shapes — clusters render as labeled larger circles, POIs
  // as small dots. `total` carries the cluster count for label +
  // size scaling.
  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!envelope) {
      return { type: "FeatureCollection", features: [] };
    }
    if (envelope.kind === "clusters") {
      return {
        type: "FeatureCollection",
        features: envelope.clusters.map((c, i) => ({
          type: "Feature",
          id: i,
          geometry: { type: "Point", coordinates: [c.lon, c.lat] },
          properties: { kind: "cluster", total: c.total },
        })),
      };
    }
    return {
      type: "FeatureCollection",
      features: envelope.places.map((p: BitcoinPoi) => ({
        type: "Feature",
        id: `${p.osm_type}:${p.osm_id}`,
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          kind: "poi",
          osm_type: p.osm_type,
          osm_id: p.osm_id,
        },
      })),
    };
  }, [envelope]);

  // ─── Layer attach/update ──────────────────────────────────────────
  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data: featureCollection,
        });
      }
      // Halo (POI dots only) — soft glow underneath the dot.
      if (!map.getLayer(HALO_LAYER)) {
        map.addLayer({
          id: HALO_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "poi"],
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
      // POI dot.
      if (!map.getLayer(CIRCLE_LAYER)) {
        map.addLayer({
          id: CIRCLE_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "poi"],
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
      // Cluster circle — bigger filled disk scaled by `total`.
      const CLUSTER_LAYER = `${CIRCLE_LAYER}-cluster`;
      if (!map.getLayer(CLUSTER_LAYER)) {
        map.addLayer({
          id: CLUSTER_LAYER,
          type: "circle",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "cluster"],
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["log10", ["max", ["get", "total"], 1]],
              0, // log10(1)
              16,
              2, // log10(100)
              22,
              4, // log10(10000)
              28,
            ],
            "circle-color": "rgba(255,255,255,0.95)",
            "circle-stroke-color": BTC_ORANGE,
            "circle-stroke-width": 2,
          },
        });
      }
      // Cluster count label — a symbol layer that pulls `total` from
      // the feature properties and renders it inside the disk.
      const CLUSTER_LABEL = `${CIRCLE_LAYER}-cluster-label`;
      if (!map.getLayer(CLUSTER_LABEL)) {
        map.addLayer({
          id: CLUSTER_LABEL,
          type: "symbol",
          source: SOURCE_ID,
          filter: ["==", ["get", "kind"], "cluster"],
          layout: {
            "text-field": ["to-string", ["get", "total"]],
            "text-size": 12,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
            // Use the basemap's already-loaded font set so we don't
            // need to register a new glyph stack.
            "text-font": ["Noto Sans Regular"],
          },
          paint: {
            "text-color": BTC_ORANGE_DARK,
          },
        });
      }
    };

    const remove = () => {
      const ids = [
        `${CIRCLE_LAYER}-cluster-label`,
        `${CIRCLE_LAYER}-cluster`,
        CIRCLE_LAYER,
        HALO_LAYER,
      ];
      for (const id of ids) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
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

  // Push fresh data into the existing source on every envelope change.
  useEffect(() => {
    if (!map || !visible) return;
    const src = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) src.setData(featureCollection);
  }, [map, visible, featureCollection]);

  // Click handlers — POI dots open the place panel; cluster bubbles
  // drill in two zoom levels (capped at the cluster threshold).
  useEffect(() => {
    if (!map || !visible) return;
    const onPoiClick = (
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
    const CLUSTER_LAYER = `${CIRCLE_LAYER}-cluster`;
    const onClusterClick = (
      e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] },
    ) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const next = Math.min(map.getZoom() + 2, 11);
      map.flyTo({ center: [lon, lat], zoom: next, duration: 600 });
    };
    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    map.on("click", CIRCLE_LAYER, onPoiClick);
    map.on("click", CLUSTER_LAYER, onClusterClick);
    map.on("mouseenter", CIRCLE_LAYER, onEnter);
    map.on("mouseleave", CIRCLE_LAYER, onLeave);
    map.on("mouseenter", CLUSTER_LAYER, onEnter);
    map.on("mouseleave", CLUSTER_LAYER, onLeave);
    return () => {
      map.off("click", CIRCLE_LAYER, onPoiClick);
      map.off("click", CLUSTER_LAYER, onClusterClick);
      map.off("mouseenter", CIRCLE_LAYER, onEnter);
      map.off("mouseleave", CIRCLE_LAYER, onLeave);
      map.off("mouseenter", CLUSTER_LAYER, onEnter);
      map.off("mouseleave", CLUSTER_LAYER, onLeave);
    };
  }, [map, visible, navigate]);

  return null;
}
