import { createFileRoute } from "@tanstack/react-router";
import { CommunityPosts } from "@/components/community-posts";
import { communityHead } from "@/lib/community";
export const Route = createFileRoute("/community/")({
  head: () =>
    communityHead("Community", "Stories, ideas and helpful updates from your neighbours."),
  component: CommunityPosts,
});
