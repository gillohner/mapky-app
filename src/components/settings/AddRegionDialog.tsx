import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Globe,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { searchPlaces, type NominatimSearchResult } from "@/lib/api/nominatim";
import { config } from "@/lib/config";
import { downloadRegion, planRegion } from "@/lib/offline/region-download";
import { formatBytes } from "@/lib/offline/quota";
import {
  REGION_TREE,
  type ContinentPack,
  type RegionPack,
} from "@/lib/offline/region-presets";
import type { Bbox } from "@/lib/offline/tiles";

/**
 * CoMaps / Organic-Maps style region picker. The primary surface is
 * the hardcoded continent → country tree from `region-presets.ts`;
 * each leaf is a downloadable pack with a pre-tuned default max-zoom.
 * A search box at the bottom is the fallback for everything not in
 * the tree (cities, neighbourhoods, POIs) — admin-boundary hits get
 * Nominatim's real bbox, point hits get a radius slider.
 */

type Selection =
  | { kind: "continent"; pack: ContinentPack }
  | { kind: "country"; pack: RegionPack; parent: ContinentPack }
  | { kind: "search"; result: NominatimSearchResult };

export function AddRegionDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  /** Final bbox to download — depends on the selection kind. */
  const bbox: Bbox | null = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "continent") return selection.pack.bbox;
    if (selection.kind === "country") return selection.pack.bbox;
    const result = selection.result;
    if (result.boundingbox) {
      const [south, north, west, east] = result.boundingbox;
      return { south, north, west, east };
    }
    const dLat = radiusKm * 0.009;
    const dLon =
      (radiusKm * 0.009) /
      Math.max(0.1, Math.cos((result.lat * Math.PI) / 180));
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

  const handlePickContinent = (pack: ContinentPack) => {
    setSelection({ kind: "continent", pack });
    setMaxZoom(pack.defaultMaxZoom);
  };

  const handlePickCountry = (pack: RegionPack, parent: ContinentPack) => {
    setSelection({ kind: "country", pack, parent });
    setMaxZoom(pack.defaultMaxZoom);
  };

  const handlePickSearch = (r: NominatimSearchResult) => {
    setSelection({ kind: "search", result: r });
    setQuery(r.display_name.split(",")[0] || r.name);
    setResults([]);
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
    const { id, name } = identityOf(selection);
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

  const toggleContinent = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-border bg-background shadow-xl">
        <header className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Add offline region
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!selection && (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                  Region packs
                </label>
                <ul className="overflow-hidden rounded-md border border-border">
                  {REGION_TREE.map((continent, i) => {
                    const isExpanded = expanded.has(continent.id);
                    return (
                      <li
                        key={continent.id}
                        className={
                          i > 0 ? "border-t border-border" : undefined
                        }
                      >
                        <div className="flex items-stretch">
                          <button
                            onClick={() => toggleContinent(continent.id)}
                            className="flex flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface"
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted" />
                            )}
                            <Globe className="h-3.5 w-3.5 text-muted" />
                            <span className="font-medium">{continent.name}</span>
                            <span className="ml-auto text-[11px] text-muted">
                              {continent.countries.length} countries
                            </span>
                          </button>
                          <button
                            onClick={() => handlePickContinent(continent)}
                            className="border-l border-border px-3 text-[11px] font-medium text-accent transition-colors hover:bg-surface"
                            title={`Download all of ${continent.name} at low zoom`}
                          >
                            Whole
                          </button>
                        </div>
                        {isExpanded && (
                          <ul className="border-t border-border bg-surface/50">
                            {continent.countries.map((country) => (
                              <li key={country.id}>
                                <button
                                  onClick={() =>
                                    handlePickCountry(country, continent)
                                  }
                                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 pl-9 text-left text-xs text-foreground transition-colors hover:bg-surface"
                                >
                                  <span>{country.name}</span>
                                  <span className="text-[10px] text-muted">
                                    z≤{country.defaultMaxZoom}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                  Or search a city, region, or place
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Bavaria, Manhattan, Eiffel Tower…"
                    className="w-full rounded-md border border-border bg-surface px-7 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                {results.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-surface">
                    {results.slice(0, 8).map((r) => (
                      <li key={`${r.osm_type}:${r.osm_id}`}>
                        <button
                          onClick={() => handlePickSearch(r)}
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
                    {labelOf(selection)}
                  </div>
                  <div className="text-[11px] text-muted">
                    {subtitleOf(selection)}
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
                  Continent-scale picks stay readable around z=5–7.
                </p>
              </div>

              {plan && (
                <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">Tiles</span>
                    <span className="font-mono text-foreground">
                      {plan.tileCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Estimated size</span>
                    <span className="font-mono text-foreground">
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
                    <span className="font-mono text-foreground">
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

        <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
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

function identityOf(s: Selection): { id: string; name: string } {
  if (s.kind === "continent") return { id: s.pack.id, name: s.pack.name };
  if (s.kind === "country") return { id: s.pack.id, name: s.pack.name };
  return {
    id: `${s.result.osm_type}:${s.result.osm_id}`,
    name: s.result.display_name.split(",")[0] || s.result.name,
  };
}

function labelOf(s: Selection): string {
  if (s.kind === "continent") return s.pack.name;
  if (s.kind === "country") return `${s.pack.name} (${s.parent.name})`;
  return s.result.display_name.split(",")[0] || s.result.name;
}

function subtitleOf(s: Selection): string {
  if (s.kind === "continent") return "Continent pack";
  if (s.kind === "country") return "Country pack";
  return s.result.boundingbox
    ? "Admin boundary"
    : "Point — using radius around centre";
}

function pmtilesUrlWithKey(): string {
  const key = config.protomaps.key;
  if (!key) return config.protomaps.url;
  return `${config.protomaps.url}?key=${key}`;
}
