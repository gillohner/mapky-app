import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Route as RoutesIndexRoute } from "@/routes/routes/index";
import { Loader2 } from "lucide-react";
import {
  DiscoverFilter,
  type CategoryOption,
} from "@/components/discover/Filter";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserRoutes, useViewportRoutes } from "@/lib/api/hooks";
import { fetchRouteTags } from "@/lib/api/mapky";
import {
  readySlotCount,
  useRouteCreationStore,
} from "@/stores/route-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useFrozenWhile } from "@/hooks/use-frozen-while";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { useFilterViewport, type FilterBounds } from "@/hooks/use-filter-viewport";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import { RoutesIndexLayer } from "@/components/map/RoutesIndexLayer";
import { RouteCard } from "./RouteCard";
import type { PostTagDetails } from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Routes discover sidebar — Mine / In this area feed. Search lives in
 * the global top SearchBar (places / tags / routes modes), so this list
 * is a clean preview-of-routes with no in-panel filter UI.
 */
export function RouteList() {
  const navigate = useNavigate();
  const search = RoutesIndexRoute.useSearch();
  const { publicKey } = useAuth();
  const reset = useRouteCreationStore((s) => s.reset);
  const slots = useRouteCreationStore((s) => s.slots);
  const mode = useRouteCreationStore((s) => s.mode);
  // Only treat populated slots as a "draft" when we're in create mode.
  // Viewing a saved route (loadFromExisting) sets mode to "edit" and
  // hydrates the slots — that's not a draft, it's the saved route's
  // waypoints, so the resume banner shouldn't appear.
  const draftCount = mode === "create" ? readySlotCount(slots) : 0;

  // Browsing routes fades Mapky places + captures; an active filter
  // hides them entirely so the user can focus on the routes they're
  // narrowing down to. (filterActive is computed below; the hook
  // re-runs when the boolean changes.)
  // The `useAutoFocusLayer` call lives further down once filterActive
  // is in scope.

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/routes", search: { tab: next }, replace: true });
  };

  // Filter state lifted up so the bbox can freeze while filtering.
  const [filter, setFilter] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeActivity, setActiveActivity] = useState<string | null>(null);
  const filterActive =
    filter.trim().length > 0 ||
    activeTags.length > 0 ||
    activeActivity !== null;

  const liveBbox = useViewportBounds();
  const bbox = useFrozenWhile(liveBbox, filterActive);

  const userRoutes = useUserRoutes(tab === "mine" ? publicKey : null);
  const viewportRoutes = useViewportRoutes(tab === "viewport" ? bbox : null);

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const handleCreate = () => {
    reset();
    navigate({ to: "/directions" });
  };

  const close = () => navigate({ to: "/" });

  const list = tab === "mine" ? userRoutes : viewportRoutes;

  const allRoutes = list.data ?? [];

  // Batch-fetch tags for every route in the list. Cache key matches
  // the detail view's useRouteTags so opening a route is instant.
  const tagQueries = useQueries({
    queries: allRoutes.map((r) => {
      const idx = r.id.indexOf(":");
      const authorId = idx >= 0 ? r.id.slice(0, idx) : r.author_id;
      const routeId = idx >= 0 ? r.id.slice(idx + 1) : r.id;
      return {
        queryKey: ["mapky", "route", authorId, routeId, "tags"] as const,
        queryFn: () => fetchRouteTags(authorId, routeId),
        staleTime: 60_000,
        retry: false,
      };
    }),
  });
  const tagsByRoute = useMemo(() => {
    const map = new Map<string, PostTagDetails[]>();
    allRoutes.forEach((r, i) => {
      map.set(r.id, tagQueries[i].data ?? []);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRoutes, tagQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const suggestedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tags of tagsByRoute.values()) {
      for (const t of tags) {
        counts.set(t.label, (counts.get(t.label) ?? 0) + t.taggers_count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l)
      .filter((l) => !activeTags.includes(l))
      .slice(0, 12);
  }, [tagsByRoute, activeTags]);

  // Activity categories ranked by count in the visible list.
  const activityCategories = useMemo<CategoryOption[]>(() => {
    const counts = new Map<string, number>();
    for (const r of allRoutes)
      counts.set(r.activity, (counts.get(r.activity) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }));
  }, [allRoutes]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return allRoutes.filter((r) => {
      if (activeActivity && r.activity !== activeActivity) return false;
      const tags = tagsByRoute.get(r.id) ?? [];
      const tagLabels = tags.map((t) => t.label);
      if (
        activeTags.length > 0 &&
        !activeTags.every((t) => tagLabels.includes(t))
      ) {
        return false;
      }
      if (!needle) return true;
      return [r.name, r.description, r.activity, ...tagLabels]
        .filter((v): v is string => !!v)
        .some((v) => v.toLowerCase().includes(needle));
    });
  }, [allRoutes, filter, activeTags, activeActivity, tagsByRoute]);

  // Routes have a stored bbox per metadata; union the filtered set's
  // bboxes for a fit. Snaps the map to whatever's left after filtering
  // and pans back when the user clears it.
  const filteredBounds = useMemo<FilterBounds | null>(() => {
    if (filtered.length === 0) return null;
    let minLat = Infinity,
      minLon = Infinity,
      maxLat = -Infinity,
      maxLon = -Infinity;
    for (const r of filtered) {
      if (r.min_lat < minLat) minLat = r.min_lat;
      if (r.max_lat > maxLat) maxLat = r.max_lat;
      if (r.min_lon < minLon) minLon = r.min_lon;
      if (r.max_lon > maxLon) maxLon = r.max_lon;
    }
    if (!Number.isFinite(minLat)) return null;
    return { minLat, minLon, maxLat, maxLon };
  }, [filtered]);

  useFilterViewport({ active: filterActive, bounds: filteredBounds });

  // Routes sidebar owns the map: hide Mapky places + captures
  // entirely so the colored route polylines stand alone.
  useAutoFocusLayer("routes", { hide: true });

  return (
    <>
      {/* Render every visible route as a polyline + start marker on
          the map. Bodies are fetched in parallel (TanStack useQueries),
          same cache as the detail view's useRouteBody, so opening any
          route's detail page is instant. */}
      <RoutesIndexLayer routes={filtered} />

      <DiscoverSidebar
      title="Routes"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      <DiscoverNewButton onClick={handleCreate} label="Plan a new route" />
      <DiscoverFilter
        value={filter}
        onChange={setFilter}
        placeholder="Filter by name, tag, activity…"
        activeTags={activeTags}
        onRemoveTag={(t) =>
          setActiveTags((prev) => prev.filter((x) => x !== t))
        }
        suggestedTags={suggestedTags}
        onAddTag={(t) =>
          setActiveTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
        }
        categories={activityCategories}
        activeCategory={activeActivity}
        onCategoryChange={setActiveActivity}
      />

      {draftCount > 0 && (
        <button
          onClick={() => navigate({ to: "/directions" })}
          className="mb-3 w-full rounded-md border border-dashed border-accent bg-accent/10 px-2 py-1.5 text-left text-xs text-accent hover:bg-accent/20"
        >
          Resume draft ({draftCount} waypoints)
        </button>
      )}

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
            ? "No routes match your filter."
            : tab === "mine"
              ? "You haven't saved any routes yet."
              : "No routes in this area yet."}
        </p>
      )}
      <div className="space-y-1.5">
        {filtered.map((r) => (
          <RouteCard
            key={r.id}
            route={r}
            tags={tagsByRoute.get(r.id) ?? []}
          />
        ))}
      </div>
    </DiscoverSidebar>
    </>
  );
}
