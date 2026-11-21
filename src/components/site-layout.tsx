import { Link, Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Menu, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth, useProfile, useRoles } from "@/hooks/use-auth";
import { WhatsAppChannelLink } from "@/components/whatsapp-channel";
import { db } from "@/lib/db";
import { APP_NAME, COUNCILLOR, PARTY_LOGO, TAGLINE } from "@/lib/ward109";

function NavLinks({ onNavigate, mobile }: { onNavigate?: () => void; mobile?: boolean }) {
  const auth = useAuth();
  const { isStaff, isCouncillor } = useRoles();
  const linkClass = mobile
    ? "rounded-md px-3 py-2.5 text-base font-medium text-white/90 hover:bg-white/10"
    : "rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap text-white/85 transition-colors hover:bg-white/10 hover:text-white";
  const activeProps = { className: "bg-white/15 text-white" };

  return (
    <>
      <Link to="/updates" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
        Updates
      </Link>
      <a href="/#ward-area" className={linkClass} onClick={onNavigate}>
        Ward information
      </a>
      <a href="/#councillor" className={linkClass} onClick={onNavigate}>
        Your councillor
      </a>
      {auth.status === "signed_in" && (
        <Link to="/reports" className={linkClass} activeProps={activeProps} onClick={onNavigate}>
          My complaints
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
  const profile = useProfile();
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

  const name = profile.data?.first_name ?? auth.session.user.email?.split("@")[0] ?? "Account";
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm text-white/80 2xl:inline">Hi, {name}</span>
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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.45)]">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-3 px-4">
          <Link
            to="/"
            className="flex shrink-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            aria-label={`${APP_NAME} home`}
            onClick={() => setOpen(false)}
          >
            {PARTY_LOGO ? (
              <picture>
                <source srcSet={PARTY_LOGO.webp} type="image/webp" />
                <img
                  src={PARTY_LOGO.src}
                  alt={PARTY_LOGO.alt}
                  width={112}
                  height={56}
                  className="h-11 w-auto sm:h-14"
                />
              </picture>
            ) : (
              <span className="font-bold">{APP_NAME}</span>
            )}
          </Link>
          <nav className="ml-4 hidden items-center gap-0.5 xl:ml-6 xl:flex" aria-label="Main">
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
              className="text-white hover:bg-white/10 hover:text-white md:size-11 xl:hidden"
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
            className="flex max-h-[calc(100dvh-72px)] flex-col gap-1 overflow-y-auto border-t border-white/15 px-4 py-3 xl:hidden"
            aria-label="Mobile"
          >
            <Link
              to="/report"
              className="rounded-md bg-teal px-3 py-2.5 text-base font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Report a fault
            </Link>
            <NavLinks mobile onNavigate={() => setOpen(false)} />
          </nav>
        )}
      </header>

      <main className="min-w-0 flex-1">{children}</main>

      <footer className="mt-16 bg-primary-strong text-white/80">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="text-lg font-bold text-white">{APP_NAME}</p>
            <p className="mt-1 text-sm text-teal-200">{TAGLINE}</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70">
              An independent ward-level platform for tracking and escalating municipal service
              issues in Ward 109. It does not submit faults to City systems: please log every fault
              with the responsible municipal entity first.
            </p>
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
                <Link to="/updates" className="hover:text-white">
                  Ward updates
                </Link>
              </li>
              <li>
                <a href="/#help" className="hover:text-white">
                  Help &amp; FAQ
                </a>
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
