import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ShieldCheck, Users } from "lucide-react";

import neighbourhood from "@/assets/ward109-neighbourhood.jpg";
import { CommunityCard, CommunityPage } from "@/components/community-page";
import { Button } from "@/components/ui/button";
import { communityHead } from "@/lib/community";
import { APP_NAME } from "@/lib/ward109";

const description =
  "A community platform that helps residents record municipal faults, follow their progress and ask the ward office for help, regardless of political affiliation.";

export const Route = createFileRoute("/company")({
  head: () => communityHead("About", description),
  component: AboutPage,
});

function AboutPage() {
  return (
    <CommunityPage title={`About ${APP_NAME}`} description={description}>
      <section className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">Our purpose</p>
          <h2 className="mt-2 text-2xl font-bold">
            A clearer path from a reported fault to a follow-up
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            A broken streetlight, water leak or missed collection affects the whole neighbourhood.
            Everyone should be able to record the problem and see what happens next.
          </p>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            {APP_NAME} brings your municipal reference number, fault details, evidence and progress
            into one private record. The ward office can use that record to follow up unresolved
            issues with the responsible municipal entity.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/approach">See how it works</Link>
          </Button>
        </div>
        <img
          src={neighbourhood}
          alt="A residential street lined with jacaranda trees"
          width={1600}
          height={960}
          className="aspect-[4/3] w-full rounded-2xl object-cover"
        />
      </section>
      <div className="grid gap-5 md:grid-cols-3">
        <CommunityCard icon={Users} title="Every resident is welcome">
          <p>
            Access to registration and assistance does not depend on your political views, voting
            history or party membership. Those details are not requested when you register.
          </p>
        </CommunityCard>
        <CommunityCard icon={ShieldCheck} title="Personal reports stay private">
          <p>
            Your contact details, address and evidence belong in an authorised reporting process.
            Public dashboards show aggregate figures rather than residents’ personal records.
          </p>
          <Link
            to="/privacy"
            className="inline-flex min-h-11 items-center font-medium text-teal hover:underline"
          >
            Read the privacy notice
          </Link>
        </CommunityCard>
        <CommunityCard icon={Building2} title="Clear responsibilities">
          <p>
            Municipal entities carry out repairs and service work. This platform supports tracking
            and ward-office follow-up; it does not replace the City’s reporting channels.
          </p>
        </CommunityCard>
      </div>
    </CommunityPage>
  );
}
