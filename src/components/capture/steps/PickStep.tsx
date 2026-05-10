import { useRef, useState } from "react";
import {
  Image as ImageIcon,
  Globe,
  Video as VideoIcon,
  Film,
  Upload,
  MapPin,
  Navigation,
  CheckCircle2,
  X as XIcon,
  Plus,
  Layers,
} from "lucide-react";
import {
  useCaptureCreationStore,
  useActiveDraftItem,
  makeDraftItem,
  type DraftItem,
} from "@/stores/capture-creation-store";
import {
  extractGeoExif,
  isHeic,
  checkEquirectangularAspect,
  type GeoExif,
} from "@/lib/exif";
import type { GeoCaptureKind } from "@/types/mapky";

const ACCEPT =
  "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";

const KIND_META: Record<
  GeoCaptureKind,
  { label: string; icon: typeof ImageIcon }
> = {
  photo: { label: "Photo", icon: ImageIcon },
  panorama: { label: "Panorama", icon: Globe },
  video: { label: "Video", icon: VideoIcon },
  video360: { label: "360° Video", icon: Film },
  model3d: { label: "3D Model", icon: ImageIcon },
  point_cloud: { label: "Point Cloud", icon: ImageIcon },
  audio: { label: "Audio", icon: ImageIcon },
  other: { label: "Other", icon: ImageIcon },
};

function inferKind(file: File, exif: GeoExif | null): GeoCaptureKind {
  const type = file.type;
  if (type.startsWith("video/")) {
    return exif?.isEquirectangular ? "video360" : "video";
  }
  if (type.startsWith("image/")) {
    return exif?.isEquirectangular ? "panorama" : "photo";
  }
  return "other";
}

async function fileToDraftItem(file: File): Promise<DraftItem> {
  const previewUrl = URL.createObjectURL(file);
  const isImage = file.type.startsWith("image/");
  const exif = isImage ? await extractGeoExif(file) : null;

  // Aspect-ratio heuristic: if XMP didn't flag equirectangular but the image
  // has a 2:1 ratio (6000×3000, 8192×4096, etc.), treat it as equirectangular.
  if (isImage && exif && !exif.isEquirectangular) {
    const is2to1 = await checkEquirectangularAspect(file);
    if (is2to1) {
      exif.isEquirectangular = true;
    }
  }

  return makeDraftItem(file, previewUrl, exif, inferKind(file, exif));
}

function DetectionChip({ item }: { item: DraftItem }) {
  const { label, icon: Icon } = KIND_META[item.kind];
  const hasGps = item.exif?.lat != null && item.exif?.lon != null;
  const hasHeading = item.exif?.heading != null;

  const tone =
    hasGps && hasHeading
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : hasGps
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  const StatusIcon =
    hasGps && hasHeading ? CheckCircle2 : hasGps ? Navigation : MapPin;

  const statusText = hasHeading
    ? "GPS + heading"
    : hasGps
      ? "GPS"
      : "No GPS";

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <span className="opacity-60">·</span>
      <StatusIcon className="h-3.5 w-3.5" />
      <span>{statusText}</span>
    </div>
  );
}

export function PickStep() {
  const items = useCaptureCreationStore((s) => s.items);
  const setItems = useCaptureCreationStore((s) => s.setItems);
  const removeItem = useCaptureCreationStore((s) => s.removeItem);
  const setStep = useCaptureCreationStore((s) => s.setStep);
  const active = useActiveDraftItem();

  const inputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handlePick = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = files instanceof FileList ? Array.from(files) : files;
    if (list.length === 0) return;
    setError(null);

    for (const f of list) {
      if (isHeic(f)) {
        setError("HEIC files aren't supported yet — please export as JPEG.");
        return;
      }
    }

    setBusy(true);
    try {
      const drafts = await Promise.all(list.map(fileToDraftItem));
      setItems(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file");
    } finally {
      setBusy(false);
    }
  };

  // EXIF GPS-coverage summary across the picked set. Drives the
  // mix-banner ("4 of 5 have GPS coords"); rendered only when there's
  // an actual mix so the banner stays informative rather than noisy.
  const gpsStats = (() => {
    if (items.length <= 1) return null;
    const withGps = items.filter((i) => i.lat != null && i.lon != null).length;
    if (withGps === 0 || withGps === items.length) return null;
    return { withGps, total: items.length };
  })();

  const handleAddMore = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const drafts = await Promise.all(Array.from(files).map(fileToDraftItem));
      setItems([...items, ...drafts]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file");
    } finally {
      setBusy(false);
    }
  };

  const canContinue = items.length > 0;
  const isBatch = items.length > 1;

  const handleContinue = () => {
    if (!canContinue) return;
    // If every item has EXIF coords we can skip the manual place step.
    // Heading is optional — users can still set it in the review-back flow.
    const allHaveGps = items.every((i) => i.lat != null && i.lon != null);
    if (allHaveGps) {
      setStep("caption");
    } else {
      setStep("place");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Drop zone / gallery */}
      {items.length === 0 ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const dropped = Array.from(e.dataTransfer.files).filter(
                (f) =>
                  f.type.startsWith("image/") || f.type.startsWith("video/"),
              );
              if (dropped.length > 0) handlePick(dropped);
            }}
            className={`flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-muted transition-all disabled:opacity-50 ${
              dragActive
                ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "border-border bg-surface/40 hover:border-sky-500/60 hover:bg-sky-500/5 hover:text-sky-600"
            }`}
          >
            <Upload className="h-8 w-8" />
            <div className="text-sm font-medium">
              {busy
                ? "Reading files…"
                : dragActive
                  ? "Release to add"
                  : "Drag photos here or click to pick files"}
            </div>
            <div className="text-xs">
              Pick multiple to build a Street View-style sequence
            </div>
          </button>
          <div className="text-center text-[10px] text-muted">
            JPEG · PNG · WebP · MP4 · WebM · MOV · EXIF GPS auto-detected
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Batch indicator */}
          {isBatch && (
            <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
              <Layers className="h-3.5 w-3.5" />
              <span>
                Sequence · <strong>{items.length}</strong> captures
              </span>
            </div>
          )}

          {/* GPS coverage banner — only when picked set is mixed
              (some have EXIF coords, some don't). Sets expectations
              about which items will need manual placement on the
              next step. */}
          {gpsStats && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              <MapPin className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
              <span>
                <strong>{gpsStats.withGps} of {gpsStats.total}</strong> files
                carry GPS coords from EXIF. The remaining{" "}
                {gpsStats.total - gpsStats.withGps} will need manual placement
                on the next step.
              </span>
            </div>
          )}

          {/* Preview of active item */}
          {active && (
            <div className="relative overflow-hidden rounded-xl border border-border bg-surface">
              {active.file.type.startsWith("video/") ? (
                <video
                  src={active.previewUrl}
                  className="aspect-video w-full object-cover"
                  controls
                  muted
                />
              ) : (
                <img
                  src={active.previewUrl}
                  alt="Capture preview"
                  className="aspect-video w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-xs text-white backdrop-blur hover:bg-black/80"
              >
                Replace all
              </button>
            </div>
          )}

          {active && <DetectionChip item={active} />}

          {/* Thumbnail strip (only when batch) */}
          {isBatch && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="group relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
                >
                  {it.file.type.startsWith("video/") ? (
                    <video
                      src={it.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                    />
                  ) : (
                    <img
                      src={it.previewUrl}
                      alt={`Item ${idx + 1}`}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-[10px] text-white">
                    {idx + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addInputRef.current?.click()}
                className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted hover:border-sky-500/60 hover:bg-sky-500/5 hover:text-sky-600"
                aria-label="Add more"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Add more (single-item → grow to batch) */}
          {!isBatch && (
            <button
              type="button"
              onClick={() => addInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/40 px-3 py-2 text-xs text-muted hover:border-sky-500/60 hover:bg-sky-500/5 hover:text-sky-600"
            >
              <Plus className="h-3.5 w-3.5" />
              Add more to make a sequence
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handlePick(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={addInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handleAddMore(e.target.files);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        disabled={!canContinue || busy}
        onClick={handleContinue}
        className="mt-auto w-full rounded-xl bg-sky-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
      >
        Continue
      </button>
    </div>
  );
}
