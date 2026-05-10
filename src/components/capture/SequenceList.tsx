import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Film } from "lucide-react";
import { Route as SequencesRoute } from "@/routes/sequences";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useUserSequences,
  useViewportSequences,
} from "@/lib/api/hooks";
import { useViewportBounds } from "@/hooks/use-viewport-bounds";
import { useFrozenWhile } from "@/hooks/use-frozen-while";
import { useAutoFocusLayer } from "@/hooks/use-auto-focus-layer";
import {
  pointsToBounds,
  useFilterViewport,
} from "@/hooks/use-filter-viewport";
import { resolveFileUrl } from "@/lib/api/user";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import { DiscoverFilter } from "@/components/discover/Filter";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import { KIND_LABELS } from "./CaptureCard";
import type { SequenceDetails, SequenceViewportItem } from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Sequences discover sidebar — Mine / In this area feed of geo-capture
 * sequences. Mirrors `<CaptureList />` in shape and bbox-freeze
 * behavior, with a name-only client filter (sequence tag density is
 * low; richer filtering can come later if it's actually needed).
 */
export function SequenceList() {
  const navigate = useNavigate();
  const search = SequencesRoute.useSearch();
  const { publicKey } = useAuth();

  const tab: Tab = search.tab ?? (publicKey ? "mine" : "viewport");
  const setTab = (next: Tab) => {
    navigate({ to: "/sequences", search: { tab: next }, replace: true });
  };

  const [filter, setFilter] = useState("");
  const filterActive = filter.trim().length > 0;

  const liveBbox = useViewportBounds(tab === "viewport");
  const bbox = useFrozenWhile(liveBbox, filterActive);

  const userSequences = useUserSequences(tab === "mine" ? publicKey : null);
  const viewport = useViewportSequences(tab === "viewport" ? bbox : null);

  // Both branches return a list of objects shaped like
  // SequenceDetails (the viewport variant adds an extra cover_uri).
  // Cast to a union and let downstream code read shared fields.
  const allSequences: ReadonlyArray<SequenceDetails | SequenceViewportItem> =
    tab === "mine"
      ? userSequences.data ?? []
      : viewport.data ?? [];

  const list = tab === "mine" ? userSequences : viewport;

  const tabs: DiscoverTab[] = useMemo(() => {
    const out: DiscoverTab[] = [];
    if (publicKey) out.push({ id: "mine", label: "Mine" });
    out.push({ id: "viewport", label: "In this area" });
    return out;
  }, [publicKey]);

  const close = () => navigate({ to: "/" });

  // Browsing sequences → fade places so the focused layer pops.
  // Active filter → hide places entirely (full-focus mode).
  useAutoFocusLayer("places", { hide: filterActive });

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return [...allSequences];
    return allSequences.filter((s) => {
      const haystack = [s.name ?? "", s.description ?? "", s.device ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [allSequences, filter]);

  // Fit map to filtered sequences' centroids when filtering.
  useFilterViewport({
    active: filterActive,
    bounds: pointsToBounds(
      filtered
        .filter((s) => s.min_lat != null && s.min_lon != null)
        .map((s) => ({
          lat: ((s.min_lat ?? 0) + (s.max_lat ?? 0)) / 2,
          lon: ((s.min_lon ?? 0) + (s.max_lon ?? 0)) / 2,
        })),
    ),
  });

  return (
    <DiscoverSidebar
      title="Sequences"
      onClose={close}
      tabs={tabs}
      activeTab={tab}
      onTabChange={(t) => setTab(t as Tab)}
    >
      <DiscoverFilter
        value={filter}
        onChange={setFilter}
        placeholder="Filter by name…"
        activeTags={[]}
        onRemoveTag={() => {}}
        suggestedTags={[]}
        onAddTag={() => {}}
        tagMode="all"
        onTagModeChange={() => {}}
      />

      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {!list.isLoading && filtered.length === 0 && (
        <p className="text-xs text-muted">
          {tab === "mine"
            ? "You haven't published any sequences yet."
            : "No sequences in this area."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((s) => (
          <SequenceCard key={s.id} sequence={s} />
        ))}
      </div>
    </DiscoverSidebar>
  );
}

function SequenceCard({
  sequence,
}: {
  sequence: SequenceDetails | SequenceViewportItem;
}) {
  const [authorId, sequenceId] = splitCompound(sequence.id, sequence.author_id);
  // viewport items carry a cover_uri; user-list items don't (yet).
  const coverUri = "cover_uri" in sequence ? sequence.cover_uri : null;
  const coverUrl = coverUri ? resolveFileUrl(coverUri) : null;
  const kindLabel =
    KIND_LABELS[sequence.kind as keyof typeof KIND_LABELS] ?? sequence.kind;
  return (
    <Link
      to="/sequence/$authorId/$sequenceId"
      params={{ authorId, sequenceId }}
      className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface transition-colors hover:border-accent"
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={sequence.name ?? "Sequence cover"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted">
          <Film className="h-8 w-8" />
        </div>
      )}
      <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur">
        <Film className="h-3 w-3" />
        {sequence.capture_count}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        <span className="truncate text-[11px] font-medium text-white">
          {sequence.name ?? "Untitled sequence"}
        </span>
        <span className="text-[10px] text-white/80">{kindLabel}</span>
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
  const idx = id.indexOf(":");
  if (idx < 0) return [authorId, id];
  return [id.slice(0, idx), id.slice(idx + 1)];
}
