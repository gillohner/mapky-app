import { MapPin } from "lucide-react";
import type { CollectionDetails } from "@/types/mapky";
import { CreatorBadge } from "@/components/discover/CreatorBadge";

interface CollectionHeaderProps {
  collection?: CollectionDetails;
  authorId: string;
}

/**
 * Visible title block for a collection — name (h2) + author + place
 * count. The chrome `title` slot in DiscoverSidebar gets replaced by
 * the back button on detail panels, so the visible title lives here
 * (same pattern as RouteDetailPanel + the unified sequence/capture
 * panels). Description is rendered in the panel body, not here, so the
 * panel can hide it while the edit form is open.
 */
export function CollectionHeader({ collection, authorId }: CollectionHeaderProps) {
  return (
    <div className="space-y-2">
      <h2 className="truncate text-base font-semibold text-foreground">
        {collection?.name ?? (
          <span className="inline-block h-5 w-40 animate-pulse rounded bg-border" />
        )}
      </h2>
      <CreatorBadge authorId={authorId} size="sm" />
      <div className="flex items-center gap-2 text-xs text-muted">
        <MapPin className="h-3 w-3" />
        <span>{collection?.items.length ?? 0} places</span>
      </div>
    </div>
  );
}
