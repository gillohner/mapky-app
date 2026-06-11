import { useEffect, useMemo, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useNavigate } from "@tanstack/react-router";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import {
  incidentResultKey,
  useIncidentResultsStore,
} from "@/stores/incident-results-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import { useViewportIncidents } from "@/lib/api/hooks";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useLayerOpacityMultiplier } from "@/lib/map/dim";
import type { IncidentDetails } from "@/types/mapky";

const SOURCE = "mapky-incidents";
const HALO_LAYER = "mapky-incident-halo";
const DOT_LAYER = "mapky-incident-dot";
const LABEL_LAYER = "mapky-incident-label";

function stripAuthorPrefix(authorId: string, incidentId: string): string {
  const prefix = `${authorId}:`;
  return incidentId.startsWith(prefix)
    ? incidentId.slice(prefix.length)
    : incidentId;
}

function incidentsToGeoJSON(
  incidents: IncidentDetails[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [incident.lon, incident.lat] },
      properties: {
        author_id: incident.author_id,
        incident_id: stripAuthorPrefix(incident.author_id, incident.id),
        incident_type: incident.incident_type,
        severity: incident.severity,
      },
    })),
  };
}

function ensureLayers(map: maplibregl.Map) {
  if (!map.getSource(SOURCE)) {
    map.addSource(SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  if (!map.getLayer(HALO_LAYER)) {
    map.addLayer({
      id: HALO_LAYER,
      type: "circle",
      source: SOURCE,
      paint: {
        "circle-radius": [
          "match",
          ["get", "severity"],
          "high",
          14,
          "medium",
          12,
          "low",
          10,
          10,
        ],
        "circle-color": [
          "match",
          ["get", "severity"],
          "high",
          "#dc2626",
          "medium",
          "#ea580c",
          "low",
          "#ca8a04",
          "#b45309",
        ],
        "circle-opacity": 0.22,
        "circle-blur": 0.7,
      },
    });
  }

  if (!map.getLayer(DOT_LAYER)) {
    map.addLayer({
      id: DOT_LAYER,
      type: "circle",
      source: SOURCE,
      paint: {
        "circle-radius": [
          "match",
          ["get", "severity"],
          "high",
          7,
          "medium",
          6,
          "low",
          5,
          5,
        ],
        "circle-color": [
          "match",
          ["get", "severity"],
          "high",
          "#dc2626",
          "medium",
          "#f97316",
          "low",
          "#f59e0b",
          "#f59e0b",
        ],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer(LABEL_LAYER)) {
    map.addLayer({
      id: LABEL_LAYER,
      type: "symbol",
      source: SOURCE,
      layout: {
        "text-field": "!",
        "text-size": [
          "match",
          ["get", "severity"],
          "high",
          11,
          "medium",
          10,
          "low",
          9,
          9,
        ],
        "text-font": ["Noto Sans Bold"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  }
}

/**
 * Incident markers layer (viewport-scoped, non-expired only).
 *
 * Uses a dedicated endpoint (`/v0/mapky/incidents/viewport`) and renders
 * severity-aware warning dots. Click opens the incident detail panel.
 */
export function IncidentMarkersLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.incidentsLayerVisible);
  const hidden = useUiStore((s) => s.hiddenLayers).has("incidents");
  const enabled = visible && !hidden;

  const bounds = useViewportBounds(enabled);
  const incidents = useViewportIncidents(enabled ? bounds : null).data;
  const sidebarResultsActive = useIncidentResultsStore((s) => s.active);
  const sidebarResultKeys = useIncidentResultsStore((s) => s.resultKeys);

  const visibleIncidents = useMemo(() => {
    if (!sidebarResultsActive) return incidents ?? [];
    return (incidents ?? []).filter((incident) =>
      sidebarResultKeys.has(incidentResultKey(incident)),
    );
  }, [incidents, sidebarResultsActive, sidebarResultKeys]);

  const data = useMemo(() => incidentsToGeoJSON(visibleIncidents), [visibleIncidents]);
  const dataRef = useRef<GeoJSON.FeatureCollection>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!map || !enabled) return;

    const setup = () => {
      ensureLayers(map);
      const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
      src?.setData(dataRef.current);
    };

    const onStyleData = () => setup();
    map.on("styledata", onStyleData);

    if (map.isStyleLoaded()) setup();
    else map.once("idle", setup);

    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map, enabled]);

  useEffect(() => {
    if (!map) return;
    const src = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(data);
  }, [map, data]);

  const dim = useLayerOpacityMultiplier("incidents");
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      if (map.getLayer(HALO_LAYER)) {
        map.setPaintProperty(HALO_LAYER, "circle-opacity", 0.22 * dim);
      }
      if (map.getLayer(DOT_LAYER)) {
        map.setPaintProperty(DOT_LAYER, "circle-opacity", dim);
        map.setPaintProperty(DOT_LAYER, "circle-stroke-opacity", dim);
      }
      if (map.getLayer(LABEL_LAYER)) {
        map.setPaintProperty(LABEL_LAYER, "text-opacity", dim);
      }
    };

    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, dim]);

  useEffect(() => {
    if (!map || !enabled) return;

    const onClick = (
      e: maplibregl.MapMouseEvent & { features?: GeoJSON.Feature[] },
    ) => {
      if (useRouteCreationStore.getState().isOpen) return;

      const f = e.features?.[0];
      if (!f) return;
      const props = f.properties as
        | { author_id?: string; incident_id?: string }
        | undefined;
      const authorId = props?.author_id;
      const incidentId = props?.incident_id;
      if (!authorId || !incidentId) return;

      e.originalEvent.stopPropagation();
      navigate({
        to: "/incident/$authorId/$incidentId",
        params: { authorId, incidentId },
      });
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("click", DOT_LAYER, onClick);
    map.on("click", LABEL_LAYER, onClick);
    map.on("mouseenter", DOT_LAYER, onEnter);
    map.on("mouseenter", LABEL_LAYER, onEnter);
    map.on("mouseleave", DOT_LAYER, onLeave);
    map.on("mouseleave", LABEL_LAYER, onLeave);

    return () => {
      map.off("click", DOT_LAYER, onClick);
      map.off("click", LABEL_LAYER, onClick);
      map.off("mouseenter", DOT_LAYER, onEnter);
      map.off("mouseenter", LABEL_LAYER, onEnter);
      map.off("mouseleave", DOT_LAYER, onLeave);
      map.off("mouseleave", LABEL_LAYER, onLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [map, enabled, navigate]);

  return null;
}
