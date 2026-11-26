import { Link } from "@tanstack/react-router";
import { ClipboardList, Home, LogIn, Menu, Plus, Users, X } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const tabClass =
  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white";
const activeTab = { className: "text-white" };

// Thumb-reachable primary nav for phones: the same destinations as the header, condensed to
// the 5 most-used actions. Hidden from sm upward, where the header's own nav takes over.
export function MobileTabBar({
  menuOpen,
  onToggleMenu,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
}) {
  // Mirrors the header's own signed-in/signed-out split (see AccountMenu) rather than relying
  // on RequireAuth's redirect, so this tab is never a dead tap while auth is still resolving.
  const auth = useAuth();
  const signedIn = auth.status === "signed_in";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary-strong pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch">
        <Link to="/" className={tabClass} activeProps={activeTab} activeOptions={{ exact: true }}>
          <Home className="size-5" aria-hidden="true" />
          Home
        </Link>

        {auth.status === "loading" ? (
          <span className={cn(tabClass, "opacity-50")} aria-hidden="true">
            <ClipboardList className="size-5" />
            Tickets
          </span>
        ) : signedIn ? (
          <Link to="/reports" className={tabClass} activeProps={activeTab}>
            <ClipboardList className="size-5" aria-hidden="true" />
            Tickets
          </Link>
        ) : (
          <Link to="/auth" className={tabClass} activeProps={activeTab}>
            <LogIn className="size-5" aria-hidden="true" />
            Sign in
          </Link>
        )}

        {/* Report a fault: the primary action, raised above the bar so it reads as a FAB. */}
        <Link
          to="/report"
          className="relative flex flex-1 flex-col items-center justify-end pb-1.5 text-[11px] font-medium text-white"
        >
          <span
            className="absolute -top-5 grid size-12 place-items-center rounded-full bg-teal text-teal-foreground shadow-lg shadow-black/40 ring-4 ring-primary-strong"
            aria-hidden="true"
          >
            <Plus className="size-6" />
          </span>
          <span className="mt-7">Report</span>
        </Link>

        <Link to="/community" className={tabClass} activeProps={activeTab}>
          <Users className="size-5" aria-hidden="true" />
          Community
        </Link>

        <button
          type="button"
          onClick={onToggleMenu}
          className={cn(tabClass, menuOpen && activeTab.className)}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
          Menu
        </button>
      </div>
    </nav>
  );
}
