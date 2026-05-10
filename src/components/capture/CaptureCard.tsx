import { Link } from "@tanstack/react-router";
import {
  Camera,
  Image as ImageIcon,
  Video,
  Mic,
  Box,
  CircleDot,
} from "lucide-react";
import { resolveFileUrl } from "@/lib/api/user";
import { useMapStore } from "@/stores/map-store";
import { CreatorBadge } from "@/components/discover/CreatorBadge";
import type {
  GeoCaptureDetails,
  GeoCaptureKind,
  PostTagDetails,
} from "@/types/mapky";

interface CaptureCardProps {
  capture: GeoCaptureDetails;
  /** Tags to surface on the card (top 2 rendered as chips). */
  tags?: PostTagDetails[];
  /** When false, suppress the per-card creator badge. Useful when
   *  the card is rendered inside a single-author context (e.g. a
   *  sequence detail page) where the author's already named once. */
  showCreator?: boolean;
  /** Skip the flyTo on click (callers like SequenceDetailPanel
   *  manage their own map focus). */
  flyToOnClick?: boolean;
}

/**
 * Square thumbnail card for a single geo-capture. Click → opens the
 * capture detail panel via TanStack Router. Used by CaptureList's
 * grid and the SequenceDetailPanel's member gallery.
 */
export function CaptureCard({
  capture,
  tags = [],
  showCreator = true,
  flyToOnClick = true,
}: CaptureCardProps) {
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
        if (flyToOnClick && map) {
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
                className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] text-white"
              >
                {t.label}
              </span>
            ))}
          </div>
        )}
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

export function splitCompound(
  id: string,
  authorId: string,
): [string, string] {
  // GeoCaptureDetails.id is "author:capture"; fall back to author_id
  // if the indexer ever returns just the bare capture id.
  const idx = id.indexOf(":");
  if (idx < 0) return [authorId, id];
  return [id.slice(0, idx), id.slice(idx + 1)];
}

export function thumbnailUrl(c: GeoCaptureDetails): string | null {
  // Audio / 3D / point-cloud have no still preview; show the icon
  // fallback instead.
  if (c.kind === "audio" || c.kind === "model3d" || c.kind === "point_cloud") {
    return null;
  }
  return resolveFileUrl(c.file_uri);
}

export function kindIcon(kind: GeoCaptureKind) {
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

export const KIND_LABELS: Record<GeoCaptureKind, string> = {
  photo: "Photo",
  panorama: "360°",
  video: "Video",
  video360: "360° Video",
  model3d: "3D",
  point_cloud: "Point Cloud",
  audio: "Audio",
  other: "Other",
};
