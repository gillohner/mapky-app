import { createFileRoute } from "@tanstack/react-router";
import { MyPostsPanel } from "@/components/posts/MyPostsPanel";
import { MobileMenuTrigger } from "@/components/sidebar/MobileMenuTrigger";

export const Route = createFileRoute("/my-posts")({
  component: MyPostsRoute,
});

function MyPostsRoute() {
  return (
    <>
      <MobileMenuTrigger />
      <MyPostsPanel />
    </>
  );
}
