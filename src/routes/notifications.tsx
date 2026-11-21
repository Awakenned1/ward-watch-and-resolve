import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Notice, PageHeader } from "@/components/app-ui";
import { PageLoader, RequireAuth } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { useUserId } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import { APP_NAME, formatDateTime } from "@/lib/ward109";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: `Notifications · ${APP_NAME}` }] }),
  component: () => (
    <RequireAuth>
      <NotificationsPage />
    </RequireAuth>
  ),
});
function NotificationsPage() {
  const userId = useUserId()!;
  const client = useQueryClient();
  const notices = useQuery({
    queryKey: ["notifications", "inbox", userId],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("notifications")
        .select("id,title,body,complaint_id,created_at,read_at")
        .eq("user_id", userId)
        .eq("channel", "in_app")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const read = useMutation({
    mutationFn: async (id?: string) => {
      let query = db
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (id) query = query.eq("id", id);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Notifications"
        description="Ticket progress and private replies from the ward office. Check here for updates."
        actions={
          <Button
            variant="outline"
            disabled={read.isPending || !notices.data?.some((n) => !n.read_at)}
            onClick={() => read.mutate(undefined)}
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        }
      />
      <div className="mt-8">
        {notices.isPending ? (
          <PageLoader />
        ) : notices.isError ? (
          <Notice tone="error">{friendlyError(notices.error)}</Notice>
        ) : !notices.data.length ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="Your ticket updates and replies will appear here."
          />
        ) : (
          <ol className="space-y-3">
            {notices.data.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border p-5 ${n.read_at ? "bg-card" : "border-teal/30 bg-accent/40"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold [overflow-wrap:anywhere]">{n.title}</h2>
                  {!n.read_at && <span className="text-xs font-semibold text-teal">Unread</span>}
                </div>
                <p className="mt-2 text-sm [overflow-wrap:anywhere]">{n.body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {n.complaint_id && (
                    <Button asChild size="sm">
                      <Link
                        to="/reports/$id"
                        params={{ id: n.complaint_id }}
                        onClick={() => read.mutate(n.id)}
                      >
                        Open ticket
                      </Link>
                    </Button>
                  )}
                  {!n.read_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={read.isPending}
                      onClick={() => read.mutate(n.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
