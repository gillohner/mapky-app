import { FolderHeart, MapPin } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useCollectionsForPlace } from "@/lib/api/hooks";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { truncatePublicKey } from "@/lib/api/user";

interface PlaceCollectionsProps {
  osmType: string;
  osmId: number;
}

export function PlaceCollections({ osmType, osmId }: PlaceCollectionsProps) {
  const navigate = useNavigate();
  const { data: collections } = useCollectionsForPlace(osmType, osmId);

  if (!collections || collections.length === 0) return null;

  return (
    <div className="border-t border-border pt-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <FolderHeart className="h-3.5 w-3.5" />
        Collections
      </h3>
      <div className="space-y-1.5">
        {collections.map((c) => {
          const [authorId, collectionId] = c.id.split(":");
          return (
            <button
              key={c.id}
              onClick={() =>
                navigate({
                  to: "/collection/$authorId/$collectionId",
                  params: { authorId, collectionId },
                  search: { fromPlaceType: osmType, fromPlaceId: osmId },
                })
              }
              className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface"
            >
              <FolderHeart className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <UserAvatar userId={authorId} size={5} />
                  <span>{truncatePublicKey(authorId)}</span>
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {c.items.length}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
