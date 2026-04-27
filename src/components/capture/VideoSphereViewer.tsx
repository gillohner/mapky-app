import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface VideoSphereViewerProps {
  src: string;
  className?: string;
}

const BASE_CSS =
  "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5/index.min.css";
const VIDEO_CSS =
  "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/video-plugin@5/index.min.css";

function ensureStylesheet(href: string) {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Lazy-loaded 360-video sphere viewer. Plays an equirectangular MP4/WebM
 * inside a pannable sphere using Photo Sphere Viewer + EquirectangularVideoAdapter.
 */
export function VideoSphereViewer({ src, className = "" }: VideoSphereViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  type ViewerLike = { destroy: () => void };
  const viewerRef = useRef<ViewerLike | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureStylesheet(BASE_CSS);
    ensureStylesheet(VIDEO_CSS);

    (async () => {
      try {
        const [{ Viewer }, { EquirectangularVideoAdapter }, { VideoPlugin }] =
          await Promise.all([
            import("@photo-sphere-viewer/core"),
            import("@photo-sphere-viewer/equirectangular-video-adapter"),
            import("@photo-sphere-viewer/video-plugin"),
          ]);

        if (cancelled || !containerRef.current) return;

        const viewer = new Viewer({
          container: containerRef.current,
          adapter: [EquirectangularVideoAdapter, { autoplay: true, muted: true }],
          panorama: { source: src },
          navbar: ["zoom", "move", "fullscreen"],
          plugins: [
            [VideoPlugin, { progressbar: true, bigbutton: true }],
          ],
        });

        viewerRef.current = viewer as unknown as ViewerLike;
        setReady(true);
      } catch (err) {
        console.error("VideoSphereViewer init failed:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load viewer");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
      setReady(false);
    };
  }, [src]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-black ${className}`}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
