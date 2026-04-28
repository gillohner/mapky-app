import { createFileRoute } from "@tanstack/react-router";
import { MyPostsPanel } from "@/components/posts/MyPostsPanel";

export const Route = createFileRoute("/my-posts")({
  component: MyPostsRoute,
});

function MyPostsRoute() {
  return (
    <>
      <MyPostsPanel />
    </>
  );
}
