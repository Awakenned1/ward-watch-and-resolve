import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it.each([
    ["/auth", "/auth"],
    ["/report", "/report"],
    ["/reports", "/reports/"],
    ["/reports/3f1c2a7e-0000-4000-8000-000000000000", "/reports/$id"],
    ["/staff", "/staff"],
    ["/admin", "/admin/"],
    ["/admin/complaints", "/admin/complaints"],
    ["/admin/map", "/admin/map"],
    ["/admin/updates", "/admin/updates"],
    ["/admin/residents", "/admin/residents"],
    ["/admin/team", "/admin/team"],
    ["/updates", "/updates"],
    ["/privacy", "/privacy"],
    ["/reset-password", "/reset-password"],
  ])("matches %s to the %s route", (path, routeId) => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    expect(router.matchRoutes(path).at(-1)?.routeId).toBe(routeId);
  });
});
