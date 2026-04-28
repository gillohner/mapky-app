import { usePostTags } from "@/lib/api/hooks";
import { createPostTag } from "@/lib/mapky-specs";
import { TagStrip } from "@/components/shared/TagStrip";

interface PostTagsProps {
  authorId: string;
  postId: string;
}

export function PostTags({ authorId, postId }: PostTagsProps) {
  const { data: tags } = usePostTags(authorId, postId);
  return (
    <TagStrip
      tags={tags}
      queryKey={["mapky", "posts", authorId, postId, "tags"]}
      buildTag={(publicKey, label) =>
        createPostTag(publicKey, authorId, postId, label)
      }
      theme="accent"
      inputMode="free"
    />
  );
}
