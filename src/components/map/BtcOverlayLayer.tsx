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
 * a second layer of orange BTC dots / cluster bubbles.
 *
 * Two-mode rendering off the same `/v0/mapky/btc/viewport` envelope:
 *
 *   - **Low zoom** (server returns `kind: "clusters"`): orange-bordered
 *     cluster bubbles via vanilla-DOM HTML markers. Cell midpoints
 *     align with the Mapky place layer's clusters at the same cell —
 *     a place that's both Mapky-engaged AND BTC produces stacked
 *     teal+orange bubbles at the same lat/lon, conveying both signals.
 *   - **High zoom** (`kind: "places"`): GeoJSON source + circle layer
 *     so 500+ individual POIs stay smooth on pan/zoom.
 *
 * Vanilla-DOM (innerHTML) for the cluster bubbles instead of React
 * portals: avoids the effect-vs-render race where the portal useMemo
 * runs before the marker creation effect. Click handler binds via
 * addEventListener on the cluster element directly.
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

  const clusters = envelope?.kind === "clusters" ? envelope.clusters : [];
  const places = envelope?.kind === "places" ? envelope.places : [];

  // ─── HIGH ZOOM: GeoJSON source + circle layer ────────────────────

  const featureCollection = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: places.map((p) => ({
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
  }, [places]);

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
      // build of this component may have attached.
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

    remove();

    if (visible) {
      if (map.isStyleLoaded()) ensure();
      else map.once("idle", ensure);
    } else {
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

  // ─── LOW ZOOM: vanilla-DOM cluster markers ───────────────────────

  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const handleClusterClick = useCallback(
    (lat: number, lon: number) => {
      if (!map) return;
      const next = Math.min(map.getZoom() + 2, 11);
      map.flyTo({ center: [lon, lat], zoom: next, duration: 600 });
    },
    [map],
  );

  // Render cluster bubble HTML directly into the marker element. Sized
  // log-scaled by `total` to mirror ClusterBubble's diameter formula.
  const renderClusterEl = useCallback(
    (total: number, lat: number, lon: number): HTMLDivElement => {
      const el = document.createElement("div");
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";
      const diameter = Math.max(32, Math.min(52, 28 + Math.log10(total + 1) * 8));
      const fontSize =
        diameter >= 46 ? 14 : diameter >= 38 ? 12 : 11;
      const label =
        total < 1000
          ? String(total)
          : total < 10_000
            ? `${(total / 1000).toFixed(1)}k`
            : total < 1_000_000
              ? `${Math.round(total / 1000)}k`
              : `${(total / 1_000_000).toFixed(1)}M`;
      // Pure CSS — no Tailwind utility classes needed inside the
      // marker since we're outside the React tree. Inline styles win
      // against any global resets.
      el.innerHTML = `
        <div style="
          position: relative;
          width: ${diameter}px;
          height: ${diameter}px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
          backdrop-filter: blur(4px);
          border: 2px solid ${BTC_ORANGE};
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${BTC_ORANGE_DARK};
          font-weight: 700;
          font-size: ${fontSize}px;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        ">${label}</div>
      `;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        handleClusterClick(lat, lon);
      });
      return el;
    },
    [handleClusterClick],
  );

  useEffect(() => {
    if (!map) return;
    const live = markersRef.current;

    if (!visible) {
      for (const m of live.values()) m.remove();
      live.clear();
      return;
    }

    const seen = new Set<string>();
    for (const c of clusters) {
      const key = `${c.lat.toFixed(6)}:${c.lon.toFixed(6)}`;
      seen.add(key);
      const existing = live.get(key);
      if (existing) {
        // Total may have changed (different zoom or new data) — rebuild
        // the element so the count reflects reality.
        const newEl = renderClusterEl(c.total, c.lat, c.lon);
        existing.getElement().replaceWith(newEl);
        // maplibre's Marker keeps an internal _element ref — easiest to
        // remove + re-add than try to swap it in place.
        existing.remove();
        const m = new maplibregl.Marker({ element: newEl, anchor: "center" })
          .setLngLat([c.lon, c.lat])
          .addTo(map);
        live.set(key, m);
        continue;
      }
      const el = renderClusterEl(c.total, c.lat, c.lon);
      const m = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([c.lon, c.lat])
        .addTo(map);
      live.set(key, m);
    }
    for (const [key, m] of live) {
      if (!seen.has(key)) {
        m.remove();
        live.delete(key);
      }
    }
  }, [map, visible, clusters, renderClusterEl]);

  useEffect(() => {
    const live = markersRef.current;
    return () => {
      for (const m of live.values()) m.remove();
      live.clear();
    };
  }, []);

  return null;
}
