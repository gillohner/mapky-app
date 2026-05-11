import { useEffect, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { searchPlaces, type NominatimSearchResult } from "@/lib/api/nominatim";
import { config } from "@/lib/config";
import { downloadRegion, planRegion } from "@/lib/offline/region-download";
import { formatBytes } from "@/lib/offline/quota";
import type { Bbox } from "@/lib/offline/tiles";

/**
 * Modal-style dialog for picking a city to download. Search uses
 * Nominatim via the existing cached plugin proxy; the bbox is
 * synthesised from the result's lat/lon plus a fixed buffer so we
 * don't need a new search shape just for boundingboxes. A "City
 * radius" slider lets the user trade size for coverage.
 *
 * On confirm: kicks off `downloadRegion` with progress callbacks and
 * dismisses on completion. The parent reloads the regions list.
 */
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
  const [selected, setSelected] = useState<NominatimSearchResult | null>(null);
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

  // Synthetic bbox: 1 km ≈ 0.009° latitude / (cos(lat) × 0.009°) longitude
  // — close enough for picking a download footprint.
  const bbox: Bbox | null = selected
    ? (() => {
        const dLat = (radiusKm * 0.009) / 1;
        const dLon =
          (radiusKm * 0.009) /
          Math.max(0.1, Math.cos((selected.lat * Math.PI) / 180));
        return {
          west: selected.lon - dLon,
          south: selected.lat - dLat,
          east: selected.lon + dLon,
          north: selected.lat + dLat,
        };
      })()
    : null;

  const plan = bbox ? planRegion(bbox, 0, maxZoom) : null;

  const handleDownload = async () => {
    if (!selected || !bbox || !plan) return;
    if (plan.tooLarge) {
      toast.error("Region too large — reduce radius or max zoom.");
      return;
    }
    setDownloading(true);
    setProgress({ done: 0, total: plan.tileCount });
    try {
      await downloadRegion(
        {
          id: `${selected.osm_type}:${selected.osm_id}`,
          name: selected.display_name.split(",")[0] || selected.name,
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
      toast.success(`Downloaded ${selected.name} for offline use`);
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              City
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search city or place"
                className="w-full rounded-md border border-border bg-surface px-7 py-1.5 text-sm focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            {results.length > 0 && !selected && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-surface">
                {results.slice(0, 8).map((r) => (
                  <li key={`${r.osm_type}:${r.osm_id}`}>
                    <button
                      onClick={() => {
                        setSelected(r);
                        setQuery(r.display_name.split(",")[0] || r.name);
                        setResults([]);
                      }}
                      className="w-full px-2 py-1.5 text-left text-xs hover:bg-background"
                    >
                      <div className="font-medium">{r.name || r.display_name}</div>
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

          {selected && (
            <>
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

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                  <span>Max zoom (detail)</span>
                  <span className="font-mono text-foreground">{maxZoom}</span>
                </label>
                <input
                  type="range"
                  min={8}
                  max={15}
                  step={1}
                  value={maxZoom}
                  onChange={(e) => setMaxZoom(Number(e.target.value))}
                  className="w-full"
                />
                <p className="mt-1 text-[11px] text-muted">
                  Higher zoom shows more detail but downloads more tiles.
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
                      Too large — reduce radius or max zoom.
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
            disabled={!selected || downloading || plan?.tooLarge}
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
