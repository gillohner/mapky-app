import { Link } from "@tanstack/react-router";
import { Film } from "lucide-react";
import { resolveFileUrl } from "@/lib/api/user";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import { KIND_LABELS, splitCompound } from "./CaptureCard";
import type {
  SequenceDetails,
  SequenceViewportItem,
} from "@/types/mapky";

interface SequenceCardProps {
  sequence: SequenceDetails | SequenceViewportItem;
  /** Drop the per-card creator badge when the parent surface
   *  already names the author once (e.g. inside a single-author
   *  feed). Defaults to true to match the captures discover sidebar. */
  showCreator?: boolean;
}

/**
 * Square cover-thumbnail card for a single sequence — the sibling
 * of `<CaptureCard />` for use inside the unified captures discover
 * sidebar. Click → `/sequence/{author}/{id}` opens the sequence
 * detail panel.
 *
 * Cover image: viewport-list items carry a `cover_uri` (the lowest-
 * `sequence_index` member's `file_uri`); user-list items don't (yet)
 * and fall back to the Film icon. The count badge always shows; the
 * cover image is best-effort.
 */
export function SequenceCard({
  sequence,
  showCreator = true,
}: SequenceCardProps) {
  const [authorId, sequenceId] = splitCompound(sequence.id, sequence.author_id);
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
      {/* Sequence-distinct badge — film glyph + member count, sets
          the card apart from a regular CaptureCard at a glance. */}
      <span className="pointer-events-none absolute left-1 top-1 flex items-center gap-1 rounded-full bg-violet-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur">
        <Film className="h-3 w-3" />
        {sequence.capture_count}
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
        <span className="truncate text-[11px] font-medium text-white">
          {sequence.name ?? "Untitled sequence"}
        </span>
        <span className="text-[10px] text-white/80">{kindLabel}</span>
        {showCreator && (
          <CreatorBadge
            authorId={authorId}
            showName={false}
            className="self-end"
          />
        )}
      </div>
    </Link>
  );
}
