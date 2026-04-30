import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Loader2, MapPin, Star, Tag as TagIcon } from "lucide-react";
import { useViewportPlaces, useOsmLookup } from "@/lib/api/hooks";
import { fetchPlaceTags } from "@/lib/api/mapky";
import { lookupOsmElement } from "@/lib/api/nominatim";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useMapStore } from "@/stores/map-store";
import { DiscoverSidebar } from "@/components/discover/DiscoverSidebar";
import {
  DiscoverFilter,
  type CategoryOption,
  type TagMode,
} from "@/components/discover/Filter";
import { fallbackPlaceLabel } from "@/lib/map/osm-url";
import type { PlaceDetails, PostTagDetails } from "@/types/mapky";

/**
 * Places discover sidebar — feed of indexed places in the current map
 * viewport. Each row shows its top tags inline; a filter box at the
 * top searches by name/tag and clicking suggested tag chips narrows
 * the list further.
 */
export function PlaceList() {
  const navigate = useNavigate();
  const bbox = useViewportBounds();
  const viewport = useViewportPlaces(bbox);
  useAutoFocusLayer("places");
  const close = () => navigate({ to: "/" });

  // Batch-fetch tags for every place in the viewport. TanStack caches
  // each per (osmType, osmId), so opening a place detail later reuses
  // the same query. With ~20–50 places per viewport this stays cheap.
  const places = viewport.data ?? [];
  const tagQueries = useQueries({
    queries: places.map((p) => ({
      queryKey: ["mapky", "place", p.osm_type, p.osm_id, "tags"] as const,
      queryFn: () => fetchPlaceTags(p.osm_type, p.osm_id),
      enabled: p.tag_count > 0,
      staleTime: 60_000,
      retry: false,
    })),
  });

  const tagsByPlace = useMemo(() => {
    const map = new Map<string, PostTagDetails[]>();
    places.forEach((p, i) => {
      const tags = tagQueries[i].data ?? [];
      map.set(placeKey(p), tags);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, tagQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Batch Nominatim lookups so the parent has each place's type for
  // the location-type filter chips. Cache key matches the per-row
  // useOsmLookup so PlaceRow doesn't re-fetch.
  const nominatimQueries = useQueries({
    queries: places.map((p) => ({
      queryKey: ["nominatim", "lookup", p.osm_type, p.osm_id] as const,
      queryFn: () => lookupOsmElement(p.osm_type, p.osm_id),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });
  const typeByPlace = useMemo(() => {
    const map = new Map<string, string>();
    places.forEach((p, i) => {
      const nom = nominatimQueries[i].data;
      const t = nom?.type?.replace(/_/g, " ");
      if (t && t !== "yes" && t !== "unclassified") map.set(placeKey(p), t);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, nominatimQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Filter state — text + tags + location-type. Stays local for now.
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<TagMode>("all");
  const [activeType, setActiveType] = useState<string | null>(null);

  // Suggest tag chips ranked by frequency across the visible places,
  // capped at 12 and excluding ones already active.
  const suggestedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tags of tagsByPlace.values()) {
      for (const t of tags) {
        counts.set(t.label, (counts.get(t.label) ?? 0) + t.taggers_count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label)
      .filter((l) => !activeTags.includes(l))
      .slice(0, 12);
  }, [tagsByPlace, activeTags]);

  // Location-type categories: ranked by count across the visible
  // places, capped to keep the chip strip from overwhelming the panel.
  const typeCategories = useMemo<CategoryOption[]>(() => {
    const counts = new Map<string, number>();
    for (const t of typeByPlace.values()) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, count]) => ({ value, label: value, count }));
  }, [typeByPlace]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return places.filter((p) => {
      const key = placeKey(p);
      const tags = tagsByPlace.get(key) ?? [];
      const tagLabels = tags.map((t) => t.label);
      // Location-type filter (single-select).
      if (activeType && typeByPlace.get(key) !== activeType) return false;
      // Active-tag filter: ALL or ANY based on tagMode.
      if (activeTags.length > 0) {
        const ok =
          tagMode === "all"
            ? activeTags.every((t) => tagLabels.includes(t))
            : activeTags.some((t) => tagLabels.includes(t));
        if (!ok) return false;
      }
      // Text filter matches osm canonical, type, and any tag label.
      if (!needle) return true;
      const haystack = [
        p.osm_canonical,
        typeByPlace.get(key) ?? "",
        ...tagLabels,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [places, tagsByPlace, typeByPlace, query, activeTags, tagMode, activeType]);

  return (
    <DiscoverSidebar title="Places" onClose={close}>
      <DiscoverFilter
        value={query}
        onChange={setQuery}
        placeholder="Filter by name or tag…"
        activeTags={activeTags}
        onRemoveTag={(t) => setActiveTags((prev) => prev.filter((x) => x !== t))}
        suggestedTags={suggestedTags}
        onAddTag={(t) =>
          setActiveTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
        }
        tagMode={tagMode}
        onTagModeChange={setTagMode}
        categories={typeCategories}
        activeCategory={activeType}
        onCategoryChange={setActiveType}
      />

      {viewport.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {viewport.error && (
        <p className="text-xs text-red-500">
          {(viewport.error as Error).message}
        </p>
      )}
      {!viewport.isLoading && places.length === 0 && (
        <p className="text-xs text-muted">
          No indexed places in this area yet. Try zooming out or panning.
        </p>
      )}
      {!viewport.isLoading && places.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-muted">
          No places match your filter.
        </p>
      )}
      <div className="space-y-1.5">
        {filtered.map((p) => (
          <PlaceRow
            key={placeKey(p)}
            place={p}
            tags={tagsByPlace.get(placeKey(p)) ?? []}
          />
        ))}
      </div>
    </DiscoverSidebar>
  );
}

function placeKey(p: PlaceDetails): string {
  return `${p.osm_type}-${p.osm_id}`;
}

function PlaceRow({
  place,
  tags,
}: {
  place: PlaceDetails;
  tags: PostTagDetails[];
}) {
  const navigate = useNavigate();
  const map = useMapStore((s) => s.map);
  const { data: nominatim } = useOsmLookup(place.osm_type, place.osm_id, true);

  const name =
    nominatim?.name ||
    nominatim?.display_name?.split(",")[0] ||
    fallbackPlaceLabel(place.osm_type, place.osm_id);
  const typeLabel = nominatim?.type?.replace(/_/g, " ") ?? "";

  // Show the top 3 tags inline; a "+N" badge surfaces overflow without
  // overwhelming the row.
  const topTags = tags.slice(0, 3);
  const overflow = tags.length - topTags.length;

  return (
    <button
      onClick={() => {
        if (map && place.lat && place.lon) {
          map.flyTo({
            center: [place.lon, place.lat],
            zoom: 17,
            duration: 800,
          });
        }
        navigate({
          to: "/place/$osmType/$osmId",
          params: { osmType: place.osm_type, osmId: String(place.osm_id) },
        });
      }}
      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:border-accent"
    >
      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm text-foreground">{name}</p>
          {typeLabel && typeLabel !== "yes" && (
            <span className="flex-shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] capitalize text-muted">
              {typeLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          {place.review_count > 0 && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3" />
              {place.review_count}
            </span>
          )}
          {place.tag_count > 0 && (
            <span className="flex items-center gap-0.5">
              <TagIcon className="h-3 w-3" />
              {place.tag_count}
            </span>
          )}
        </div>
        {topTags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {topTags.map((t) => (
              <span
                key={t.label}
                className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted"
              >
                #{t.label}
              </span>
            ))}
            {overflow > 0 && (
              <span className="text-[10px] text-muted">+{overflow}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
