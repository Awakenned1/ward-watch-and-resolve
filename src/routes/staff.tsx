import { createFileRoute, redirect } from "@tanstack/react-router";

// The ward administration screens moved to /admin; keep old links working.
export const Route = createFileRoute("/staff")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/complaints", replace: true });
  },
});
