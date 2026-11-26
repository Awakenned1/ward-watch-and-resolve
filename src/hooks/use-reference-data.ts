import { useQuery } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { WARD_NUMBER } from "@/lib/ward109";

// Ward, suburbs, categories (with responsible entity) and issue types. Public, rarely changes.
export function useReferenceData() {
  return useQuery({
    queryKey: ["reference-data", WARD_NUMBER],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [ward, suburbs, categories, issueTypes] = await Promise.all([
        db.from("wards").select("id, ward_number, name").eq("ward_number", WARD_NUMBER).single(),
        db
          .from("suburbs")
          .select("id, name, coverage, ward_id")
          .eq("is_active", true)
          .order("sort_order"),
        db
          .from("service_categories")
          .select(
            "id, slug, name, description, emergency_warning, municipal_entities(name, short_name, contact_type, contact_value, secondary_links)",
          )
          .eq("is_active", true)
          .order("sort_order"),
        db
          .from("issue_types")
          .select("id, category_id, name, suggests_urgent")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      for (const r of [ward, suburbs, categories, issueTypes]) if (r.error) throw r.error;
      return {
        ward: ward.data!,
        suburbs: suburbs.data!.filter((s) => s.ward_id === ward.data!.id),
        categories: categories.data!,
        issueTypes: issueTypes.data!,
      };
    },
  });
}

export type ReferenceData = NonNullable<ReturnType<typeof useReferenceData>["data"]>;

// Builds a usable link for a municipal entity's contact (URL, email or phone).
export function entityHref(contactType: string, value: string) {
  if (contactType === "url") return value;
  if (contactType === "email") return `mailto:${value}`;
  if (contactType === "phone") return `tel:${value.replace(/[^\d+]/g, "")}`;
  return null;
}
