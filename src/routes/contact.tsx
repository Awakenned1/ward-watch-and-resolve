import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ClipboardList, Mail, Phone } from "lucide-react";

import { Notice } from "@/components/app-ui";
import { CommunityCard, CommunityPage } from "@/components/community-page";
import { Button } from "@/components/ui/button";
import { WhatsAppChannelLink } from "@/components/whatsapp-channel";
import { communityHead } from "@/lib/community";
import { db } from "@/lib/db";
import { COUNCILLOR } from "@/lib/ward109";

const description =
  "Find help with municipal reporting, follow up a registered complaint, or contact the ward office using its published contact details.";

export const Route = createFileRoute("/contact")({
  head: () => communityHead("Contact", description),
  component: ContactPage,
});

function ContactPage() {
  const contacts = useQuery({
    queryKey: ["public-office-contacts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Only public office settings are readable here; personal staff records stay private.
      const { data, error } = await db
        .from("system_settings")
        .select("key,value")
        .in("key", ["ward.office_email", "ward.office_phone"]);
      if (error) throw error;
      const value = (key: string) => {
        const raw = data.find((row) => row.key === key)?.value;
        return typeof raw === "string" ? raw.trim() : "";
      };
      const email = value("ward.office_email");
      const phone = value("ward.office_phone");
      return {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
        phone: /^\+?[0-9 ()-]{7,20}$/.test(phone) ? phone : null,
      };
    },
  });

  return (
    <CommunityPage title="Let’s find the right help" description={description}>
      <div className="grid gap-5 md:grid-cols-2">
        <CommunityCard icon={Building2} title="Report a new municipal fault">
          <p>
            Start with the municipal entity responsible for the service. Keep its official reference
            number, then register the issue here for tracking.
          </p>
          <Button asChild variant="outline">
            <Link to="/services">Find reporting channels</Link>
          </Button>
        </CommunityCard>
        <CommunityCard icon={ClipboardList} title="Follow up an existing complaint">
          <p>
            Sign in to see your complaint’s updates and request escalation when needed. Keep your
            W109 tracking number and City reference number ready.
          </p>
          <Button asChild variant="outline">
            <Link to="/reports">Open my complaints</Link>
          </Button>
        </CommunityCard>
      </div>
      <section className="grid gap-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">
            Current service area
          </p>
          <h2 className="mt-2 text-xl font-semibold">Ward 109 office</h2>
          <p className="mt-3 font-medium">{COUNCILLOR.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{COUNCILLOR.title}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Assistance is available to residents regardless of political affiliation. Party
            membership is not needed to register a complaint or ask for follow-up.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          {contacts.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading office contact details…
            </p>
          ) : contacts.data?.email || contacts.data?.phone ? (
            <div className="space-y-3">
              {contacts.data.email && (
                <a
                  href={`mailto:${encodeURIComponent(contacts.data.email)}`}
                  className="flex min-h-11 items-center gap-3 text-sm font-medium text-teal [overflow-wrap:anywhere] hover:underline"
                >
                  <Mail className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{contacts.data.email}</span>
                </a>
              )}
              {contacts.data.phone && (
                <a
                  href={`tel:${contacts.data.phone.replace(/[^\d+]/g, "")}`}
                  className="flex min-h-11 items-center gap-3 text-sm font-medium text-teal hover:underline"
                >
                  <Phone className="size-5 shrink-0" aria-hidden="true" />
                  {contacts.data.phone}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {contacts.isError ? "Office contact details could not be loaded. " : ""}For fault
              follow-up, sign in and open your complaint to view progress or request escalation.
            </p>
          )}
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Follow the ward office’s WhatsApp channel for updates. The channel is for notices,
              rather than submitting a private complaint.
            </p>
            <WhatsAppChannelLink />
          </div>
        </div>
      </section>
      <Notice tone="warning" title="For emergencies, use emergency services">
        <p>
          This platform is not monitored around the clock. For police emergencies call{" "}
          <a href="tel:10111" className="inline-flex min-h-11 items-center font-semibold underline">
            10111
          </a>
          , or call{" "}
          <a
            href="tel:112"
            className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold underline"
          >
            112
          </a>{" "}
          from a mobile phone.
        </p>
      </Notice>
    </CommunityPage>
  );
}
