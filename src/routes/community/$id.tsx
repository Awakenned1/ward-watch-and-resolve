import { createFileRoute } from "@tanstack/react-router";
import { CommunityPosts } from "@/components/community-posts";
import { communityHead } from "@/lib/community";
export const Route = createFileRoute("/community/$id")({
  head: () => communityHead("Community post", "A story from the Ward Resolve community."),
  component: PostPage,
});
function PostPage() {
  const { id } = Route.useParams();
  return <CommunityPosts postId={id} />;
}
