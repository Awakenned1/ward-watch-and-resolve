import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BatteryFull,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Hourglass,
  MapPin,
  Search,
  Signal,
  Smartphone,
  Wifi,
} from "lucide-react";

import heroImage from "@/assets/ward109-neighbourhood.jpg";
import heroTicketShot from "@/assets/journey/08-track.webp";
import { HowItWorks } from "@/components/how-it-works";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { WardMap } from "@/components/ward-map";
import { WhatsAppChannelLink, WhatsAppIcon } from "@/components/whatsapp-channel";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  APP_NAME,
  CITY_ENTITIES,
  COJ_APP_LINKS,
  COUNCILLOR,
  TAGLINE,
  WARD_BOUNDARY,
  WARD_NUMBER,
  WARD_SUBURBS,
  WHATSAPP_CHANNEL,
} from "@/lib/ward109";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} · ${TAGLINE}` },
      {
        name: "description",
        content:
          "Municipal fault reporting for every resident, regardless of political affiliation. Currently serving Ward 109, Johannesburg.",
      },
    ],
  }),
  component: Index,
});

const FAQ = [
  {
    q: "Can I use this platform if I do not support a particular political party?",
    a: "Yes. Ward Resolve is open to every resident, regardless of political affiliation. You do not need party membership to create an account, register a fault or request help. Fault handling is currently configured for Ward 109, Johannesburg.",
  },
  {
    q: "Does this website log my fault with the City?",
    a: "No. Ward Resolve is a community fault-reporting platform, not a City of Johannesburg website. Always log the fault with the responsible municipal entity first (see the reporting channels above), then register it here with the reference number they give you.",
  },
  {
    q: "Why do I need a municipal reference number?",
    a: "The reference number is the City's own record of your fault. Without it the ward office cannot trace, follow up or escalate the issue. Never make one up: if you don't have one yet, save your complaint as a draft and add the number later.",
  },
  {
    q: "When can I ask for the councillor to step in?",
    a: "Once your complaint is registered and the fault is still unresolved, open it under My complaints and choose “Request escalation”. Urgent safety risks, such as exposed cables or an open manhole, can be flagged for urgent review.",
  },
  {
    q: "Who can see my details and photos?",
    a: "Only you and authorised Ward 109 office staff. Photos are stored privately and their location data is removed before upload. Public statistics are anonymised and never show names, contact details or addresses.",
  },
  {
    q: "My street is on the edge of the ward. Can I still report?",
    a: "Yes. Some suburbs are only partly in Ward 109. Pin the fault on the map when you report it and the system will check it against the official ward boundary.",
  },
  {
    q: "What about emergencies?",
    a: "This platform is not monitored 24/7. For emergencies or crimes in progress call 10111 (SAPS) or 112 from a mobile phone.",
  },
];

type PublicStats = {
  min_aggregate: number;
  total: number | null;
  in_progress: number | null;
  escalated: number | null;
  resolved: number | null;
};

function usePublicStats() {
  return useQuery({
    queryKey: ["public-stats", WARD_NUMBER],
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("public_ward_stats", { _ward_number: WARD_NUMBER });
      if (error) throw error;
      return data as unknown as PublicStats | null;
    },
  });
}

function Index() {
  const auth = useAuth();
  const stats = usePublicStats();
  const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-ZA"));

  return (
    <>
      <section className="relative isolate overflow-hidden bg-primary">
        <img
          src={heroImage}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover opacity-50 lg:opacity-30"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-primary via-primary/85 to-primary/45 sm:bg-gradient-to-r sm:from-primary sm:via-primary/90 sm:to-primary/50" />
        <div
          className="pointer-events-none absolute -top-32 -left-24 -z-10 size-96 rounded-full bg-teal/30 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/4 -right-24 -z-10 hidden size-96 rounded-full bg-teal/20 blur-3xl lg:block"
          aria-hidden="true"
        />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 text-white sm:pt-24 sm:pb-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium text-teal-100 backdrop-blur">
              <MapPin className="size-3.5" /> Ward {WARD_NUMBER} · Johannesburg
            </p>
            {/* One heading only: the badge above and the links below stay plain text/chips so
                this h1 is the single visual anchor of the hero. */}
            <h1 className="mt-5 text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              Report it.
              <br />
              Track it.
              <br />
              <span className="text-teal-300">Get it fixed.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-white/80">
              Potholes, outages and leaks, followed until they're resolved.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:flex">
              <Button
                asChild
                size="lg"
                className="h-12 bg-teal px-6 text-base shadow-lg shadow-teal/30 hover:bg-teal/90"
              >
                <Link to="/report">
                  Report an issue <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/40 bg-white/10 px-6 text-base text-white hover:bg-white/20 hover:text-white"
              >
                <Link to={auth.status === "signed_in" ? "/reports" : "/auth"}>
                  <Search className="size-4" /> Track a ticket
                </Link>
              </Button>
            </div>

            {/* Secondary row, deliberately quieter than the buttons above: the WhatsApp channel
                is a "join the community" chip (brand colour kept only on the icon, matching the
                Ward/Johannesburg badges' pill style), not a third call to action. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              {WHATSAPP_CHANNEL && (
                <a
                  href={WHATSAPP_CHANNEL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <WhatsAppIcon className="size-4 text-[#25D366]" /> Follow on WhatsApp
                  <ExternalLink className="size-3 opacity-60" aria-hidden="true" />
                </a>
              )}
              <p className="flex items-center gap-1.5 text-sm text-white/70">
                <CheckCircle2 className="size-4 text-teal-300" /> Free and open to every resident
              </p>
            </div>

            {/* Quick links: plain text, quieter again than the chips above, for visitors who
                want somewhere else on the page rather than one of the two main actions. */}
            <nav
              aria-label="Quick links"
              className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/60"
            >
              <Link to="/services" className="underline-offset-4 hover:text-white hover:underline">
                Services
              </Link>
              <span aria-hidden="true">·</span>
              <a
                href="/#municipal-contacts"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                City reporting channels
              </a>
              <span aria-hidden="true">·</span>
              <a href="/#help" className="underline-offset-4 hover:text-white hover:underline">
                FAQ
              </a>
            </nav>
          </div>

          {/* Product shot: a phone mockup of a real ticket screen, with two floating
              callouts. Decorative on mobile (where it sits below the fold-worthy CTAs). */}
          <div className="relative mx-auto hidden w-full max-w-[230px] sm:block lg:mx-0 lg:max-w-[280px]">
            <div
              className="absolute inset-0 -z-10 translate-y-6 scale-90 rounded-[3rem] bg-teal/25 blur-2xl"
              aria-hidden="true"
            />

            <div className="absolute -top-4 -right-3 z-10 flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-300 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-teal-300" />
              </span>
              Live status updates
            </div>

            <div className="overflow-hidden rounded-[2.4rem] border-[10px] border-slate-950 bg-slate-950 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.65)]">
              <div
                className="relative flex h-6 items-center justify-between bg-primary px-5 text-[9px] font-semibold text-primary-foreground"
                aria-hidden="true"
              >
                <span>9:41</span>
                <span className="absolute top-1 left-1/2 h-3.5 w-14 -translate-x-1/2 rounded-full bg-slate-950" />
                <span className="flex items-center gap-1">
                  <Signal className="size-2.5" />
                  <Wifi className="size-2.5" />
                  <BatteryFull className="size-3" />
                </span>
              </div>
              <div className="aspect-[390/780] w-full overflow-hidden bg-background">
                <img
                  src={heroTicketShot}
                  alt="Ward Resolve ticket page showing a tracking number, status and progress"
                  width={780}
                  height={1560}
                  className="w-full object-cover object-top"
                  fetchPriority="high"
                />
              </div>
              <div className="flex h-7 items-center justify-center bg-slate-950" aria-hidden="true">
                <span className="h-1 w-24 rounded-full bg-white/30" />
              </div>
            </div>

            <div className="absolute -bottom-4 -left-4 z-10 flex max-w-[170px] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-xl sm:-left-6">
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
              Tracked until resolved
            </div>
          </div>
        </div>
      </section>

      <section
        id="ward-dashboard"
        className="relative z-10 mx-auto -mt-12 max-w-6xl scroll-mt-24 px-4 sm:-mt-16"
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {(
            [
              {
                label: "Total complaints",
                value: fmt(stats.data?.total),
                icon: ClipboardList,
                bar: "bg-primary",
                badge: "bg-secondary text-primary",
              },
              {
                label: "In progress",
                value: fmt(stats.data?.in_progress),
                icon: Hourglass,
                bar: "bg-teal",
                badge: "bg-accent text-accent-foreground",
              },
              {
                label: "Escalated",
                value: fmt(stats.data?.escalated),
                icon: AlertTriangle,
                bar: "bg-amber-400",
                badge: "bg-amber-50 text-amber-700",
              },
              {
                label: "Resolved",
                value: fmt(stats.data?.resolved),
                icon: CheckCircle2,
                bar: "bg-emerald-500",
                badge: "bg-emerald-50 text-emerald-700",
              },
            ] as const
          ).map((t) => (
            <div
              key={t.label}
              className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-xl shadow-primary/5 transition-transform hover:-translate-y-1 sm:p-6"
            >
              <span className={cn("absolute inset-x-0 top-0 h-1.5", t.bar)} aria-hidden="true" />
              <span
                className={cn("grid size-10 place-items-center rounded-xl sm:size-12", t.badge)}
              >
                <t.icon className="size-5 sm:size-6" />
              </span>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-foreground tabular-nums sm:text-4xl">
                {t.value}
              </p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{t.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground sm:mt-6">
          Aggregated ward statistics. To protect residents' privacy, figures below{" "}
          {stats.data?.min_aggregate ?? 5} are not shown, and no personal details are ever
          published.
        </p>
      </section>

      <HowItWorks />

      <section id="ward-area" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-6 pb-16">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="relative">
            <WardMap className="h-[360px] shadow-md sm:h-[460px]" />
            <div className="pointer-events-none absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-semibold text-foreground shadow-lg backdrop-blur">
              <span className="size-2 rounded-full bg-teal" aria-hidden="true" /> Official boundary
              · {WARD_BOUNDARY.effectiveDate}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wider text-teal uppercase">Service area</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
              <MapPin className="size-6 text-primary" /> The Ward 109 area
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The shaded area above is the official ward boundary, sourced from{" "}
              {WARD_BOUNDARY.source}.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {WARD_SUBURBS.map((s) => (
                <li
                  key={s.name}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  <span className="size-1.5 rounded-full bg-teal" aria-hidden="true" />
                  {s.name}
                  {s.partial && <span className="text-muted-foreground">(part)</span>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Suburbs marked “part” are only partly in Ward 109. Pin your fault on the map when you
              report it so the ward office can confirm it is inside the ward.
            </p>
          </div>
        </div>
      </section>

      <section id="municipal-contacts" className="scroll-mt-24 border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal text-sm font-bold text-teal-foreground">
              1
            </span>
            <p className="text-xs font-semibold tracking-wider text-teal uppercase">
              Before you report here
            </p>
          </div>
          <h2 className="mt-3 text-2xl font-bold sm:text-3xl">
            Log your issue with the City first
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Faults must be logged with the responsible municipal entity first. Faults not logged
            first cannot be tracked or resolved. Keep your reference number.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.values(CITY_ENTITIES).map((entity) => (
              <li key={entity.name}>
                <a
                  href={entity.href}
                  target={entity.href.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="group relative flex h-full flex-col rounded-2xl border bg-background p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-teal hover:shadow-lg"
                >
                  <ArrowUpRight
                    className="absolute top-4 right-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                  <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-teal group-hover:text-teal-foreground">
                    <entity.icon className="size-5" />
                  </span>
                  <span className="mt-4 font-semibold">{entity.name}</span>
                  <span className="mt-0.5 text-sm text-muted-foreground">{entity.handles}</span>
                  <span className="mt-4 text-sm font-medium break-all text-teal">
                    {entity.contact}
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border bg-background p-5 sm:flex-row sm:items-center">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              <Smartphone className="size-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">CoJ Central App</p>
              <p className="text-sm text-muted-foreground">
                Log and track everything in one place.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={COJ_APP_LINKS.android} target="_blank" rel="noreferrer">
                  Android
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={COJ_APP_LINKS.iphone} target="_blank" rel="noreferrer">
                  iPhone
                </a>
              </Button>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Contact details are pending verification by the ward office. Emergencies: call 10111 or
            112.
          </p>
        </div>
      </section>

      <section id="councillor" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16">
        <div className="relative grid items-center gap-8 overflow-hidden rounded-[2rem] bg-primary px-6 py-10 text-primary-foreground sm:px-12 sm:py-12 md:grid-cols-[1fr_auto]">
          <div
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-teal/25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-16 size-64 rounded-full bg-teal/15 blur-3xl"
            aria-hidden
          />
          <div className="relative">
            <p className="text-xs font-semibold tracking-wider text-teal-200 uppercase">
              Your ward councillor
            </p>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Get help from your ward office.</h2>
            <p className="mt-3 max-w-xl text-white/80">
              Have your City reference number and the date and time you logged it ready. A picture
              helps if the fault is visible.
            </p>
            <p className="mt-3 max-w-xl text-white/80">
              Every resident can request help, regardless of political affiliation.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary" className="h-12 px-6">
                <Link to="/report">Escalate a fault</Link>
              </Button>
              <WhatsAppChannelLink tone="onDark" />
            </div>
            <p className="mt-8 text-sm text-white/80">
              <span className="font-semibold text-white">{COUNCILLOR.name}</span>
              <br />
              {COUNCILLOR.title}
            </p>
          </div>
          <figure className="relative order-first mx-auto md:order-none">
            {COUNCILLOR.photo && (
              <img
                src={COUNCILLOR.photo}
                alt={`${COUNCILLOR.name}, Ward 109 Councillor`}
                width={240}
                height={240}
                loading="lazy"
                decoding="async"
                className="size-40 rounded-full border-4 border-white/80 object-cover shadow-xl sm:size-52"
              />
            )}
            <figcaption className="mt-3 text-center text-sm font-medium">
              Cllr {COUNCILLOR.name}
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-6">
        <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5 shadow-sm">
          <AccordionItem value="role" className="border-b-0">
            <AccordionTrigger className="text-base font-semibold">
              What does a ward councillor do?
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                A ward councillor is elected to represent the residents of a ward on the City of
                Johannesburg council. The councillor does not fix faults directly. Municipal
                entities such as Johannesburg Water, City Power, the JRA and Pikitup do that work.
              </p>
              <p>
                What the councillor can do is follow up unresolved issues with those entities,
                escalate service delivery failures, hold the City accountable in council, and keep
                residents informed about what is happening in the ward.
              </p>
              <p>
                That is why your official reference number matters: it lets the ward office trace
                exactly what was reported and when.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section id="help" className="mx-auto max-w-3xl scroll-mt-24 px-4 pt-16">
        <p className="text-center text-xs font-semibold tracking-wider text-teal uppercase">Help</p>
        <h2 className="mt-1 text-center text-2xl font-bold sm:text-3xl">
          Frequently asked questions
        </h2>
        <Accordion
          type="single"
          collapsible
          className="mt-8 rounded-2xl border bg-card px-5 shadow-sm"
        >
          {FAQ.map((item, i) => (
            <AccordionItem
              key={item.q}
              value={`faq-${i}`}
              className={i === FAQ.length - 1 ? "border-b-0" : undefined}
            >
              <AccordionTrigger className="text-left font-semibold">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </>
  );
}
