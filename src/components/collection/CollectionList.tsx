import { useEffect, useMemo, useRef, useState } from "react";
import { FolderHeart, MapPin, Eye, EyeOff, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Route as CollectionsRoute } from "@/routes/collections";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserCollections,
  useViewportCollections,
} from "@/lib/api/hooks";
import { fetchCollectionTags } from "@/lib/api/mapky";
import { useUiStore, type CollectionOverlayEntry } from "@/stores/ui-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import { DiscoverFilter } from "@/components/discover/Filter";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import { CreateCollectionForm } from "./CreateCollectionForm";
import type { CollectionDetails, PostTagDetails } from "@/types/mapky";

/** Cap auto-pinned overlays to the OVERLAY_COLORS palette length so
 * each collection gets a distinct hue. */
const AUTO_PIN_LIMIT = 7;

type Tab = "mine" | "viewport";

/**
 * Collections discover sidebar — Mine / In this area feed. Search lives
 * in the global top SearchBar. Viewport tab ships disabled with a
 * "Coming soon" note pending the /v0/mapky/collections/viewport
 * backend endpoint.
 */
export function CollectionList() {
  const navigate = useNavigate();
  const search = CollectionsRoute.useSearch();
  const { isAuthenticated, publicKey } = useAuth();
  const { data: collections, isLoading } = useUserCollections(publicKey);
  const [creating, setCreating] = useState(false);

  // Tab lives in the URL so reload + history-back from a collection
  // detail land the user back on the same tab they were browsing.
  // Default depends on auth state — signed-in users start on "Mine",
  // signed-out users start on the public "In this area" tab.
  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/collections", search: { tab: next }, replace: true });
  };

  // Browsing collections fades Mapky places + captures; an active
  // filter (text or tag chip) hides them entirely so the focused
  // collection overlays own the map. The hook re-runs when the
  // boolean changes — see further down for `filterActive`.

  // Public viewport: backed by the indexer's
  // /v0/mapky/collections/viewport endpoint, which returns every
  // collection (any author) with at least one place inside the bbox.
  const bbox = useViewportBounds(tab === "viewport");
  const viewportQuery = useViewportCollections(
    tab === "viewport" ? bbox : null,
  );

  // Auto-pin every visible collection so its member places show up as
  // colored POIs without the user having to flip eye icons one-by-one.
  // Saves the user's pre-existing overlays on mount and restores them
  // on unmount so closing the sidebar leaves the map exactly as it was.
  const savedOverlaysRef = useRef<Map<string, CollectionOverlayEntry> | null>(null);
  useEffect(() => {
    savedOverlaysRef.current = new Map(useUiStore.getState().activeCollectionOverlays);
    return () => {
      const s = useUiStore.getState();
      s.clearAllCollectionOverlays();
      if (savedOverlaysRef.current) {
        for (const e of savedOverlaysRef.current.values()) {
          s.addCollectionOverlay(e.authorId, e.collectionId, e.color);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetCollections =
    tab === "mine" ? collections : viewportQuery.data;

  const tabs: DiscoverTab[] = useMemo(() => {
    const list: DiscoverTab[] = [];
    if (publicKey) list.push({ id: "mine", label: "Mine" });
    list.push({ id: "viewport", label: "In this area" });
    return list;
  }, [publicKey]);

  const close = () => navigate({ to: "/" });

  const [filter, setFilter] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  // Collections sidebar owns the map: hide places + captures entirely
  // so the colored collection overlays stand alone. Plain browsing
  // and filtering both follow the same rule.
  useAutoFocusLayer("collections", { hide: true });

  // Active list depends on tab. Tags are batch-fetched against this
  // unified list so both tabs render chips + tag filter the same way.
  const activeList: CollectionDetails[] =
    tab === "mine"
      ? collections ?? []
      : viewportQuery.data ?? [];

  const tagQueries = useQueries({
    queries: activeList.map((c) => {
      const [authorId, collectionId] = c.id.split(":");
      return {
        queryKey: [
          "mapky",
          "collection",
          authorId,
          collectionId,
          "tags",
        ] as const,
        queryFn: () => fetchCollectionTags(authorId, collectionId),
        staleTime: 60_000,
        retry: false,
      };
    }),
  });
  const tagsByCollection = useMemo(() => {
    const map = new Map<string, PostTagDetails[]>();
    activeList.forEach((c, i) => {
      map.set(c.id, tagQueries[i].data ?? []);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, tagQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Auto-pin: only the filtered subset gets colored on the map. As the
  // user types a filter or picks tag chips, overlays update to match
  // what they see in the list. The full unfiltered set is what shows
  // when there's no filter active.
  //
  // Two guards keep this from blowing away overlays unnecessarily:
  //   1. Skip while targetCollections is undefined (tab switch / first
  //      load of viewportQuery) — without this, an empty filteredTarget
  //      from "no data yet" would clear pins and only re-add them once
  //      the request settles.
  //   2. Drive the effect off a stable id-key so tag-query refetches
  //      that don't change the visible-collection set don't retrigger
  //      the clear-then-re-add cycle.
  const filteredTarget = useMemo(
    () =>
      targetCollections
        ? filterCollections(targetCollections, filter, activeTags, tagsByCollection)
        : null,
    [targetCollections, filter, activeTags, tagsByCollection],
  );
  const filteredKey = useMemo(
    () =>
      filteredTarget
        ? filteredTarget.slice(0, AUTO_PIN_LIMIT).map((c) => c.id).join(",")
        : null,
    [filteredTarget],
  );
  useEffect(() => {
    if (!filteredTarget) return;
    const top = filteredTarget.slice(0, AUTO_PIN_LIMIT);
    const s = useUiStore.getState();
    s.clearAllCollectionOverlays();
    for (const c of top) {
      const [authorId, collectionId] = c.id.split(":");
      s.addCollectionOverlay(authorId, collectionId, c.color ?? undefined);
    }
    // filteredKey gates the effect; filteredTarget is the actual data
    // we read. ESLint can't see through the gate so silence it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredKey]);

  const suggestedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tags of tagsByCollection.values()) {
      for (const t of tags) {
        counts.set(t.label, (counts.get(t.label) ?? 0) + t.taggers_count);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l]) => l)
      .filter((l) => !activeTags.includes(l))
      .slice(0, 12);
  }, [tagsByCollection, activeTags]);

  return (
    <DiscoverSidebar
      title="Collections"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
    >
      {tab === "viewport" ? (
        <>
          <DiscoverFilter
            value={filter}
            onChange={setFilter}
            placeholder="Filter by name, tag, description…"
            activeTags={activeTags}
            onRemoveTag={(t) =>
              setActiveTags((prev) => prev.filter((x) => x !== t))
            }
            suggestedTags={suggestedTags}
            onAddTag={(t) =>
              setActiveTags((prev) =>
                prev.includes(t) ? prev : [...prev, t],
              )
            }
          />
          <ViewportCollections
            query={viewportQuery}
            filter={filter}
            activeTags={activeTags}
            tagsByCollection={tagsByCollection}
          />
        </>
      ) : !isAuthenticated ? (
        <p className="py-8 text-center text-sm text-muted">
          Sign in to create and view collections
        </p>
      ) : creating ? (
        <CreateCollectionForm onClose={() => setCreating(false)} />
      ) : (
        <div className="space-y-3">
          <DiscoverNewButton
            onClick={() => setCreating(true)}
            label="New collection"
          />
          <DiscoverFilter
            value={filter}
            onChange={setFilter}
            placeholder="Filter by name, tag, description…"
            activeTags={activeTags}
            onRemoveTag={(t) =>
              setActiveTags((prev) => prev.filter((x) => x !== t))
            }
            suggestedTags={suggestedTags}
            onAddTag={(t) =>
              setActiveTags((prev) =>
                prev.includes(t) ? prev : [...prev, t],
              )
            }
          />

          {isLoading && <LoadingSkeleton />}

          {!isLoading && (collections?.length ?? 0) === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              You don't have any collections yet
            </p>
          )}

          {filterCollections(collections, filter, activeTags, tagsByCollection).map(
            (c) => (
              <CollectionCard
                key={c.id}
                collection={c}
                tags={tagsByCollection.get(c.id) ?? []}
              />
            ),
          )}
          {!isLoading &&
            (collections?.length ?? 0) > 0 &&
            filterCollections(
              collections,
              filter,
              activeTags,
              tagsByCollection,
            ).length === 0 && (
              <p className="text-xs text-muted">
                No collections match your filter.
              </p>
            )}
        </div>
      )}
    </DiscoverSidebar>
  );
}

function filterCollections(
  cs: CollectionDetails[] | undefined,
  q: string,
  activeTags: string[],
  tagsByCollection: Map<string, PostTagDetails[]>,
): CollectionDetails[] {
  if (!cs) return [];
  const needle = q.trim().toLowerCase();
  return cs.filter((c) => {
    const tags = tagsByCollection.get(c.id) ?? [];
    const tagLabels = tags.map((t) => t.label);
    if (
      activeTags.length > 0 &&
      !activeTags.every((t) => tagLabels.includes(t))
    ) {
      return false;
    }
    if (!needle) return true;
    const haystack = [c.name, c.description ?? "", ...tagLabels]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function ViewportCollections({
  query,
  filter,
  activeTags,
  tagsByCollection,
}: {
  query: ReturnType<typeof useViewportCollections>;
  filter: string;
  activeTags: string[];
  tagsByCollection: Map<string, PostTagDetails[]>;
}) {
  if (query.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </p>
    );
  }
  if (query.error) {
    return (
      <p className="text-xs text-red-500">{(query.error as Error).message}</p>
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <p className="text-xs text-muted">
        No collections in this area yet. Pan or zoom out to find more.
      </p>
    );
  }
  const filtered = filterCollections(
    query.data,
    filter,
    activeTags,
    tagsByCollection,
  );
  if (filtered.length === 0) {
    return (
      <p className="text-xs text-muted">No collections match your filter.</p>
    );
  }
  return (
    <div className="space-y-3">
      {filtered.map((c) => (
        <CollectionCard
          key={c.id}
          collection={c}
          tags={tagsByCollection.get(c.id) ?? []}
        />
      ))}
    </div>
  );
}

function CollectionCard({
  collection,
  tags,
}: {
  collection: CollectionDetails;
  tags: PostTagDetails[];
}) {
  const navigate = useNavigate();
  const overlays = useUiStore((s) => s.activeCollectionOverlays);
  const toggleOverlay = useUiStore((s) => s.toggleCollectionOverlay);
  const [authorId, collectionId] = collection.id.split(":");

  const overlay = overlays.get(collectionId);
  const isVisible = !!overlay;
  const topTags = tags.slice(0, 3);
  const overflow = tags.length - topTags.length;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-border p-3 transition-colors hover:bg-surface">
      <button
        onClick={() =>
          navigate({
            to: "/collection/$authorId/$collectionId",
            params: { authorId, collectionId },
          })
        }
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <FolderHeart className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{collection.name}</p>
          {collection.description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-2">
              {collection.description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {collection.items.length} places
            </span>
            <CreatorBadge authorId={authorId} />
          </div>
          {topTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {topTags.map((t) => (
                <span
                  key={t.label}
                  className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted"
                >
                  {t.label}
                </span>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-muted">+{overflow}</span>
              )}
            </div>
          )}
        </div>
      </button>

      {collection.items.length > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleOverlay(authorId, collectionId, collection.color ?? undefined);
          }}
          title={isVisible ? "Hide on map" : "Show on map"}
          className="flex-shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          {isVisible ? (
            <Eye className="h-4 w-4" style={{ color: overlay.color }} />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-lg bg-border" />
      ))}
    </div>
  );
}
