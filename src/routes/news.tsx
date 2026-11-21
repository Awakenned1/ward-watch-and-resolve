import { createFileRoute } from "@tanstack/react-router";
import { NewsFeed } from "@/components/news-feed";
import { communityHead } from "@/lib/community";
export const Route = createFileRoute("/news")({
  head: () =>
    communityHead("News", "Ward office notices and neighbourhood news from local publishers."),
  component: NewsFeed,
});
