import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface VirtualTourNodeData {
  id: string;
  panorama: string;
  gps: [number, number];
  name?: string;
  caption?: string;
  thumbnail?: string;
  links: Array<{
    nodeId: string;
    gps: [number, number];
  }>;
}

export interface SphereViewerHandle {
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface SphereViewerProps {
  /** Compound ID of the node to display. Changes trigger in-place navigation. */
  nodeId: string;
  /** Async callback to load a node by its compound ID. Results are cached. */
  getNode: (nodeId: string) => Promise<VirtualTourNodeData>;
  /** Fired when the user navigates to a different node in-sphere. */
  onNodeChange?: (nodeId: string) => void;
  /** Ref to expose viewer controls. */
  viewerHandle?: React.MutableRefObject<SphereViewerHandle | null>;
  className?: string;
}

const BASE_CSS =
  "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/core@5/index.min.css";
const VT_CSS =
  "https://cdn.jsdelivr.net/npm/@photo-sphere-viewer/virtual-tour-plugin@5/index.min.css";

function ensureStylesheet(href: string) {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Lazy-loaded equirectangular sphere viewer with virtual-tour navigation.
 * The viewer is created ONCE and persists across node changes — PSV's
 * VirtualTourPlugin handles smooth in-place transitions without destroying
 * the sphere (preserving heading / zoom).
 */
export function SphereViewer({
  nodeId,
  getNode,
  onNodeChange,
  viewerHandle,
  className = "",
}: SphereViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<unknown>(null);
  const vtPluginRef = useRef<unknown>(null);
  const currentNodeRef = useRef<string | null>(null);
  const nodeCacheRef = useRef(new Map<string, VirtualTourNodeData>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs to latest callbacks so the PSV closure always calls current versions
  const onNodeChangeRef = useRef(onNodeChange);
  onNodeChangeRef.current = onNodeChange;
  const getNodeRef = useRef(getNode);
  getNodeRef.current = getNode;

  /** Cached getNode — returns from memory if already fetched. */
  const cachedGetNode = async (id: string): Promise<VirtualTourNodeData> => {
    const cached = nodeCacheRef.current.get(id);
    if (cached) return cached;
    const data = await getNodeRef.current(id);
    nodeCacheRef.current.set(id, data);
    return data;
  };

  // Initialize PSV + VirtualTourPlugin once
  useEffect(() => {
    let cancelled = false;
    ensureStylesheet(BASE_CSS);
    ensureStylesheet(VT_CSS);

    (async () => {
      try {
        const [{ Viewer }, { VirtualTourPlugin }] = await Promise.all([
          import("@photo-sphere-viewer/core"),
          import("@photo-sphere-viewer/virtual-tour-plugin"),
        ]);

        if (cancelled || !containerRef.current) return;

        const viewer = new Viewer({
          container: containerRef.current,
          navbar: false,
          plugins: [
            [
              VirtualTourPlugin,
              {
                dataMode: "server",
                positionMode: "gps",
                renderMode: "3d",
                preload: true,
                startNodeId: nodeId,
                getNode: async (id: string) => {
                  const data = await cachedGetNode(id);
                  return {
                    id: data.id,
                    panorama: data.panorama,
                    gps: data.gps,
                    name: data.name,
                    caption: data.caption,
                    thumbnail: data.thumbnail,
                    links: data.links.map((l) => ({
                      nodeId: l.nodeId,
                      gps: l.gps,
                    })),
                  };
                },
                transitionOptions: {
                  showLoader: true,
                  speed: "20rpm",
                  rotation: true,
                },
              },
            ],
          ],
        });

        const vtPlugin = viewer.getPlugin(VirtualTourPlugin);
        vtPluginRef.current = vtPlugin;

        if (vtPlugin) {
          (
            vtPlugin as {
              addEventListener: (ev: string, cb: (e: unknown) => void) => void;
            }
          ).addEventListener("node-changed", (e: unknown) => {
            const ev = e as { node?: { id?: string } };
            if (ev.node?.id) {
              currentNodeRef.current = ev.node.id;
              onNodeChangeRef.current?.(ev.node.id);
            }
          });
        }

        currentNodeRef.current = nodeId;
        viewerRef.current = viewer;

        if (viewerHandle) {
          viewerHandle.current = {
            zoomIn: () => (viewer as unknown as { zoom: (v: number) => void }).zoom(10),
            zoomOut: () => (viewer as unknown as { zoom: (v: number) => void }).zoom(-10),
          };
        }

        setReady(true);
      } catch (err) {
        console.error("SphereViewer init failed:", err);
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load viewer",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current) {
        (viewerRef.current as { destroy: () => void }).destroy();
        viewerRef.current = null;
        vtPluginRef.current = null;
        currentNodeRef.current = null;
      }
      setReady(false);
    };
    // Only run on mount — nodeId changes are handled by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate in-place when nodeId prop changes (e.g. from route params or external nav)
  useEffect(() => {
    if (!ready || !vtPluginRef.current) return;
    if (currentNodeRef.current === nodeId) return;

    const vtPlugin = vtPluginRef.current as {
      setCurrentNode: (
        id: string,
        options?: unknown,
      ) => Promise<boolean>;
    };
    vtPlugin.setCurrentNode(nodeId).catch(() => {});
  }, [ready, nodeId]);

  return (
    <div
      className={`relative overflow-hidden bg-black ${className}`}
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
