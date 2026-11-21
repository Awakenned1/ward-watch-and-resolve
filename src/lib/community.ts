import { ClipboardList, FileCheck2, Megaphone } from "lucide-react";

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
    alt: "Resident on a street reporting a fault on her phone",
    title: "Log it with the City",
    body: "Report the fault to the responsible municipal entity and keep the official reference number.",
  },
  {
    icon: Megaphone,
    image: stepEscalateImage,
    alt: "Resident typing complaint details on a laptop",
    title: "Register & escalate",
    body: "Register it here with your reference number and photos. Still unresolved? Request councillor intervention.",
  },
  {
    icon: FileCheck2,
    image: stepTrackImage,
    alt: "Road crew resurfacing a road to fix the fault",
    title: "Track until resolved",
    body: "Follow every update with your W109 tracking number, then confirm when the fault is fixed.",
  },
];
