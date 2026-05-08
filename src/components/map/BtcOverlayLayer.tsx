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

const BTC_ORANGE = "#f7931a"; // BTC brand orange
const BTC_ORANGE_DARK = "#cc7700";

/**
 * Bitcoin-accepting POI overlay. Sits on top of (and is independent of)
 * the Places layer — flipping it on doesn't narrow Mapky data; it
 * adds a second layer of orange BTC dots. Solves the impossible-AND
 * trap of the old `placesFilters.bitcoin` boolean which combined with
 * `reviewed`/`tagged` and would empty the map whenever the user wanted
 * "BTC merchants OR reviewed places".
 *
 * Data: `/v0/mapky/btc/viewport` — `:Place` nodes flagged
 * `accepts_bitcoin = true` by the BTCMap sync. Click a dot →
 * `/place/{osm_type}/{osm_id}`, same as a Mapky place balloon.
 *
 * Rendering: GeoJSON source + circle layer (not HTML markers) so a
 * dense city's ~500 BTC POIs stays smooth on pan/zoom. A halo layer
 * sits underneath for the soft glow.
 */
export function BtcOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.btcOverlayVisible);

  // ─── Bbox tracking (mirrors PlaceAnnotationsLayer's pattern) ────
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
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

  const { data: pois } = useBtcViewport(visible ? bounds : null);

  // ─── Build GeoJSON FeatureCollection from POIs ────────────────────
  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: (pois ?? []).map((p) => ({
        type: "Feature",
        // Stable id per (osm_type:osm_id) — MapLibre uses it for
        // setFeatureState-driven hover highlighting later.
        id: `${p.osm_type}:${p.osm_id}`,
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          osm_type: p.osm_type,
          osm_id: p.osm_id,
          name: p.name,
          onchain: p.onchain,
          lightning: p.lightning,
          lightning_contactless: p.lightning_contactless,
        },
      })),
    };
  }, [pois]);

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
      // Halo first (rendered below the dot for the soft glow).
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

    // Theme/basemap swap wipes custom sources — re-attach.
    const onStyleData = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE_ID)) ensure();
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, visible, featureCollection]);

  // ─── Update GeoJSON data on viewport change ───────────────────────
  useEffect(() => {
    if (!map || !visible) return;
    const src = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (src) src.setData(featureCollection);
  }, [map, visible, featureCollection]);

  // ─── Click → navigate to place panel ──────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;
    const onClick = (e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
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
