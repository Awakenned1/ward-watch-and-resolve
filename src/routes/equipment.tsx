import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Camera, FileText, Mail, MapPin, Smartphone } from "lucide-react";

import { Notice } from "@/components/app-ui";
import { CommunityCard, CommunityPage } from "@/components/community-page";
import { Button } from "@/components/ui/button";
import { communityHead } from "@/lib/community";
import { EVIDENCE } from "@/lib/ward109";

const description =
  "A phone or computer, your municipal reference number and a few clear details are enough to get started. Photos and documents are optional.";

export const Route = createFileRoute("/equipment")({
  head: () => communityHead("Reporting tools", description),
  component: ReportingToolsPage,
});

function ReportingToolsPage() {
  return (
    <CommunityPage title="Tools for a clear report" description={description}>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <CommunityCard icon={Smartphone} title="A phone or computer">
          <p>
            Use your web browser to register, save a draft or track progress. No specialist
            equipment or separate app is required.
          </p>
        </CommunityCard>
        <CommunityCard icon={Mail} title="An email account">
          <p>
            Use an email address you can access. Open the confirmation link to activate your
            account, then sign in to manage your private reports.
          </p>
        </CommunityCard>
        <CommunityCard icon={FileText} title="Your City reference number">
          <p>
            Keep the official number supplied by the responsible municipal entity. If you are still
            waiting for it, save your report as a draft.
          </p>
        </CommunityCard>
        <CommunityCard icon={MapPin} title="A clear location">
          <p>
            Provide the suburb, street address and any useful landmark. You can also place a pin on
            the map to help identify the fault.
          </p>
        </CommunityCard>
        <CommunityCard icon={CalendarDays} title="Dates and details">
          <p>
            Record when you logged the fault with the City and describe what is happening. Add the
            logging time if you have it.
          </p>
        </CommunityCard>
        <CommunityCard icon={Camera} title="Optional photos or documents">
          <p>
            Attach up to {EVIDENCE.maxFiles} photos or PDF documents, with a maximum of{" "}
            {EVIDENCE.maxBytes / 1024 / 1024} MB per uploaded file. Photographs are resized and
            their embedded location data is removed before upload.
          </p>
          <p>Files are stored privately. Do not put yourself at risk to take a photo.</p>
        </CommunityCard>
      </div>
      <Notice title="Who provides repair equipment?">
        Municipal service providers manage repair crews, vehicles and equipment. This platform helps
        residents record and follow up faults; it does not supply or hire out machinery.
      </Notice>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button asChild>
          <Link to="/report">Start a report</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/services">Find a City reporting channel</Link>
        </Button>
      </div>
    </CommunityPage>
  );
}
