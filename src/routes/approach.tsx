import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ShieldCheck, Users } from "lucide-react";

import { CommunityCard, CommunityPage } from "@/components/community-page";
import { communityHead, REPORTING_STEPS } from "@/lib/community";

const description =
  "Log the fault with the City, build a clear record, and follow each update. Everyone follows the same reporting and escalation process.";

export const Route = createFileRoute("/approach")({
  head: () => communityHead("Our approach", description),
  component: ApproachPage,
});

function ApproachPage() {
  return (
    <CommunityPage title="A clear record. A shared commitment." description={description}>
      <ol className="grid gap-5 md:grid-cols-3">
        {REPORTING_STEPS.map((step, index) => (
          <li key={step.title} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <img
              src={step.image}
              alt={step.alt}
              width={800}
              height={500}
              loading="lazy"
              className="aspect-[16/10] w-full object-cover"
            />
            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold tracking-wider text-teal uppercase">
                Step {index + 1}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-5 md:grid-cols-3">
        <CommunityCard icon={Users} title="Equal access to assistance">
          <p>
            Political affiliation is not part of registration or the reporting process. Anyone can
            create an account and register a fault within the current service area.
          </p>
        </CommunityCard>
        <CommunityCard icon={ShieldCheck} title="Private by default">
          <p>
            Personal contact details, addresses and evidence are protected by access rules. Public
            dashboards use aggregate figures to show service delivery trends.
          </p>
        </CommunityCard>
        <CommunityCard icon={CheckCircle2} title="Residents stay involved">
          <p>
            Follow the status of your complaint, request escalation when appropriate, and confirm
            when a reported resolution has fixed the problem.
          </p>
          <Link
            to="/reports"
            className="inline-flex min-h-11 items-center font-medium text-teal hover:underline"
          >
            Open my complaints
          </Link>
        </CommunityCard>
      </div>
      <section className="rounded-xl border bg-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Clear expectations</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          The ward office follows up with the responsible entity and records progress. Repairs
          remain the responsibility of municipal service providers. A reference number helps trace
          the original report; it does not guarantee a repair date.
        </p>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          If a fault is still unresolved, keep its information current and use the escalation option
          on the complaint. For emergencies, use the emergency contacts on the Contact page.
        </p>
        <Link
          to="/contact"
          className="mt-3 inline-flex min-h-11 items-center font-medium text-teal hover:underline"
        >
          Find contact options
        </Link>
      </section>
    </CommunityPage>
  );
}
