import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app-ui";
import { APP_NAME, PRIVACY_NOTICE_VERSION } from "@/lib/ward109";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: `Privacy notice · ${APP_NAME}` }] }),
  component: PrivacyPage,
});

// Draft notice based on POPIA principles. To be reviewed by the ward office before launch.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Who we are",
    body: [
      `${APP_NAME} is an independent ward-level platform used by the Ward 109 Councillor's office (City of Johannesburg) to track and escalate municipal service delivery complaints. It does not submit faults to City systems.`,
    ],
  },
  {
    title: "What we collect",
    body: [
      "Your name, surname, email address, mobile number, suburb and (optionally) street address.",
      "Complaint details: the location of the fault, a description, the municipal reference number, dates, and any photos or documents you upload. Location data is removed from photos before upload.",
    ],
  },
  {
    title: "Why we use it",
    body: [
      "To register, track and follow up your complaints with the responsible municipal entity, to contact you about them, and to produce aggregated ward service delivery statistics.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "Only you and authorised Ward 109 office staff can see your personal details and complaints. Municipal liaison officers can see complaints referred to their entity. Public statistics are aggregated and never show names, contact details, addresses, photos or internal notes.",
    ],
  },
  {
    title: "Community posts and ticket conversations",
    body: [
      "Community posts are public: your first name, post title, text and publication date can be read by anyone. Do not publish contact details, addresses or private ticket information. You can edit or delete your posts. Ward staff can hide content and give a moderation reason.",
      "Messages on a fault ticket are private to the ticket owner and authorised ward staff. Replies and progress alerts appear in your in-app notifications. Automated news headlines link to external publishers, whose own privacy policies apply when you open their sites.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "Closed complaints are kept for up to 36 months for follow-up and reporting, then reviewed for deletion or anonymisation.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You may ask to access, correct or delete your personal information, or object to its processing, by contacting the Ward 109 office. You may also lodge a complaint with the Information Regulator of South Africa.",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        eyebrow="POPIA"
        title="Privacy notice"
        description={`Version ${PRIVACY_NOTICE_VERSION}. How ${APP_NAME} handles your personal information.`}
      />
      <div className="mt-8 space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-semibold text-foreground">{s.title}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
