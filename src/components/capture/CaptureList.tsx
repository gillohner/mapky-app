import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Route as CapturesRoute } from "@/routes/captures";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserGeoCaptures,
  useViewportCaptures,
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
import {
  CaptureCard,
  KIND_LABELS,
  splitCompound,
} from "./CaptureCard";
import type {
  GeoCaptureKind,
  PostTagDetails,
} from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Captures discover sidebar — Mine / In this area feed of geo-captures.
 * Replaces the standalone "+" capture creation button: the New action
 * lives here next to the Mine tab so it's contextual to capture
 * browsing.
 */
export function CaptureList() {
  const navigate = useNavigate();
  const search = CapturesRoute.useSearch();
  const { publicKey } = useAuth();
  const openCreate = useCaptureCreationStore((s) => s.open);

  // Browsing captures → fade places so the focused layer pops.
  // useAutoFocusLayer call moves below `filterActive` so we can flip
  // hide on/off as the user narrows the list (active filter → hide
  // places entirely; plain browsing → places dimmed for context).

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/captures", search: { tab: next }, replace: true });
  };

  // Filter state lifted up so the bbox can freeze while filtering —
  // otherwise useFilterViewport's fitBounds would tighten the map,
  // shrink the viewport-bbox query, and the source list would shed
  // captures as the user types.
  const [filter, setFilter] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeKind, setActiveKind] = useState<string | null>(null);
  const filterActive =
    filter.trim().length > 0 || activeTags.length > 0 || activeKind !== null;

  const liveBbox = useViewportBounds(tab === "viewport");
  const bbox = useFrozenWhile(liveBbox, filterActive);

  const userCaptures = useUserGeoCaptures(tab === "mine" ? publicKey : null);
  const viewport = useViewportCaptures(tab === "viewport" ? bbox : null);
  const list = tab === "mine" ? userCaptures : viewport;

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const close = () => navigate({ to: "/" });

  const allCaptures = list.data ?? [];

  // Batch-fetch tags via useQueries; cache key matches the detail
  // view's useGeoCaptureTags so opening a capture is instant.
  const tagQueries = useQueries({
    queries: allCaptures.map((c) => {
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
    allCaptures.forEach((c, i) => {
      map.set(c.id, tagQueries[i].data ?? []);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCaptures, tagQueries.map((q) => q.dataUpdatedAt).join(",")]);

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
    for (const c of allCaptures)
      counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        label: KIND_LABELS[value as GeoCaptureKind] ?? value,
        count,
      }));
  }, [allCaptures]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return allCaptures.filter((c) => {
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
    });
  }, [allCaptures, filter, activeTags, activeKind, tagsByCapture]);

  useFilterViewport({
    active: filterActive,
    bounds: pointsToBounds(filtered.map((c) => ({ lat: c.lat, lon: c.lon }))),
  });
  // Captures sidebar owns the map: hide Mapky places entirely so the
  // capture markers stand alone. Plain browsing and filtering both
  // follow the same rule.
  useAutoFocusLayer("captures", { hide: true });

  // Project the filtered list onto the map: capture markers + sequence
  // lines only render for captures the user can see in the sidebar.
  // Clear on unmount so the home map shows everything again.
  useEffect(() => {
    const ids = new Set(filtered.map((c) => c.id));
    useUiStore.getState().setVisibleCaptureIds(ids);
  }, [filtered]);
  useEffect(() => {
    return () => {
      useUiStore.getState().setVisibleCaptureIds(null);
    };
  }, []);

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
      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {list.error && (
        <p className="text-xs text-red-500">{(list.error as Error).message}</p>
      )}
      {list.data && filtered.length === 0 && (
        <p className="text-xs text-muted">
          {filter
            ? "No captures match your filter."
            : tab === "mine"
              ? publicKey
                ? "You haven't created any captures yet."
                : "Sign in to see your captures."
              : "No captures in this area yet."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((c) => (
          <CaptureCard
            key={c.id}
            capture={c}
            tags={tagsByCapture.get(c.id) ?? []}
          />
        ))}
      </div>
    </DiscoverSidebar>
  );
}

