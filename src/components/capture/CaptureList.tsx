import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Route as CapturesRoute } from "@/routes/captures";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserGeoCaptures,
  useUserSequences,
  useViewportCaptures,
  useViewportSequences,
} from "@/lib/api/hooks";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useFrozenWhile } from "@/hooks/use-frozen-while";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import {
  pointsToBounds,
  useFilterViewport,
} from "@/hooks/use-filter-viewport";
import { useUiStore } from "@/stores/ui-store";
import { fetchGeoCaptureTags } from "@/lib/api/mapky";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import {
  DiscoverFilter,
  type CategoryOption,
} from "@/components/discover/Filter";
import { CaptureCard, KIND_LABELS, splitCompound } from "./CaptureCard";
import { SequenceCard } from "./SequenceCard";
import type {
  GeoCaptureDetails,
  GeoCaptureKind,
  PostTagDetails,
  SequenceDetails,
  SequenceViewportItem,
} from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Unified item: either a single capture (no parent sequence) or a
 * sequence (rendering as the cover-thumbnail card → its detail page).
 *
 * Sequence-member captures are intentionally NOT in this list — they
 * surface inside the sequence detail panel's gallery, not as
 * standalone rows. From the user's perspective: "this 5-photo
 * sequence is one thing in my feed, not five things."
 */
type FeedItem =
  | {
      kind: "capture";
      id: string; // compound id
      indexedAt: number;
      capture: GeoCaptureDetails;
    }
  | {
      kind: "sequence";
      id: string;
      indexedAt: number;
      sequence: SequenceDetails | SequenceViewportItem;
    };

/**
 * Captures discover sidebar — Mine / In this area feed of geo-captures
 * AND sequences. A standalone capture renders as a `<CaptureCard />`,
 * a sequence renders as a `<SequenceCard />` (one card per sequence,
 * not per member). Both kinds share the timeline (sorted by
 * `indexed_at` desc) so the user sees one chronological feed of
 * "stuff they captured."
 */
export function CaptureList() {
  const navigate = useNavigate();
  const search = CapturesRoute.useSearch();
  const { publicKey } = useAuth();
  const openCreate = useCaptureCreationStore((s) => s.open);

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/captures", search: { tab: next }, replace: true });
  };

  const [filter, setFilter] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeKind, setActiveKind] = useState<string | null>(null);
  const filterActive =
    filter.trim().length > 0 || activeTags.length > 0 || activeKind !== null;

  const liveBbox = useViewportBounds(tab === "viewport");
  const bbox = useFrozenWhile(liveBbox, filterActive);

  // Captures (singletons + sequence members; we drop sequence members
  // below) and sequences fan out in parallel for both tabs.
  const userCaptures = useUserGeoCaptures(tab === "mine" ? publicKey : null);
  const viewportCaptures = useViewportCaptures(tab === "viewport" ? bbox : null);
  const userSequences = useUserSequences(tab === "mine" ? publicKey : null);
  const viewportSequences = useViewportSequences(tab === "viewport" ? bbox : null);
  const captureList = tab === "mine" ? userCaptures : viewportCaptures;
  const sequenceList = tab === "mine" ? userSequences : viewportSequences;

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const close = () => navigate({ to: "/" });

  // Sequence-member captures are filtered out — each member only
  // surfaces inside its sequence card's detail page, never as a
  // standalone row.
  const standaloneCaptures = useMemo<GeoCaptureDetails[]>(() => {
    const all = captureList.data ?? [];
    return all.filter((c) => !c.sequence_uri);
  }, [captureList.data]);

  // Tag fan-out — same pattern as before, scoped to standalone
  // captures only (sequence-as-whole tag count is mostly noise here;
  // sequence cards don't display tags inline).
  const tagQueries = useQueries({
    queries: standaloneCaptures.map((c) => {
      const [authorId, captureId] = splitCompound(c.id, c.author_id);
      return {
        queryKey: [
          "mapky",
          "geo_capture",
          authorId,
          captureId,
          "tags",
        ] as const,
        queryFn: () => fetchGeoCaptureTags(authorId, captureId),
        staleTime: 60_000,
        retry: false,
      };
    }),
  });
  const tagsByCapture = useMemo(() => {
    const map = new Map<string, PostTagDetails[]>();
    standaloneCaptures.forEach((c, i) => {
      map.set(c.id, tagQueries[i].data ?? []);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standaloneCaptures, tagQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const suggestedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tags of tagsByCapture.values()) {
      for (const t of tags) {
        counts.set(t.label, (counts.get(t.label) ?? 0) + t.taggers_count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l)
      .filter((l) => !activeTags.includes(l))
      .slice(0, 12);
  }, [tagsByCapture, activeTags]);

  const kindCategories = useMemo<CategoryOption[]>(() => {
    const counts = new Map<string, number>();
    for (const c of standaloneCaptures)
      counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    for (const s of sequenceList.data ?? [])
      counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        label: KIND_LABELS[value as GeoCaptureKind] ?? value,
        count,
      }));
  }, [standaloneCaptures, sequenceList.data]);

  // Build the unified feed. Sort by indexed_at desc so the user
  // sees their newest stuff first regardless of kind.
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const c of standaloneCaptures) {
      items.push({
        kind: "capture",
        id: c.id,
        indexedAt: c.indexed_at,
        capture: c,
      });
    }
    for (const s of sequenceList.data ?? []) {
      items.push({
        kind: "sequence",
        id: s.id,
        indexedAt: s.indexed_at,
        sequence: s,
      });
    }
    items.sort((a, b) => b.indexedAt - a.indexedAt);
    return items;
  }, [standaloneCaptures, sequenceList.data]);

  // Apply filter to the unified feed. Tag filter only narrows
  // captures (sequences don't carry tag aggregations on the list
  // payload); kind filter narrows both; text filter checks captions/
  // names/descriptions.
  const filtered = useMemo<FeedItem[]>(() => {
    const needle = filter.trim().toLowerCase();
    return feed.filter((item) => {
      if (item.kind === "capture") {
        const c = item.capture;
        if (activeKind && c.kind !== activeKind) return false;
        const tags = tagsByCapture.get(c.id) ?? [];
        const tagLabels = tags.map((t) => t.label);
        if (
          activeTags.length > 0 &&
          !activeTags.every((t) => tagLabels.includes(t))
        ) {
          return false;
        }
        if (!needle) return true;
        return [c.caption, c.kind, ...tagLabels]
          .filter((v): v is string => !!v)
          .some((v) => v.toLowerCase().includes(needle));
      }
      // sequence
      const s = item.sequence;
      if (activeKind && s.kind !== activeKind) return false;
      if (activeTags.length > 0) return false; // tags don't ride sequence list payload
      if (!needle) return true;
      return [s.name, s.description, s.kind, s.device]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(needle));
    });
  }, [feed, filter, activeTags, activeKind, tagsByCapture]);

  // Frozen-bbox fitBounds — captures use their own coords; sequences
  // contribute their bbox centroid.
  const filterPoints = useMemo(() => {
    const points: { lat: number; lon: number }[] = [];
    for (const item of filtered) {
      if (item.kind === "capture") {
        points.push({ lat: item.capture.lat, lon: item.capture.lon });
      } else {
        const s = item.sequence;
        if (s.min_lat != null && s.min_lon != null && s.max_lat != null && s.max_lon != null) {
          points.push({
            lat: (s.min_lat + s.max_lat) / 2,
            lon: (s.min_lon + s.max_lon) / 2,
          });
        }
      }
    }
    return points;
  }, [filtered]);
  useFilterViewport({
    active: filterActive,
    bounds: pointsToBounds(filterPoints),
  });

  // Captures sidebar owns the map — hide Mapky places entirely so
  // capture markers + sequence pills stand alone.
  useAutoFocusLayer("captures", { hide: true });

  // Project the filtered capture set onto the map. Sequences are
  // already projected via SequenceMarkersLayer (which queries the
  // viewport endpoint independently); we don't filter that here.
  useEffect(() => {
    const ids = new Set<string>();
    for (const item of filtered) {
      if (item.kind === "capture") ids.add(item.capture.id);
    }
    useUiStore.getState().setVisibleCaptureIds(ids);
  }, [filtered]);
  useEffect(() => {
    return () => {
      useUiStore.getState().setVisibleCaptureIds(null);
    };
  }, []);

  const isLoading = captureList.isLoading || sequenceList.isLoading;
  const errorMsg =
    (captureList.error as Error | undefined)?.message ??
    (sequenceList.error as Error | undefined)?.message ??
    null;

  return (
    <DiscoverSidebar
      title="Captures"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      {publicKey && (
        <DiscoverNewButton onClick={openCreate} label="New capture" />
      )}
      <DiscoverFilter
        value={filter}
        onChange={setFilter}
        placeholder="Filter by caption or tag…"
        activeTags={activeTags}
        onRemoveTag={(t) =>
          setActiveTags((prev) => prev.filter((x) => x !== t))
        }
        suggestedTags={suggestedTags}
        onAddTag={(t) =>
          setActiveTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
        }
        categories={kindCategories}
        activeCategory={activeKind}
        onCategoryChange={setActiveKind}
      />
      {isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-xs text-muted">
          {filter
            ? "Nothing matches your filter."
            : tab === "mine"
              ? publicKey
                ? "You haven't published any captures or sequences yet."
                : "Sign in to see your captures."
              : "Nothing in this area yet."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((item) =>
          item.kind === "capture" ? (
            <CaptureCard
              key={item.id}
              capture={item.capture}
              tags={tagsByCapture.get(item.capture.id) ?? []}
            />
          ) : (
            <SequenceCard key={item.id} sequence={item.sequence} />
          ),
        )}
      </div>
    </DiscoverSidebar>
  );
}
