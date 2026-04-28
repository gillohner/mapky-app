import { useCollectionTags } from "@/lib/api/hooks";
import { createCollectionTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";

interface CollectionTagsProps {
  authorId: string;
  collectionId: string;
}

export function CollectionTags({ authorId, collectionId }: CollectionTagsProps) {
  const { data: tags } = useCollectionTags(authorId, collectionId);
  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "collection", authorId, collectionId, "tags"]}
      buildTag={(publicKey, label) =>
        createCollectionTag(publicKey, authorId, collectionId, label)
      }
      theme="accent"
      inputMode="free"
      title="Tags"
    />
  );
}
