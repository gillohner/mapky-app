import { Crosshair, MapPin, Copy, Compass } from "lucide-react";
import { useState } from "react";
import {
  useActiveDraftItem,
  useAllItemsHaveCoords,
  useCaptureCreationStore,
  useIsBatch,
} from "@/stores/capture-creation-store";
import { useMapStore } from "@/stores/map-store";
import { useNominatimReverse } from "@/lib/api/hooks";

export function PlaceStep() {
  const items = useCaptureCreationStore((s) => s.items);
  const activeIndex = useCaptureCreationStore((s) => s.activeIndex);
  const setActiveIndex = useCaptureCreationStore((s) => s.setActiveIndex);
  const setActiveCoords = useCaptureCreationStore((s) => s.setActiveCoords);
  const setActivePitch = useCaptureCreationStore((s) => s.setActivePitch);
  const setActiveFov = useCaptureCreationStore((s) => s.setActiveFov);
  const applyActiveToAll = useCaptureCreationStore((s) => s.applyActiveToAll);
  const next = useCaptureCreationStore((s) => s.next);
  const active = useActiveDraftItem();
  const isBatch = useIsBatch();
  const allHaveCoords = useAllItemsHaveCoords();
  const map = useMapStore((s) => s.map);
  const [geoLoading, setGeoLoading] = useState(false);

  const isSpherical =
    active?.kind === "panorama" || active?.kind === "video360";

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setActiveCoords(latitude, longitude);
        map?.flyTo({ center: [longitude, latitude], zoom: 16 });
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const { data: reverse } = useNominatimReverse(
    active?.lat ?? null,
    active?.lon ?? null,
  );

  const missingCoords = items.filter(
    (i) => i.lat == null || i.lon == null,
  ).length;
  const aimedCount = items.filter((i) => i.heading != null).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-xl bg-sky-500/10 p-3 text-xs text-sky-700 dark:text-sky-300">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          {isBatch
            ? "Drag the pin to move it, drag the arrow tip to aim. Tap a thumbnail to edit another item."
            : "Drag the pin to move it, drag the arrow tip to point it."}
        </span>
      </div>

      {/* Item selector strip (batch only) */}
      {isBatch && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {items.map((it, idx) => {
            const hasCoords = it.lat != null && it.lon != null;
            const hasHeading = it.heading != null;
            const selected = idx === activeIndex;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`relative h-14 w-18 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  selected
                    ? "border-sky-500 shadow-sm shadow-sky-500/40"
                    : "border-border hover:border-sky-500/50"
                }`}
              >
                {it.file.type.startsWith("video/") ? (
                  <video
                    src={it.previewUrl}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : (
                  <img
                    src={it.previewUrl}
                    alt={`Item ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 text-[10px] text-white">
                  {idx + 1}
                </div>
                {/* Two status dots: coords (top-right) + heading (top-left) */}
                {hasCoords && (
                  <div className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-white" />
                )}
                {hasHeading && (
                  <div className="absolute left-0.5 top-0.5 h-2 w-2 rounded-full bg-sky-400 ring-1 ring-white" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {isBatch && (
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {items.length - missingCoords}/{items.length} located
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            {aimedCount}/{items.length} aimed
          </span>
        </div>
      )}

      {/* Coords + heading readout */}
      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface/40 p-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            Latitude
          </div>
          <div className="font-mono text-foreground">
            {active?.lat?.toFixed(5) ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            Longitude
          </div>
          <div className="font-mono text-foreground">
            {active?.lon?.toFixed(5) ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            <Compass className="mr-0.5 inline h-2.5 w-2.5" />
            Heading
          </div>
          <div className="font-mono text-foreground">
            {active?.heading != null ? `${Math.round(active.heading)}°` : "—"}
          </div>
        </div>
      </div>

      {reverse?.display_name && (
        <div className="truncate rounded-lg bg-surface/50 px-3 py-2 text-xs text-muted">
          Near <span className="text-foreground">{reverse.display_name}</span>
        </div>
      )}

      {/* Spherical-only pitch + FOV */}
      {isSpherical && (
        <div className="space-y-3 rounded-xl border border-border bg-surface/40 p-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label className="font-medium text-foreground">Pitch</label>
              <span className="font-mono text-muted">
                {active?.pitch != null ? `${Math.round(active.pitch)}°` : "0°"}
              </span>
            </div>
            <input
              type="range"
              min={-90}
              max={90}
              step={1}
              value={active?.pitch ?? 0}
              onChange={(e) => setActivePitch(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <label className="font-medium text-foreground">Field of view</label>
              <span className="font-mono text-muted">
                {active?.fov != null ? `${Math.round(active.fov)}°` : "360°"}
              </span>
            </div>
            <input
              type="range"
              min={30}
              max={360}
              step={1}
              value={active?.fov ?? 360}
              onChange={(e) => setActiveFov(Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoLoading}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-surface/60 disabled:opacity-50"
        >
          <Crosshair className="h-3.5 w-3.5" />
          {geoLoading ? "Locating…" : "Use my location"}
        </button>
        {isBatch && (
          <button
            type="button"
            onClick={applyActiveToAll}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-surface/60"
            title="Copy this item's values to every item still missing them"
          >
            <Copy className="h-3.5 w-3.5" />
            Fill missing
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={!allHaveCoords}
        onClick={next}
        className="w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
      >
        {isBatch
          ? allHaveCoords
            ? "Continue"
            : `Place ${missingCoords} more…`
          : "Continue"}
      </button>
    </div>
  );
}
