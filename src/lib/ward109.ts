import {
  Construction,
  Droplets,
  Globe,
  Lightbulb,
  Receipt,
  ShieldAlert,
  Trash2,
  Trees,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { Enums } from "@/lib/db-types";

export type ComplaintStatus = Enums<"complaint_status">;
export type ComplaintPriority = Enums<"complaint_priority">;

export const APP_NAME = "Ward Resolve";
export const TAGLINE = "Your community. Your voice. Your resolution.";
export const ACCESS_STATEMENT = "Open to every resident, regardless of political affiliation.";
export const WARD_NUMBER = 109;
export const PRIVACY_NOTICE_VERSION = "2026-11";

export const COUNCILLOR: { name: string; title: string; photo: string | null } = {
  name: "Charlene Olivia McCord",
  title: "Councillor Ward 109 | City of Johannesburg",
  // Official headshot (480×480, cropped from the photo supplied by the councillor's office).
  photo: "/brand/councillor.webp",
};

// The Ward 109 office's WhatsApp channel (https://whatsapp.com/channel/...). null hides the link.
export const WHATSAPP_CHANNEL: string | null =
  "https://whatsapp.com/channel/0029Vb93dWDFcowDZg6T0w3R";

// Official 2026 boundary (Municipal Demarcation Board, WardID 79800109), served as a static file.
export const WARD_BOUNDARY = {
  url: "/geo/ward-109-2026.geojson",
  source: "Municipal Demarcation Board, 2026 ward boundaries",
  effectiveDate: "4 November 2026",
};

// "partial" = only part of the suburb lies inside Ward 109. Mirrors public.suburbs.
export const WARD_SUBURBS: { name: string; partial: boolean }[] = [
  { name: "Buccleuch", partial: true },
  { name: "Edenburg", partial: true },
  { name: "Gallo Manor", partial: false },
  { name: "Kelvin", partial: false },
  { name: "Khyber Rock", partial: false },
  { name: "Marlboro Gardens", partial: false },
  { name: "Morningside", partial: true },
  { name: "Morningside Manor Extension 1", partial: false },
  { name: "Morningside Manor Extension 2", partial: false },
  { name: "Wendywood", partial: false },
  { name: "Woodmead", partial: true },
];

export type CityEntity = {
  name: string;
  handles: string;
  contact: string;
  href: string;
  icon: LucideIcon;
};

// Public directory (pending administrative verification). Keyed by service category slug.
export const CITY_ENTITIES: Record<string, CityEntity> = {
  water: {
    name: "Johannesburg Water",
    handles: "Water leaks, bursts, outages, sewer",
    contact: "jwfaultlogging.jwater.co.za",
    href: "https://jwfaultlogging.jwater.co.za",
    icon: Droplets,
  },
  electricity: {
    name: "City Power",
    handles: "Outages, streetlights, cables",
    contact: "citypower.mobi",
    href: "https://citypower.mobi",
    icon: Lightbulb,
  },
  eskom: {
    name: "Eskom",
    handles:
      "Power outages in areas Eskom supplies directly, not City Power. Also: MyEskom app, or call 08600 ESKOM.",
    contact: "0860 037 566 (WhatsApp)",
    href: "https://alfred.eskom.co.za/chatroom/",
    icon: Zap,
  },
  roads: {
    name: "Johannesburg Roads Agency",
    handles: "Potholes, roads, kerbs, stormwater",
    contact: "hotline@jra.org.za",
    href: "mailto:hotline@jra.org.za",
    icon: Construction,
  },
  parks: {
    name: "City Parks and Zoo",
    handles: "Parks, trees, verges",
    contact: "joburgconnect@joburg.org.za",
    href: "mailto:joburgconnect@joburg.org.za",
    icon: Trees,
  },
  waste: {
    name: "Pikitup",
    handles: "Refuse collection, illegal dumping",
    contact: "info@pikitup.co.za",
    href: "mailto:info@pikitup.co.za",
    icon: Trash2,
  },
  "law-enforcement": {
    name: "JMPD",
    handles: "Non-emergency by-law and traffic enforcement",
    contact: "011 375 5911",
    href: "tel:+27113755911",
    icon: ShieldAlert,
  },
  billing: {
    name: "Revenue & Billing",
    handles: "Accounts, meter readings, queries",
    contact: "regionErevenue@joburg.org.za",
    href: "mailto:regionErevenue@joburg.org.za",
    icon: Receipt,
  },
  general: {
    name: "E-Joburg",
    handles: "Online municipal services",
    contact: "www.e-joburg.org.za",
    href: "https://www.e-joburg.org.za",
    icon: Globe,
  },
};

export const COJ_APP_LINKS = {
  android: "https://bit.ly/4ucfYc4",
  iphone: "https://bit.ly/42WsUH4",
};

type StatusInfo = { label: string; tone: string; description: string };

// Labels and colours for the 11-step complaint lifecycle.
export const STATUS_INFO: Record<ComplaintStatus, StatusInfo> = {
  draft: {
    label: "Draft",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    description: "Not yet submitted.",
  },
  submitted: {
    label: "Submitted",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
    description: "Registered with the ward office.",
  },
  under_review: {
    label: "Under Review",
    tone: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    description: "The ward office is reviewing your complaint.",
  },
  awaiting_municipal_feedback: {
    label: "Awaiting Municipal Feedback",
    tone: "bg-violet-50 text-violet-800 ring-violet-200",
    description: "Followed up with the municipal entity; waiting for their response.",
  },
  escalation_requested: {
    label: "Escalation Requested",
    tone: "bg-amber-50 text-amber-900 ring-amber-200",
    description: "You asked for councillor intervention.",
  },
  escalated_to_councillor: {
    label: "Escalated to Councillor",
    tone: "bg-orange-50 text-orange-900 ring-orange-200",
    description: "The Ward Councillor is handling this complaint.",
  },
  in_progress: {
    label: "In Progress",
    tone: "bg-cyan-50 text-cyan-900 ring-cyan-200",
    description: "Work is under way.",
  },
  resolution_reported: {
    label: "Resolution Reported",
    tone: "bg-teal-50 text-teal-900 ring-teal-200",
    description: "A fix has been reported. Please confirm or reopen.",
  },
  resolved: {
    label: "Resolved",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    description: "The fault has been resolved.",
  },
  closed: {
    label: "Closed",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    description: "This complaint is closed.",
  },
  reopened: {
    label: "Reopened",
    tone: "bg-rose-50 text-rose-800 ring-rose-200",
    description: "Reopened for further follow-up.",
  },
};

export const STAFF_STATUS_OPTIONS: ComplaintStatus[] = [
  "submitted",
  "under_review",
  "awaiting_municipal_feedback",
  "escalation_requested",
  "escalated_to_councillor",
  "in_progress",
  "resolution_reported",
  "resolved",
  "closed",
  "reopened",
];

export const OPEN_STATUSES: ComplaintStatus[] = [
  "submitted",
  "under_review",
  "awaiting_municipal_feedback",
  "escalation_requested",
  "escalated_to_councillor",
  "in_progress",
  "resolution_reported",
  "reopened",
];
export const ESCALATED_STATUSES: ComplaintStatus[] = [
  "escalation_requested",
  "escalated_to_councillor",
];
export const DONE_STATUSES: ComplaintStatus[] = ["resolved", "closed"];

export const PRIORITY_INFO: Record<ComplaintPriority, { label: string; tone: string }> = {
  routine: { label: "Routine", tone: "bg-slate-100 text-slate-700 ring-slate-200" },
  urgent: { label: "Urgent", tone: "bg-amber-50 text-amber-900 ring-amber-200" },
  critical: { label: "Critical", tone: "bg-red-50 text-red-800 ring-red-200" },
};

export const ANNOUNCEMENT_KINDS: Record<Enums<"announcement_kind">, string> = {
  water_interruption: "Water interruption",
  electricity_maintenance: "Electricity maintenance",
  road_closure: "Road closure",
  community_meeting: "Community meeting",
  service_update: "Service update",
  general: "Ward notice",
};

// Evidence rules mirror the complaint_attachments constraints and storage bucket limits.
export const EVIDENCE = {
  bucket: "complaint-evidence",
  maxFiles: 5,
  maxBytes: 10 * 1024 * 1024,
  accept: "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf",
};

const dateTimeFormat = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Johannesburg",
});
const dateFormat = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeZone: "Africa/Johannesburg",
});

export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFormat.format(new Date(iso)) : "—";
}

export function formatDate(iso: string | null | undefined) {
  return iso ? dateFormat.format(new Date(iso)) : "—";
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
