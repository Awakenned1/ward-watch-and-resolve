import { useQuery } from "@tanstack/react-query";

import { db } from "@/lib/db";
import { WARD_NUMBER } from "@/lib/ward109";

// Reporting readiness is separate from Supabase Auth's signup/sign-in availability.
export function useBackendReady() {
  return useQuery({
    queryKey: ["backend-ready", WARD_NUMBER],
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => (query.state.data === false ? 30_000 : false),
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("wards")
        .select("id")
        .eq("ward_number", WARD_NUMBER)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        if (error.code === "PGRST205" || /Could not find the table/i.test(error.message)) {
          return false;
        }
        throw error;
      }
      return data !== null;
    },
  });
}
