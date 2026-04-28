import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  Plus,
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
import { resolveFileUrl } from "@/lib/api/user";
import { useMapStore } from "@/stores/map-store";
import { DiscoverSidebar, type DiscoverTab } from "@/components/discover/DiscoverSidebar";
import type { GeoCaptureDetails, GeoCaptureKind } from "@/types/mapky";

type Tab = "mine" | "viewport";

/**
 * Captures discover sidebar — Mine / In this area feed of geo-captures.
 * Replaces the standalone "+" capture creation button: the New action
 * lives here next to the Mine tab so it's contextual to capture
 * browsing.
 */
export function CaptureList() {
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const openCreate = useCaptureCreationStore((s) => s.open);

  const [tab, setTab] = useState<Tab>(publicKey ? "mine" : "viewport");
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

  const rightHeader = publicKey ? (
    <button
      onClick={openCreate}
      className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
      title="Capture something here"
    >
      <Plus className="h-3.5 w-3.5" />
      New
    </button>
  ) : undefined;

  return (
    <DiscoverSidebar
      title="Captures"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      onClose={close}
      rightHeaderSlot={rightHeader}
    >
      {list.isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      )}
      {list.error && (
        <p className="text-xs text-red-500">{(list.error as Error).message}</p>
      )}
      {list.data && list.data.length === 0 && (
        <p className="text-xs text-muted">
          {tab === "mine"
            ? publicKey
              ? "You haven't created any captures yet."
              : "Sign in to see your captures."
            : "No captures in this area yet."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {list.data?.map((c) => <CaptureCard key={c.id} capture={c} />)}
      </div>
    </DiscoverSidebar>
  );
}

function CaptureCard({ capture }: { capture: GeoCaptureDetails }) {
  const map = useMapStore((s) => s.map);
  const [authorId, captureId] = splitCompound(capture.id, capture.author_id);
  const thumb = thumbnailUrl(capture);
  const Icon = kindIcon(capture.kind);

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
      {capture.caption && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1 text-[10px] text-white">
          {capture.caption}
        </span>
      )}
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
