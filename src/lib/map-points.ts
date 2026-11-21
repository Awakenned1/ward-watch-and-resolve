import {
  DONE_STATUSES,
  ESCALATED_STATUSES,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@/lib/ward109";

// Complaint pins on the ward map: colours by status and priority.
export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  tracking: string;
  title: string;
  place: string | null;
  status: ComplaintStatus;
  priority: ComplaintPriority;
};

export const MAP_LEGEND = [
  { label: "Open", color: "#0E7490" },
  { label: "Escalated", color: "#EA580C" },
  { label: "Critical", color: "#DC2626" },
  { label: "Resolved / closed", color: "#16A34A" },
];

export function pointColor(p: Pick<MapPoint, "status" | "priority">) {
  if (DONE_STATUSES.includes(p.status)) return "#16A34A";
  if (p.priority === "critical") return "#DC2626";
  if (ESCALATED_STATUSES.includes(p.status)) return "#EA580C";
  return "#0E7490";
}
