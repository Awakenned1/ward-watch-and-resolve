import { useQuery } from "@tanstack/react-query";

import { db } from "@/lib/db";
import type { MapPoint } from "@/lib/map-points";
import { DONE_STATUSES, type ComplaintStatus } from "@/lib/ward109";

export const WARD_COMPLAINTS_LIMIT = 2000;

// Every submitted complaint the signed-in staff member may see (row rules decide which).
export function useWardComplaints() {
  return useQuery({
    queryKey: ["complaints", "all"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("complaints")
        .select(
          "id, tracking_number, status, priority, resident_id, contact_name, contact_mobile, contact_email, street_address, latitude, longitude, municipal_reference_number, reference_verified_at, submitted_at, resolved_at, closed_at, last_updated_at, next_follow_up_at, assigned_admin_id, reopened_count, is_demo, suburbs(id, name), service_categories(id, slug, name), issue_types(name), municipal_entities(name, short_name)",
        )
        .neq("status", "draft")
        .order("submitted_at", { ascending: false })
        .limit(WARD_COMPLAINTS_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export type WardComplaint = NonNullable<ReturnType<typeof useWardComplaints>["data"]>[number];

// A follow-up date in the past on a complaint that is not yet resolved or closed.
export function isOverdue(
  r: { next_follow_up_at: string | null; status: ComplaintStatus },
  now: number,
) {
  return (
    !!r.next_follow_up_at &&
    new Date(r.next_follow_up_at).getTime() < now &&
    !DONE_STATUSES.includes(r.status)
  );
}

// Complaints with a map pin, ready for the complaint map.
export function toMapPoints(rows: WardComplaint[]): MapPoint[] {
  return rows
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => ({
      id: r.id,
      lat: r.latitude!,
      lng: r.longitude!,
      tracking: r.tracking_number ?? "",
      title: r.issue_types?.name ?? r.service_categories?.name ?? "Complaint",
      place: [r.street_address, r.suburbs?.name].filter(Boolean).join(", ") || null,
      status: r.status,
      priority: r.priority,
    }));
}
