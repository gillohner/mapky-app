import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { Route as CapturesRoute } from "@/routes/captures";
import {
  Camera,
  Loader2,
  Image as ImageIcon,
  Video,
  Mic,
  Box,
  CircleDot,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserGeoCaptures,
  useViewportCaptures,
} from "@/lib/api/hooks";
import { useCaptureCreationStore } from "@/stores/capture-creation-store";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import {
  pointsToBounds,
  useFilterViewport,
} from "@/hooks/use-filter-viewport";
import { resolveFileUrl } from "@/lib/api/user";
import { useMapStore } from "@/stores/map-store";
import { fetchGeoCaptureTags } from "@/lib/api/mapky";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverNewButton } from "@/components/discover/NewButton";
import {
  DiscoverFilter,
  type CategoryOption,
} from "@/components/discover/Filter";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import type {
  GeoCaptureDetails,
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
  useAutoFocusLayer("captures");

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/captures", search: { tab: next }, replace: true });
  };
  const bbox = useViewportBounds(tab === "viewport");

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

  const [filter, setFilter] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeKind, setActiveKind] = useState<string | null>(null);

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

  const filterActive =
    filter.trim().length > 0 || activeTags.length > 0 || activeKind !== null;
  useFilterViewport({
    active: filterActive,
    bounds: pointsToBounds(filtered.map((c) => ({ lat: c.lat, lon: c.lon }))),
  });

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

function CaptureCard({
  capture,
  tags = [],
}: {
  capture: GeoCaptureDetails;
  tags?: PostTagDetails[];
}) {
  const map = useMapStore((s) => s.map);
  const [authorId, captureId] = splitCompound(capture.id, capture.author_id);
  const thumb = thumbnailUrl(capture);
  const Icon = kindIcon(capture.kind);
  const topTags = tags.slice(0, 2);

  return (
    <Link
      to="/capture/$authorId/$captureId"
      params={{ authorId, captureId }}
      onClick={() => {
        if (map) {
          map.flyTo({
            center: [capture.lon, capture.lat],
            zoom: 17,
            duration: 800,
          });
        }
      }}
      className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-accent"
    >
      {thumb ? (
        <img
          src={thumb}
          alt={capture.caption ?? KIND_LABELS[capture.kind]}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <Icon className="h-8 w-8" />
        </div>
      )}
      <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
        <Icon className="h-3 w-3" />
        {KIND_LABELS[capture.kind]}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        {capture.caption && (
          <span className="truncate text-[10px] text-white">
            {capture.caption}
          </span>
        )}
        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {topTags.map((t) => (
              <span
                key={t.label}
                className="rounded-full bg-white/15 px-1.5 py-0.5 text-[9px] text-white"
              >
                #{t.label}
              </span>
            ))}
          </div>
        )}
        <CreatorBadge
          authorId={authorId}
          showName={false}
          className="self-end"
        />
      </div>
    </Link>
  );
}

function splitCompound(id: string, authorId: string): [string, string] {
  // GeoCaptureDetails.id is "author:capture"; fall back to author_id if
  // the indexer ever returns just the bare capture id.
  const idx = id.indexOf(":");
  if (idx < 0) return [authorId, id];
  return [id.slice(0, idx), id.slice(idx + 1)];
}

function thumbnailUrl(c: GeoCaptureDetails): string | null {
  // Audio/3D/point-cloud have no still preview; show the icon instead.
  if (c.kind === "audio" || c.kind === "model3d" || c.kind === "point_cloud") {
    return null;
  }
  return resolveFileUrl(c.file_uri);
}

function kindIcon(kind: GeoCaptureKind) {
  switch (kind) {
    case "video":
    case "video360":
      return Video;
    case "audio":
      return Mic;
    case "model3d":
      return Box;
    case "point_cloud":
      return CircleDot;
    case "panorama":
      return Camera;
    default:
      return ImageIcon;
  }
}

const KIND_LABELS: Record<GeoCaptureKind, string> = {
  photo: "Photo",
  panorama: "360°",
  video: "Video",
  video360: "360° Video",
  model3d: "3D",
  point_cloud: "Point Cloud",
  audio: "Audio",
  other: "Other",
};
