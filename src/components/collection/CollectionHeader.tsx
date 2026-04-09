import { MapPin } from "lucide-react";
import type { CollectionDetails } from "@/types/mapky";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { truncatePublicKey } from "@/lib/api/user";

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

      <div className="mt-2 flex items-center gap-2">
        <UserAvatar userId={authorId} size={6} />
        <span className="text-xs text-muted">
          {truncatePublicKey(authorId)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <MapPin className="h-3 w-3" />
        <span>{collection?.items.length ?? 0} places</span>
      </div>
    </div>
  );
}
