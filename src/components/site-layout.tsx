import { Link, Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2, LogOut, MapPin, Menu, Plus, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { WhatsAppChannelLink } from "@/components/whatsapp-channel";
import { db } from "@/lib/db";
import { ACCESS_STATEMENT, APP_NAME, COUNCILLOR, TAGLINE, WARD_NUMBER } from "@/lib/ward109";
import { COMMUNITY_PAGES } from "@/lib/community";
import { useUnreadNotifications } from "@/hooks/use-notifications";
import { useInstallState } from "@/hooks/use-install-state";

// "Charlene Olivia McCord" → "Charlene McCord" for the compact header label.
const councillorShortName = [COUNCILLOR.name.split(" ")[0], COUNCILLOR.name.split(" ").at(-1)].join(
  " ",
);

function NavLinks({ onNavigate, mobile }: { onNavigate?: () => void; mobile?: boolean }) {
  const auth = useAuth();
  const { isStaff, isCouncillor } = useRoles();
  const linkClass = mobile
    ? "rounded-md px-3 py-2.5 text-base font-medium text-white/90 hover:bg-white/10"
    : "rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap text-white/85 transition-colors hover:bg-white/10 hover:text-white";
  const activeProps = { className: "bg-white/15 text-white" };

  return (
    <>
      <Link
        to="/"
        className={linkClass}
        activeProps={activeProps}
        activeOptions={{ exact: true }}
        onClick={onNavigate}
      >
        Home
      </Link>
      {(mobile ? COMMUNITY_PAGES : COMMUNITY_PAGES.filter((page) => page.to === "/services")).map(
        (page) => (
          <Link
            key={page.to}
            to={page.to}
            className={linkClass}
            activeProps={activeProps}
            onClick={onNavigate}
          >
            {page.label}
          </Link>
        ),
      )}
      <Link to="/community" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
        Community
      </Link>
      <Link to="/news" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
        News
      </Link>
      {auth.status === "signed_in" && (
        <Link to="/reports" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
          My tickets
        </Link>
      )}
      {isStaff && (
        <Link to="/admin" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
          {isCouncillor ? "Councillor dashboard" : "Ward management"}
        </Link>
      )}
    </>
  );
}

function AccountMenu() {
  const auth = useAuth();
  const unread = useUnreadNotifications();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (auth.status === "loading") return <span className="h-9 w-20" aria-hidden />;
  if (auth.status === "signed_out") {
    return (
      <Button
        asChild
        size="sm"
        variant="outline"
        className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
      >
        <Link to="/auth">Sign in</Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="relative text-white hover:bg-white/10 hover:text-white"
      >
        <Link
          to="/notifications"
          aria-label={`Notifications${unread.data ? `, ${unread.data} unread` : ""}`}
        >
          <Bell className="size-5" />
          {!!unread.data && (
            <span className="absolute top-0 right-0 min-w-4 rounded-full bg-teal px-1 text-center text-[10px] font-bold text-white">
              {unread.data > 99 ? "99+" : unread.data}
            </span>
          )}
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-white/90 hover:bg-white/10 hover:text-white"
        aria-label="Sign out"
        onClick={async () => {
          await db.auth.signOut();
          queryClient.clear();
          navigate({ to: "/" });
        }}
      >
        <LogOut className="size-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const install = useInstallState();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)]">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:gap-3"
            aria-label={`Councillor ${COUNCILLOR.name}, Ward ${WARD_NUMBER} Johannesburg: home`}
            title={`Councillor ${COUNCILLOR.name}`}
            onClick={() => setOpen(false)}
          >
            {COUNCILLOR.photo ? (
              <img
                src={COUNCILLOR.photo}
                alt=""
                width={40}
                height={40}
                className="size-9 shrink-0 rounded-full object-cover ring-2 ring-teal sm:size-11"
              />
            ) : (
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal text-white sm:size-11"
                aria-hidden="true"
              >
                <MapPin className="size-5 sm:size-6" />
              </span>
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold tracking-tight sm:text-base">
                Cllr {councillorShortName}
              </span>
              <span className="block truncate text-[11px] font-semibold tracking-wide text-teal-200 sm:text-xs">
                Ward {WARD_NUMBER}
                <span className="hidden sm:inline"> · Johannesburg</span>
              </span>
            </span>
          </Link>
          <nav className="ml-2 hidden items-center gap-0.5 xl:flex 2xl:ml-4" aria-label="Main">
            <NavLinks />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button
              asChild
              size="sm"
              className="hidden bg-teal text-teal-foreground shadow-none hover:bg-teal/90 sm:inline-flex"
            >
              <Link to="/report">
                <Plus className="size-4" /> Report a fault
              </Link>
            </Button>
            <AccountMenu />
            <Button
              variant="ghost"
              size="icon"
              ref={menuButton}
              className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex md:size-11 xl:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-navigation"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </Button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-navigation"
            className="flex max-h-[calc(100dvh-72px-64px)] flex-col gap-1 overflow-y-auto border-t border-white/15 px-4 py-3 sm:max-h-[calc(100dvh-72px)] xl:hidden"
            aria-label="Mobile"
          >
            <Link
              to="/report"
              className="rounded-md bg-teal px-3 py-2.5 text-base font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Report a fault
            </Link>
            {!install.installed && (
              <Link
                to="/app"
                className="flex items-center gap-2 rounded-md border border-white/25 px-3 py-2.5 text-base font-medium text-white hover:bg-white/10"
                activeProps={{ className: "bg-white/15" }}
                onClick={() => setOpen(false)}
              >
                <Smartphone className="size-4" aria-hidden="true" /> Get the app
              </Link>
            )}
            <NavLinks mobile onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </header>

      <main className="min-w-0 flex-1">{children}</main>

      <footer className="mt-16 bg-primary-strong text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-white">{APP_NAME}</p>
            <p className="mt-1 text-sm text-teal-200">{TAGLINE}</p>
            <p className="mt-4 text-sm font-medium text-white">{ACCESS_STATEMENT}</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
              An independent ward-level platform for tracking and escalating municipal service
              issues in Ward 109. It does not submit faults to City systems: please log every fault
              with the responsible municipal entity first.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Explore</p>
            <ul className="mt-3 space-y-2 text-sm">
              {COMMUNITY_PAGES.map((page) => (
                <li key={page.to}>
                  <Link to={page.to} className="hover:text-white">
                    {page.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/community" className="hover:text-white">
                  Community channel
                </Link>
              </li>
              <li>
                <Link to="/news" className="hover:text-white">
                  Neighbourhood news
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Residents</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to="/report" className="hover:text-white">
                  Report an issue
                </Link>
              </li>
              <li>
                <Link to="/reports" className="hover:text-white">
                  Track my complaints
                </Link>
              </li>
              <li>
                <a href="/#municipal-contacts" className="hover:text-white">
                  City reporting channels
                </a>
              </li>
              <li>
                <Link to="/notifications" className="hover:text-white">
                  Notifications & replies
                </Link>
              </li>
              <li>
                <a href="/#help" className="hover:text-white">
                  Help &amp; FAQ
                </a>
              </li>
              <li>
                <Link to="/app" className="hover:text-white">
                  Get the mobile app
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-white">
                  Privacy notice
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Ward office</p>
            <p className="mt-3 text-sm">{COUNCILLOR.name}</p>
            <p className="text-sm text-white/70">{COUNCILLOR.title}</p>
            <WhatsAppChannelLink tone="text" className="mt-3 text-sm text-teal-200" />
            <p className="mt-3 text-xs text-white/60">
              Emergencies: call 10111 (police) or 112 from a mobile phone.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-white/50">
            © {new Date().getFullYear()} {APP_NAME}. Not a City of Johannesburg website. Ward
            boundary © Municipal Demarcation Board · Map data © OpenStreetMap contributors.
          </p>
        </div>
      </footer>

      <MobileTabBar menuOpen={open} onToggleMenu={() => setOpen((v) => !v)} />
    </div>
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex justify-center py-24" role="status" aria-label={label}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// Route visibility is a convenience; the database rules protect the data itself.
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") return <PageLoader />;
  if (auth.status === "signed_out") {
    return <Navigate to="/auth" search={{ redirect: location.href }} replace />;
  }
  return <>{children}</>;
}
