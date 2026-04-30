import { useEffect, useMemo, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { fetchBitcoinPois, type BitcoinPoi } from "@/lib/btcmap/overpass";

const SOURCE = "btcmap-bitcoin";
const CIRCLE_LAYER = "btcmap-bitcoin-circle";
const SYMBOL_LAYER = "btcmap-bitcoin-symbol";
const LIGHTNING_LAYER = "btcmap-bitcoin-lightning";
const CONTACTLESS_LAYER = "btcmap-bitcoin-contactless";

/**
 * Bitcoin Accepted overlay — OSM POIs with `currency:XBT=yes` (or
 * legacy `payment:bitcoin=yes`) sourced live from Overpass. Each POI
 * gets a Bitcoin orange circle with a ₿ glyph; supplementary glyphs
 * (⚡ Lightning, 📡 contactless) sit alongside when the per-method
 * tags are present.
 *
 * Disabled below z=8 to keep Overpass happy with the public fair-use
 * tier — continent-scale queries time out and burn the global rate
 * limit. Refetches on a 1.5s-debounced `moveend` via TanStack Query
 * keyed on a coarse bbox.
 */
export function BitcoinOverlayLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.bitcoinOverlayVisible);
  const liveBbox = useViewportBounds(visible);
  const zoom = useMapStore((s) => s.zoom);

  // Snap the live viewport to a coarse 1° grid (≈100km bins). The
  // fetched bbox always FULLY CONTAINS the viewport (floor on min,
  // ceil on max), so panning inside the snapped tile re-uses the
  // cached result. This is what stops the endpoint spam: most pans
  // resolve to the same query key → instant cache hit.
  const TILE = 1.0;
  const snapped = useMemo(() => {
    if (!liveBbox || zoom < 9) return null;
    return {
      minLat: floorTo(liveBbox.minLat, TILE),
      minLon: floorTo(liveBbox.minLon, TILE),
      maxLat: ceilTo(liveBbox.maxLat, TILE),
      maxLon: ceilTo(liveBbox.maxLon, TILE),
    };
  }, [liveBbox, zoom]);

  const { data: pois } = useQuery({
    queryKey: [
      "btcmap",
      "overpass",
      snapped?.minLat,
      snapped?.minLon,
      snapped?.maxLat,
      snapped?.maxLon,
    ],
    queryFn: ({ signal }) => fetchBitcoinPois(snapped!, signal),
    enabled: visible && snapped !== null,
    // Keep the previous data on the screen while a new bbox is in
    // flight — without this, every cross-tile pan flashes empty for
    // the duration of the Overpass round-trip.
    placeholderData: keepPreviousData,
    // Overpass results are pretty stable; 30 min in cache is fine.
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  // Hold latest GeoJSON in a ref so the deferred styledata re-attach
  // can populate without waiting for another React render — same
  // pattern Mapky's other GeoJSON layers use.
  const dataRef = useRef<GeoJSON.FeatureCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const layersAttached = useRef(false);

  useEffect(() => {
    if (!map) return;

    const ensure = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, {
          type: "geojson",
          data: dataRef.current,
        });
      }

      const beforeId = map.getLayer("mapky-place-dot")
        ? "mapky-place-dot"
        : undefined;

      if (!map.getLayer(CIRCLE_LAYER)) {
        map.addLayer(
          {
            id: CIRCLE_LAYER,
            type: "circle",
            source: SOURCE,
            paint: {
              "circle-color": "#f7931a", // bitcoin orange
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 5,
                14, 8,
                18, 12,
              ],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1.5,
              "circle-opacity": 0.95,
            },
          },
          beforeId,
        );
      }

      if (!map.getLayer(SYMBOL_LAYER)) {
        map.addLayer(
          {
            id: SYMBOL_LAYER,
            type: "symbol",
            source: SOURCE,
            layout: {
              "text-field": "₿",
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10, 8,
                14, 11,
                18, 16,
              ],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#fff",
            },
          },
          beforeId,
        );
      }

      if (!map.getLayer(LIGHTNING_LAYER)) {
        map.addLayer(
          {
            id: LIGHTNING_LAYER,
            type: "symbol",
            source: SOURCE,
            filter: ["==", ["get", "lightning"], true],
            layout: {
              "text-field": "⚡",
              "text-size": 12,
              "text-offset": [1.1, -0.9],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#facc15",
              "text-halo-color": "#0008",
              "text-halo-width": 1.2,
            },
          },
          beforeId,
        );
      }

      if (!map.getLayer(CONTACTLESS_LAYER)) {
        map.addLayer(
          {
            id: CONTACTLESS_LAYER,
            type: "symbol",
            source: SOURCE,
            filter: ["==", ["get", "contactless"], true],
            layout: {
              "text-field": "📡",
              "text-size": 11,
              "text-offset": [-1.1, -0.9],
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-halo-color": "#0008",
              "text-halo-width": 1.2,
            },
          },
          beforeId,
        );
      }

      layersAttached.current = true;
    };

    const remove = () => {
      for (const id of [
        CIRCLE_LAYER,
        SYMBOL_LAYER,
        LIGHTNING_LAYER,
        CONTACTLESS_LAYER,
      ]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
      layersAttached.current = false;
    };

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
      remove();
    }

    const onStyleData = () => {
      if (!visible) return;
      if (!map.getSource(SOURCE)) ensure();
    };
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, visible]);

  // Push the latest Overpass result into the GeoJSON source. Only
  // update when we actually have data — `pois` is undefined while
  // the very first query is in flight, and writing an empty
  // FeatureCollection at that moment would flash the markers off
  // for the round-trip duration. Once data arrives, we keep it on
  // screen even across tile-key changes thanks to keepPreviousData.
  useEffect(() => {
    if (!pois) return;
    dataRef.current = poisToGeoJSON(pois);
    if (!map) return;
    const src = map.getSource(SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(dataRef.current);
  }, [map, pois]);

  // Click → place panel (route handles OSM POIs already).
  useEffect(() => {
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CIRCLE_LAYER, SYMBOL_LAYER],
      });
      if (!features.length) return;

      const props = features[0].properties as {
        osm_type?: string;
        osm_id?: number;
      } | null;
      if (!props?.osm_type || props.osm_id == null) return;

      e.originalEvent.stopPropagation();
      navigate({
        to: "/place/$osmType/$osmId",
        params: {
          osmType: String(props.osm_type),
          osmId: String(props.osm_id),
        },
      });
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", CIRCLE_LAYER, onClick);
    map.on("click", SYMBOL_LAYER, onClick);
    map.on("mouseenter", CIRCLE_LAYER, onEnter);
    map.on("mouseleave", CIRCLE_LAYER, onLeave);
    return () => {
      map.off("click", CIRCLE_LAYER, onClick);
      map.off("click", SYMBOL_LAYER, onClick);
      map.off("mouseenter", CIRCLE_LAYER, onEnter);
      map.off("mouseleave", CIRCLE_LAYER, onLeave);
    };
  }, [map, navigate]);

  return null;
}

function poisToGeoJSON(pois: BitcoinPoi[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pois.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        osm_type: p.osmType,
        osm_id: p.osmId,
        name: p.name,
        onchain: p.onchain,
        lightning: p.lightning,
        contactless: p.lightningContactless,
      },
    })),
  };
}

function floorTo(v: number, step: number): number {
  return Math.floor(v / step) * step;
}

function ceilTo(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}
