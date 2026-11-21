import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  ClipboardList,
  LayoutDashboard,
  Map as MapIcon,
  Megaphone,
  ShieldAlert,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app-ui";
import { PageLoader, RequireAuth } from "@/components/site-layout";
import { useProfile, useRoles } from "@/hooks/use-auth";
import { APP_NAME, COUNCILLOR } from "@/lib/ward109";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: `Ward management · ${APP_NAME}` }] }),
  component: () => (
    <RequireAuth>
      <AdminGate />
    </RequireAuth>
  ),
});

type NavItem = {
  to:
    | "/admin"
    | "/admin/complaints"
    | "/admin/map"
    | "/admin/updates"
    | "/admin/community"
    | "/admin/residents"
    | "/admin/team";
  label: string;
  icon: LucideIcon;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/complaints", label: "Complaints", icon: ClipboardList },
  { to: "/admin/map", label: "Ward map", icon: MapIcon },
  { to: "/admin/updates", label: "News & updates", icon: Megaphone },
  { to: "/admin/community", label: "Community posts", icon: Users },
  { to: "/admin/residents", label: "Residents", icon: Users },
  { to: "/admin/team", label: "Team & access", icon: UserCog },
];

// Route visibility is a convenience: every read and write is checked by the database rules.
function AdminGate() {
  const { isStaff, isLoading } = useRoles();
  if (isLoading) return <PageLoader />;
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={ShieldAlert}
          title="Ward office staff only"
          description="This area is for the Ward 109 Councillor and verified ward administrators."
        />
      </div>
    );
  }
  return <AdminShell />;
}

function AdminShell() {
  const { isCouncillor, isSuperAdmin } = useRoles();
  const profile = useProfile();
  const name = profile.data?.full_name ?? profile.data?.first_name;
  const roleLabel = isCouncillor
    ? "Ward Councillor"
    : isSuperAdmin
      ? "System administrator"
      : "Ward administrator";

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <aside className="lg:sticky lg:top-[96px] lg:self-start">
        <div className="hidden items-center gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex">
          {isCouncillor && COUNCILLOR.photo ? (
            <img
              src={COUNCILLOR.photo}
              alt=""
              width={44}
              height={44}
              className="size-11 rounded-full object-cover ring-2 ring-teal/30"
            />
          ) : (
            <span className="grid size-11 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">
              {(name ?? "W").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isCouncillor ? COUNCILLOR.name : (name ?? "Ward office")}
            </p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
        </div>

        <nav
          aria-label="Ward management"
          className="grid grid-cols-2 gap-1 border-b pb-3 sm:grid-cols-3 lg:mt-4 lg:grid-cols-1 lg:border-b-0 lg:pb-0"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/admin" }}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{
                className: "bg-primary text-primary-foreground hover:bg-primary hover:text-white",
              }}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 pt-6 lg:pt-0">
        <Outlet />
      </div>
    </div>
  );
}
