import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useMapStore } from "@/stores/map-store";
import { useRouteCreationStore } from "@/stores/route-creation-store";
import type { WaypointSlot } from "@/stores/route-creation-store";

interface PinHandle {
  marker: maplibregl.Marker;
  slotId: string;
}

/**
 * Renders draggable markers for each non-empty waypoint slot. Markers are
 * keyed by slot id so reorders, removals, and edits don't churn the DOM.
 * Dragging updates the slot's lat/lon (kind = "coords" for the result).
 */
export function WaypointMarkers() {
  const map = useMapStore((s) => s.map);
  const slots = useRouteCreationStore((s) => s.slots);
  const setSlot = useRouteCreationStore((s) => s.setSlot);
  const handlesRef = useRef<PinHandle[]>([]);

  useEffect(() => {
    if (!map) return;

    const previous = new Map(
      handlesRef.current.map((h) => [h.slotId, h.marker]),
    );
    const next: PinHandle[] = [];
    const total = slots.filter((s) => s.kind !== "empty").length;
    let visualIdx = 0;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.kind === "empty") continue;

      const reused = previous.get(slot.id);
      previous.delete(slot.id);

      const marker =
        reused ??
        new maplibregl.Marker({
          element: makePin(visualIdx, total),
          draggable: true,
          anchor: "bottom",
        });

      marker.setLngLat([slot.lon, slot.lat]);
      renderPinLabel(marker.getElement(), visualIdx, total);

      if (!reused) {
        marker.addTo(map);
        marker.on("dragend", () => {
          const ll = marker.getLngLat();
          const cur = useRouteCreationStore.getState().slots[i];
          if (!cur || cur.kind === "empty") return;
          // Drag converts to coords kind — the OSM/GPS link is broken once
          // the user moves the pin off the original anchor.
          setSlot(i, {
            kind: "coords",
            id: cur.id,
            lat: ll.lat,
            lon: ll.lng,
            label: `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`,
          });
        });
      }

      next.push({ marker, slotId: slot.id });
      visualIdx++;
    }

    // Remove markers whose slots disappeared.
    for (const stale of previous.values()) stale.remove();
    handlesRef.current = next;
  }, [map, slots, setSlot]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const h of handlesRef.current) h.marker.remove();
      handlesRef.current = [];
    };
  }, []);

  return null;
}

function makePin(idx: number, total: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "mapky-waypoint-pin";
  el.style.cssText = `
    cursor: grab;
    width: 28px;
    height: 36px;
    transform-origin: bottom center;
  `;
  renderPinLabel(el, idx, total);
  return el;
}

function renderPinLabel(el: HTMLElement, idx: number, total: number) {
  const color = pinColor(idx, total);
  const label = pinLabel(idx, total);
  el.innerHTML = `
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22s14-12.5 14-22C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="18" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#fff">${label}</text>
    </svg>
  `;
}

function pinColor(idx: number, total: number): string {
  if (idx === 0) return "#10B981"; // start = green
  if (idx === total - 1) return "#EF4444"; // end = red
  return "#3B82F6"; // via = blue
}

function pinLabel(idx: number, total: number): string {
  if (idx === 0) return "A";
  if (idx === total - 1) return "B";
  return String(idx);
}

// Helper exported so other components can stay in lock-step with the
// labeling above (e.g. the directions bar).
export function slotPinLabel(slot: WaypointSlot, idx: number, total: number) {
  if (slot.kind === "empty") return "·";
  return pinLabel(idx, total);
}
