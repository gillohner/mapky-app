import { useCallback } from "react";
import { toast } from "sonner";

interface ShareablePlace {
  kind: "place";
  osmType: string;
  osmId: number | string;
}

interface ShareableUserResource {
  kind: "collection" | "capture" | "sequence" | "route";
  authorId: string;
  resourceId: string;
}

export type ShareableTarget = ShareablePlace | ShareableUserResource;

const PATH_BY_KIND: Record<ShareableUserResource["kind"], string> = {
  collection: "collection",
  capture: "capture",
  sequence: "sequence",
  route: "route",
};

/**
 * Returns a stable callback that copies the share URL for a detail
 * panel's target to the clipboard and toasts the result. Every panel
 * in the app routes through this so the copy / toast / error path
 * looks the same everywhere.
 */
export function useShareLink(target: ShareableTarget) {
  // Capture identity via primitives so the callback stays stable across
  // re-renders without depending on a freshly-allocated object literal.
  const kind = target.kind;
  const a = target.kind === "place" ? target.osmType : target.authorId;
  const b = target.kind === "place" ? String(target.osmId) : target.resourceId;
  return useCallback(async () => {
    const url =
      kind === "place"
        ? `${window.location.origin}/place/${a}/${b}`
        : `${window.location.origin}/${PATH_BY_KIND[kind]}/${a}/${b}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }, [kind, a, b]);
}
