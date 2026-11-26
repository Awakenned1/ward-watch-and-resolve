import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import { Notice } from "@/components/app-ui";
import { CommunityPage } from "@/components/community-page";
import { Button } from "@/components/ui/button";
import { communityHead } from "@/lib/community";
import { CITY_ENTITIES } from "@/lib/ward109";

const description =
  "Find the municipal service responsible for a fault, log it with the City, then register it here for tracking and follow-up.";

export const Route = createFileRoute("/services")({
  head: () => communityHead("Services", description),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <CommunityPage title="Services we help you track" description={description}>
      <Notice title="Start with the responsible municipal entity">
        Keep the official reference number and the date you logged the fault. You will need them
        when you register the issue here.
      </Notice>
      <Notice tone="warning" title="Emergency: fallen trees">
        <p>
          Please note that all service requests relating to emergency fallen trees/branches should
          be logged with the City of Johannesburg's call centre on{" "}
          <a
            href="tel:+27113755555"
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            (011) 375 5555
          </a>{" "}
          /{" "}
          <a
            href="tel:+27860562874"
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            0860 56 2874
          </a>
          , via the CSD app (available on the Apple App Store or Google Play Store), or by e-mail to{" "}
          <a
            href="mailto:joburgconnect@joburg.org.za"
            className="inline-flex min-h-11 items-center font-semibold break-all underline"
          >
            joburgconnect@joburg.org.za
          </a>
          .
        </p>
      </Notice>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(CITY_ENTITIES).map(([slug, entity]) => (
          <section
            key={slug}
            className="flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-accent text-teal">
              <entity.icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{entity.name}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
              {entity.handles}
            </p>
            <a
              href={entity.href}
              target={entity.href.startsWith("http") ? "_blank" : undefined}
              rel={entity.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="mt-4 flex min-h-11 items-center gap-2 text-sm font-medium text-teal [overflow-wrap:anywhere] hover:underline"
            >
              <span className="min-w-0">{entity.contact}</span>
              {entity.href.startsWith("http") && (
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              {entity.href.startsWith("http") && <span className="sr-only">(opens a new tab)</span>}
            </a>
          </section>
        ))}
      </div>
      <section className="rounded-xl border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Already have your City reference?</h2>
        <p className="mt-2 text-muted-foreground">
          Register the fault to keep your details, evidence and progress together. You can save an
          incomplete report as a draft.
        </p>
        <Button asChild className="mt-5">
          <Link to="/report">Register your fault</Link>
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          Directory contact details are pending verification by the ward office.
        </p>
      </section>
    </CommunityPage>
  );
}
