import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Hourglass,
  MapPin,
  Search,
  Smartphone,
} from "lucide-react";

import heroImage from "@/assets/ward109-neighbourhood.jpg";
import { REPORTING_STEPS as STEPS } from "@/lib/community";
import { StatCard } from "@/components/app-ui";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { WardMap } from "@/components/ward-map";
import { WhatsAppChannelLink } from "@/components/whatsapp-channel";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/db";
import {
  APP_NAME,
  ACCESS_STATEMENT,
  CITY_ENTITIES,
  COJ_APP_LINKS,
  COUNCILLOR,
  TAGLINE,
  WARD_BOUNDARY,
  WARD_NUMBER,
  WARD_SUBURBS,
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
          className="absolute inset-0 -z-10 size-full object-cover opacity-35"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary via-primary/90 to-primary/40" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-white sm:py-28">
          <p className="text-sm font-semibold tracking-[0.2em] text-teal-200 uppercase">
            {APP_NAME}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl leading-[1.1] font-extrabold sm:text-6xl">
            {TAGLINE}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80">
            Report, track and escalate municipal service delivery issues in Ward 109, Johannesburg.
          </p>
          <p className="mt-4 max-w-xl text-base font-medium text-teal-200">{ACCESS_STATEMENT}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild size="lg" className="h-12 bg-teal px-6 text-base hover:bg-teal/90">
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
                <Search className="size-4" /> Track my complaint
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="h-12 px-6 text-base text-white hover:bg-white/10 hover:text-white"
            >
              <a href="#ward-dashboard">
                <BarChart3 className="size-4" /> View ward dashboard
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section
        id="ward-dashboard"
        className="relative z-10 mx-auto -mt-10 max-w-6xl scroll-mt-24 px-4"
      >
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Total complaints" value={fmt(stats.data?.total)} icon={ClipboardList} />
          <StatCard
            label="In progress"
            value={fmt(stats.data?.in_progress)}
            icon={Hourglass}
            tone="teal"
          />
          <StatCard
            label="Escalated"
            value={fmt(stats.data?.escalated)}
            icon={AlertTriangle}
            tone="amber"
          />
          <StatCard
            label="Resolved"
            value={fmt(stats.data?.resolved)}
            icon={CheckCircle2}
            tone="green"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Aggregated ward statistics. To protect residents' privacy, figures below{" "}
          {stats.data?.min_aggregate ?? 5} are not shown, and no personal details are ever
          published.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14">
        <p className="text-xs font-semibold tracking-wider text-teal uppercase">How it works</p>
        <h2 className="mt-1 text-2xl font-bold sm:text-3xl">From fault to resolution</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="relative aspect-[16/10] bg-muted">
                <img
                  src={step.image}
                  alt={step.alt}
                  width={800}
                  height={500}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
                <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow">
                  <step.icon className="size-3.5" />
                  Step {i + 1}
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="ward-area" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-16">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <WardMap className="h-[360px] shadow-sm sm:h-[440px]" />
          <div>
            <p className="text-xs font-semibold tracking-wider text-teal uppercase">Service area</p>
            <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              <MapPin className="size-6 text-primary" /> The Ward 109 area
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The shaded area is the official Ward 109 boundary ({WARD_BOUNDARY.source}, effective{" "}
              {WARD_BOUNDARY.effectiveDate}).
            </p>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm lg:grid-cols-1">
              {WARD_SUBURBS.map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-teal" />
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
        <div className="mx-auto max-w-6xl px-4 py-16">
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">Step 1</p>
          <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Log your issue with the City</h2>
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
                  className="group flex h-full flex-col rounded-xl border bg-background p-5 transition-all hover:-translate-y-0.5 hover:border-teal hover:bg-card hover:shadow-md"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-accent group-hover:text-teal">
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

          <div className="mt-6 flex flex-col gap-4 rounded-xl border bg-background p-5 sm:flex-row sm:items-center">
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
        <div className="relative grid items-center gap-8 overflow-hidden rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-12 sm:py-12 md:grid-cols-[1fr_auto]">
          <div
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-teal/25 blur-3xl"
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
        <Accordion type="single" collapsible className="rounded-xl border bg-card px-5 shadow-sm">
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
          className="mt-8 rounded-xl border bg-card px-5 shadow-sm"
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
