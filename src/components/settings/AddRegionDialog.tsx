import { useEffect, useMemo, useState } from "react";
import { Download, Globe, Search, X } from "lucide-react";
import { toast } from "sonner";
import { searchPlaces, type NominatimSearchResult } from "@/lib/api/nominatim";
import { config } from "@/lib/config";
import { downloadRegion, planRegion } from "@/lib/offline/region-download";
import { formatBytes } from "@/lib/offline/quota";
import { REGION_PRESETS, type RegionPreset } from "@/lib/offline/region-presets";
import type { Bbox } from "@/lib/offline/tiles";

/**
 * "Add region" dialog with two entry points:
 *
 *   1. Continent presets — large hardcoded bboxes that aren't a single
 *      OSM relation. Defaulted to a low max-zoom because tile counts
 *      blow up fast at continent scale.
 *   2. Place search — runs Nominatim via the plugin's cached proxy.
 *      Admin-boundary results (countries / states / cities) carry the
 *      real `boundingbox` from upstream, so the dialog uses that as-is.
 *      Point hits (POIs) fall back to a synthetic lat/lon ± radius box.
 *
 * Both paths feed the same downloadRegion() loop — the only difference
 * is how the bbox is sourced.
 */

type Selection =
  | { kind: "preset"; preset: RegionPreset }
  | { kind: "search"; result: NominatimSearchResult };

export function AddRegionDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [maxZoom, setMaxZoom] = useState(14);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchPlaces(query.trim());
        setResults(data);
      } catch (err) {
        console.warn("[add-region] search failed", err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  /** Final bbox to download — varies by selection kind. */
  const bbox: Bbox | null = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "preset") return selection.preset.bbox;
    const result = selection.result;
    if (result.boundingbox) {
      const [south, north, west, east] = result.boundingbox;
      return { south, north, west, east };
    }
    // Point hit — synthesise a square box. 1 km ≈ 0.009° latitude;
    // longitude scaled by cos(lat) so high-latitude squares don't
    // turn into rectangles in tile space.
    const dLat = radiusKm * 0.009;
    const dLon =
      (radiusKm * 0.009) / Math.max(0.1, Math.cos((result.lat * Math.PI) / 180));
    return {
      west: result.lon - dLon,
      south: result.lat - dLat,
      east: result.lon + dLon,
      north: result.lat + dLat,
    };
  }, [selection, radiusKm]);

  const usesSyntheticBbox =
    selection?.kind === "search" && !selection.result.boundingbox;

  const plan = bbox ? planRegion(bbox, 0, maxZoom) : null;

  const handleSelectPreset = (preset: RegionPreset) => {
    setSelection({ kind: "preset", preset });
    setQuery(preset.name);
    setResults([]);
    setMaxZoom(preset.defaultMaxZoom);
  };

  const handleSelectResult = (r: NominatimSearchResult) => {
    setSelection({ kind: "search", result: r });
    setQuery(r.display_name.split(",")[0] || r.name);
    setResults([]);
    // Lower the ceiling for big admin areas — a country at z=14 is
    // hundreds of MB. Heuristic: 4° wide → 12, 10° → 10, 30°+ → 7.
    if (r.boundingbox) {
      const [south, north, west, east] = r.boundingbox;
      const span = Math.max(north - south, east - west);
      const z = span > 30 ? 7 : span > 10 ? 10 : span > 4 ? 12 : 14;
      setMaxZoom(z);
    } else {
      setMaxZoom(14);
    }
  };

  const handleClearSelection = () => {
    setSelection(null);
    setQuery("");
    setResults([]);
  };

  const handleDownload = async () => {
    if (!selection || !bbox || !plan) return;
    if (plan.tooLarge) {
      toast.error("Region too large — reduce max zoom or pick a smaller area.");
      return;
    }
    setDownloading(true);
    setProgress({ done: 0, total: plan.tileCount });
    const id =
      selection.kind === "preset"
        ? selection.preset.id
        : `${selection.result.osm_type}:${selection.result.osm_id}`;
    const name =
      selection.kind === "preset"
        ? selection.preset.name
        : selection.result.display_name.split(",")[0] ||
          selection.result.name;
    try {
      await downloadRegion(
        {
          id,
          name,
          bbox,
          tier: "basic",
          pmtilesUrl: pmtilesUrlWithKey(),
          minZoom: 0,
          maxZoom,
        },
        {
          onProgress: (p) => setProgress({ done: p.done, total: p.total }),
        },
      );
      toast.success(`Downloaded ${name} for offline use`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Add offline region</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-4">
          {!selection && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Continents
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {REGION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPreset(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
                    >
                      <Globe className="h-3 w-3" />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Or search a country, city, or place
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Switzerland, Manhattan, Eiffel Tower…"
                    className="w-full rounded-md border border-border bg-surface px-7 py-1.5 text-sm focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>
                {results.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-surface">
                    {results.slice(0, 8).map((r) => (
                      <li key={`${r.osm_type}:${r.osm_id}`}>
                        <button
                          onClick={() => handleSelectResult(r)}
                          className="w-full px-2 py-1.5 text-left text-xs hover:bg-background"
                        >
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            {r.name || r.display_name}
                            {r.boundingbox && (
                              <span className="rounded bg-accent/10 px-1 py-px text-[9px] uppercase tracking-wide text-accent">
                                admin
                              </span>
                            )}
                          </div>
                          <div className="truncate text-muted">
                            {r.display_name}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searching && (
                  <p className="mt-1 text-[11px] text-muted">searching…</p>
                )}
              </div>
            </>
          )}

          {selection && (
            <>
              <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">
                    {selection.kind === "preset"
                      ? selection.preset.name
                      : selection.result.display_name.split(",")[0] ||
                        selection.result.name}
                  </div>
                  <div className="text-[11px] text-muted">
                    {selection.kind === "preset"
                      ? "Continent preset"
                      : selection.result.boundingbox
                        ? "Admin boundary"
                        : "Point — using radius around centre"}
                  </div>
                </div>
                <button
                  onClick={handleClearSelection}
                  className="ml-2 rounded p-1 text-muted hover:text-foreground"
                  aria-label="Change selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {usesSyntheticBbox && (
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                    <span>Radius around the centre</span>
                    <span className="font-mono text-foreground">
                      {radiusKm} km
                    </span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                  <span>Max zoom (detail)</span>
                  <span className="font-mono text-foreground">{maxZoom}</span>
                </label>
                <input
                  type="range"
                  min={4}
                  max={15}
                  step={1}
                  value={maxZoom}
                  onChange={(e) => setMaxZoom(Number(e.target.value))}
                  className="w-full"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Higher zoom shows more detail but downloads more tiles.
                  Continent-scale regions stay readable around z=5–7.
                </p>
              </div>

              {plan && (
                <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">Tiles</span>
                    <span className="font-mono">{plan.tileCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Estimated size</span>
                    <span className="font-mono">
                      {formatBytes(plan.estimatedBytes)}
                    </span>
                  </div>
                  {plan.tooLarge && (
                    <p className="mt-1 text-amber-600 dark:text-amber-400">
                      Too large — reduce max zoom or pick a smaller area.
                    </p>
                  )}
                </div>
              )}

              {downloading && progress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">Downloading…</span>
                    <span className="font-mono">
                      {progress.done} / {progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${Math.round((progress.done / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface/60"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={!selection || downloading || plan?.tooLarge}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            <Download className="h-3 w-3" />
            {downloading ? "Downloading" : "Download"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function pmtilesUrlWithKey(): string {
  const key = config.protomaps.key;
  if (!key) return config.protomaps.url;
  // Same query-param convention the style factory uses for TileJSON;
  // the underlying .pmtiles archive accepts the same key.
  return `${config.protomaps.url}?key=${key}`;
}
