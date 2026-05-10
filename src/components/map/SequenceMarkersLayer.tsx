import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useUiStore } from "@/stores/ui-store";
import { useViewportSequences } from "@/lib/api/hooks";
import type { ViewportBounds } from "@/types/mapky";

const VIOLET = "#7c3aed";
const VIOLET_DARK = "#5b21b6";

/**
 * One marker per sequence at the bbox centroid. Visually distinct
 * from the place layer (teal balloons) and the capture layer (sky
 * dots) by color (violet) and shape (rounded rect with film icon +
 * count badge).
 *
 * Click → `/sequence/{author}/{id}` opens the SequenceDetailPanel.
 *
 * Vanilla-DOM HTML markers (innerHTML, addEventListener) — same
 * pattern BtcOverlayLayer's cluster bubbles use, dodges the React-
 * portal-vs-effect race that crashed the basemap in earlier work.
 *
 * Sequences without a stored bbox (`min_lat == null`) are skipped —
 * they aren't yet placeable on the map. They'll appear once a member
 * capture flushes the bbox via the indexer.
 */
export function SequenceMarkersLayer() {
  const map = useMapStore((s) => s.map);
  const navigate = useNavigate();
  const visible = useUiStore((s) => s.capturesLayerVisible); // sequences ride the same toggle as captures
  const hidden = useUiStore((s) => s.hiddenLayers).has("captures");
  const enabled = visible && !hidden;

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
    if (!map || !enabled) return;
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
  }, [map, enabled, update]);

  const { data: sequences } = useViewportSequences(enabled ? bounds : null);
  // When a sidebar (CaptureList) is filtering the captures feed, it
  // pushes the sequence ids that survived the filter. Honor that here
  // so the violet pins match the list — otherwise applying a kind/tag
  // filter leaves the map covered in pins for sequences that no
  // longer exist in the user's filtered view.
  const visibleSequenceIds = useUiStore((s) => s.visibleSequenceIds);

  // Stable centroid + author/id so the marker key doesn't churn on
  // metadata-only changes (e.g. renamed sequence keeps same dot).
  const items = useMemo(() => {
    if (!sequences) return [];
    return sequences
      .filter(
        (s) =>
          s.min_lat != null && s.min_lon != null && s.max_lat != null && s.max_lon != null,
      )
      .filter(
        (s) => !visibleSequenceIds || visibleSequenceIds.has(s.id),
      )
      .map((s) => {
        const [author, id] = s.id.split(":");
        return {
          key: s.id,
          author,
          id,
          lat: ((s.min_lat ?? 0) + (s.max_lat ?? 0)) / 2,
          lon: ((s.min_lon ?? 0) + (s.max_lon ?? 0)) / 2,
          count: s.capture_count,
          name: s.name,
        };
      });
  }, [sequences, visibleSequenceIds]);

  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const renderEl = useCallback(
    (count: number, name: string | null, author: string, id: string) => {
      const el = document.createElement("div");
      el.style.pointerEvents = "auto";
      el.style.cursor = "pointer";
      el.setAttribute(
        "aria-label",
        `${name ?? "Sequence"} — ${count} capture${count === 1 ? "" : "s"}`,
      );
      // Pure inline CSS — outside the React tree, we can't lean on
      // Tailwind utilities here. Mirrors the bubble shape of the
      // Mapky / BTC clusters but in violet, with an extra count
      // badge in the corner.
      el.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 9px 4px 7px;
          background: ${VIOLET};
          color: white;
          border: 2px solid white;
          border-radius: 9999px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
          font-size: 11px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          white-space: nowrap;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
          <span>${count}</span>
        </div>
      `;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        navigate({
          to: "/sequence/$authorId/$sequenceId",
          params: { authorId: author, sequenceId: id },
        });
      });
      // Force a tiny outline color shade on hover — pure DOM, no Tailwind.
      el.addEventListener("mouseenter", () => {
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) inner.style.background = VIOLET_DARK;
      });
      el.addEventListener("mouseleave", () => {
        const inner = el.firstElementChild as HTMLElement | null;
        if (inner) inner.style.background = VIOLET;
      });
      return el;
    },
    [navigate],
  );

  useEffect(() => {
    if (!map) return;
    const live = markersRef.current;

    if (!enabled) {
      for (const m of live.values()) m.remove();
      live.clear();
      return;
    }

    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.key);
      const existing = live.get(item.key);
      if (existing) {
        // Count or position changed — rebuild element. Cheap.
        const newEl = renderEl(item.count, item.name, item.author, item.id);
        existing.remove();
        const m = new maplibregl.Marker({ element: newEl, anchor: "center" })
          .setLngLat([item.lon, item.lat])
          .addTo(map);
        live.set(item.key, m);
        continue;
      }
      const el = renderEl(item.count, item.name, item.author, item.id);
      const m = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([item.lon, item.lat])
        .addTo(map);
      live.set(item.key, m);
    }
    for (const [key, m] of live) {
      if (!seen.has(key)) {
        m.remove();
        live.delete(key);
      }
    }
  }, [map, enabled, items, renderEl]);

  useEffect(() => {
    const live = markersRef.current;
    return () => {
      for (const m of live.values()) m.remove();
      live.clear();
    };
  }, []);

  return null;
}
