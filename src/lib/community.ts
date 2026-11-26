import { ClipboardList, FileCheck2, Megaphone } from "lucide-react";

import journeyLogCity from "@/assets/journey/01-log-city.webp";
import journeyDetails from "@/assets/journey/02-details.webp";
import journeyLocation from "@/assets/journey/03-location.webp";
import journeyIssue from "@/assets/journey/04-issue.webp";
import journeyReference from "@/assets/journey/05-reference.webp";
import journeyEvidence from "@/assets/journey/06-evidence.webp";
import journeyReview from "@/assets/journey/07-review.webp";
import journeyTrack from "@/assets/journey/08-track.webp";
import journeyEscalate from "@/assets/journey/09-escalate.webp";
import stepLogImage from "@/assets/steps/step-1-log.webp";
import stepEscalateImage from "@/assets/steps/step-2-escalate.webp";
import stepTrackImage from "@/assets/steps/step-3-track.webp";
import { APP_NAME } from "@/lib/ward109";

export function communityHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · ${APP_NAME}` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} · ${APP_NAME}` },
      { property: "og:description", content: description },
    ],
  };
}

export const COMMUNITY_PAGES = [
  { to: "/company", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/equipment", label: "Reporting tools" },
  { to: "/approach", label: "Our approach" },
  { to: "/contact", label: "Contact" },
] as const;

export const REPORTING_STEPS = [
  {
    icon: ClipboardList,
    image: stepLogImage,
    alt: "Ward Resolve report form showing the City entity to log the fault with first, such as the Johannesburg Roads Agency hotline",
    title: "Log it with the City",
    body: "Report the fault to the responsible municipal entity and keep the official reference number.",
  },
  {
    icon: Megaphone,
    image: stepEscalateImage,
    alt: "Ward Resolve report form with the official municipal reference number entered",
    title: "Register & escalate",
    body: "Register it here with your reference number and photos. Still unresolved? Request councillor intervention.",
  },
  {
    icon: FileCheck2,
    image: stepTrackImage,
    alt: "Ward Resolve ticket page showing the W109 tracking number, status and Request escalation button",
    title: "Track until resolved",
    body: "Follow every update with your W109 tracking number, then confirm when the fault is fixed.",
  },
];

// The full resident journey shown in the home page slideshow, with phone screenshots of the app.
export const JOURNEY_PHASES = [
  { id: "city", label: "Before you start" },
  { id: "register", label: "Register on Ward Resolve" },
  { id: "track", label: "After you submit" },
] as const;

export type JourneyStep = {
  phase: (typeof JOURNEY_PHASES)[number]["id"];
  title: string;
  body: string;
  image: string;
  alt: string;
};

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    phase: "city",
    title: "Log it with the City",
    body: "Report the fault to the responsible entity first, such as JRA, City Power or Johannesburg Water. If you haven't yet, the form shows you who to contact.",
    image: journeyLogCity,
    alt: "Report form asking whether the fault was reported to JRA, with the answer No and the Johannesburg Roads Agency hotline shown",
  },
  {
    phase: "register",
    title: "Add your details",
    body: "Your name and mobile number let the ward office reach you. Choose email or SMS for updates.",
    image: journeyDetails,
    alt: "Report form step 1 of 6, Your details, with name, mobile number and email filled in",
  },
  {
    phase: "register",
    title: "Pin the location",
    body: "Choose the suburb, enter the street address and tap the map. Only you and the ward office can see the location.",
    image: journeyLocation,
    alt: "Report form location step with a nearest landmark and a red pin on the Ward 109 map",
  },
  {
    phase: "register",
    title: "Describe the issue",
    body: "Pick the municipal service and type of issue, say what is wrong and set the priority.",
    image: journeyIssue,
    alt: "Report form issue step with Roads and Stormwater, Potholes and a description of the pothole",
  },
  {
    phase: "register",
    title: "Add the City reference",
    body: "Enter the official reference number the municipal entity gave you and the date you logged it.",
    image: journeyReference,
    alt: "Report form step 4 of 6 with the JRA reference number and date logged filled in",
  },
  {
    phase: "register",
    title: "Attach evidence",
    body: "Add up to 5 photos or PDFs. Photos are resized and their location data is removed before upload.",
    image: journeyEvidence,
    alt: "Report form step 5 of 6, Evidence, with a button to add a photo or PDF",
  },
  {
    phase: "register",
    title: "Review & submit",
    body: "Check every detail, give your consent and submit. You can save a draft at any step and finish later.",
    image: journeyReview,
    alt: "Report form step 6 of 6, Review and submit, summarising the resident's details and location",
  },
  {
    phase: "track",
    title: "Track your ticket",
    body: "You get a W109 tracking number. Follow each status update and message the ward office from the ticket.",
    image: journeyTrack,
    alt: "Ticket page with tracking number W109-2026-000006, status Submitted and a Request escalation button",
  },
  {
    phase: "track",
    title: "Escalate, then confirm the fix",
    body: "Not fixed within the City's turnaround time? Request councillor escalation, then confirm when the fault is resolved.",
    image: journeyEscalate,
    alt: "Request councillor escalation form with a reason, additional information and an urgent safety risk option",
  },
];
