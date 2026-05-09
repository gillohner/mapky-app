import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useBtcViewport } from "@/lib/api/hooks";
import type { ViewportBounds } from "@/types/mapky";

const SOURCE_ID = "mapky-btc-poi";
const CIRCLE_LAYER = "mapky-btc-circle";
const HALO_LAYER = "mapky-btc-halo";

const BTC_ORANGE = "#f7931a";
const BTC_ORANGE_DARK = "#cc7700";

/**
 * Bitcoin-accepting POI overlay. Sits on top of (and is independent of)
 * the Places layer — flipping it on doesn't narrow Mapky data; it adds
 * a second layer of orange BTC dots.
 *
 * Backed by `/v0/mapky/btc/viewport`. The zoom-aware envelope returns
 * either `kind: "places"` (high zoom; renders as dots here) or
 * `kind: "clusters"` (low zoom). For now the overlay only renders the
 * `places` branch as dots — a pure GeoJSON source + circle layer so
 * 500+ POIs stay smooth on pan/zoom. Cluster-mode rendering is
 * deferred so an addLayer-time exception can't break the basemap.
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

  // Only the "places" branch renders today; the cluster branch is
  // a no-op (empty FeatureCollection) so the layers stay attached
  // and re-show when the user zooms back into POI range.
  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    if (envelope?.kind !== "places") {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: envelope.places.map((p) => ({
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
      // Defensive: also clear any cluster-mode layers a previous
      // build of this component may have attached. Without this an
      // HMR swap from a version that added a now-removed `text-font`
      // symbol layer leaves the broken layer on the style and the
      // basemap stops rendering. Order matters: layers before source.
      const legacyIds = [
        `${CIRCLE_LAYER}-cluster-label`,
        `${CIRCLE_LAYER}-cluster`,
        CIRCLE_LAYER,
        HALO_LAYER,
      ];
      for (const id of legacyIds) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    // Run remove() once unconditionally on (re)mount BEFORE ensure()
    // re-adds the live layers, so an HMR-leftover broken symbol layer
    // can't keep the basemap stuck.
    remove();

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

  return null;
}
