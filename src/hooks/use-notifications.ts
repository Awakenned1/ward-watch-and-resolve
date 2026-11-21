import { useQuery } from "@tanstack/react-query";
import { useUserId } from "@/hooks/use-auth";
import { db } from "@/lib/db";

export function useUnreadNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["notifications", "unread", userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("channel", "in_app")
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
