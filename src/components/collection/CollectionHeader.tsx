import { MapPin } from "lucide-react";
import type { CollectionDetails } from "@/types/mapky";
import { CreatorBadge } from "@/components/discover/CreatorBadge";

interface CollectionHeaderProps {
  collection?: CollectionDetails;
  authorId: string;
}

export function CollectionHeader({ collection, authorId }: CollectionHeaderProps) {
  return (
    <div>
      <h2 className="pr-16 text-lg font-semibold text-foreground">
        {collection?.name ?? (
          <span className="inline-block h-5 w-40 animate-pulse rounded bg-border" />
        )}
      </h2>

      {collection?.description && (
        <p className="mt-1 text-sm text-muted line-clamp-3">
          {collection.description}
        </p>
      )}

      <div className="mt-2">
        <CreatorBadge authorId={authorId} size="sm" />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <MapPin className="h-3 w-3" />
        <span>{collection?.items.length ?? 0} places</span>
      </div>
    </div>
  );
}
