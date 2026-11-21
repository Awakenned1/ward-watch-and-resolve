import { createFileRoute } from "@tanstack/react-router";
import { CommunityPosts } from "@/components/community-posts";
export const Route = createFileRoute("/admin/community")({
  component: () => <CommunityPosts moderation />,
});
