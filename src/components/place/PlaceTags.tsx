import { TagIcon } from "lucide-react";
import { usePlaceTags } from "@/lib/api/hooks";
import { truncatePublicKey } from "@/lib/api/user";

interface PlaceTagsProps {
  osmType: string;
  osmId: number;
}

export function PlaceTags({ osmType, osmId }: PlaceTagsProps) {
  const { data, isLoading } = usePlaceTags(osmType, osmId);

  if (isLoading) {
    return (
      <div className="flex gap-2 py-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-6 w-16 animate-pulse rounded-full bg-border"
          />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <TagIcon className="h-3.5 w-3.5" />
        Tags
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {data.map((tag) => (
          <span
            key={tag.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs"
            title={`${tag.taggers_count} tagger${tag.taggers_count !== 1 ? "s" : ""}: ${tag.taggers.map((t) => truncatePublicKey(t, 4)).join(", ")}`}
          >
            <span className="text-foreground">{tag.label}</span>
            <span className="text-muted">{tag.taggers_count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
