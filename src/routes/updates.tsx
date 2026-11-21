import { createFileRoute, redirect } from "@tanstack/react-router";

// Keep shared links working while news and notices use a single public feed.
export const Route = createFileRoute("/updates")({
  beforeLoad: () => {
    throw redirect({ to: "/news", replace: true });
  },
});
