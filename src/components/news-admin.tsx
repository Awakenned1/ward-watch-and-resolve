import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Notice, SectionCard } from "@/components/app-ui";
import { Button } from "@/components/ui/button";
import { db, friendlyError } from "@/lib/db";
import { formatDateTime } from "@/lib/ward109";

export function NewsAutomationAdmin() {
  const client = useQueryClient();
  const feeds = useQuery({
    queryKey: ["news-feeds"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("news_feeds")
        .select("id,name,enabled,last_checked_at,last_success_at,last_error");
      if (error) throw error;
      return data;
    },
  });
  const headlines = useQuery({
    queryKey: ["neighbourhood-news", "admin"],
    queryFn: async () => {
      const { data, error } = await db
        .from("neighbourhood_news")
        .select("id,title,is_hidden,published_at")
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const change = useMutation({
    mutationFn: async (action: { type: "feed" | "headline"; id: string; value: boolean }) => {
      const { error } =
        action.type === "feed"
          ? await db.from("news_feeds").update({ enabled: action.value }).eq("id", action.id)
          : await db
              .from("neighbourhood_news")
              .update({ is_hidden: action.value })
              .eq("id", action.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("News settings saved");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["news-feeds"] }),
        client.invalidateQueries({ queryKey: ["neighbourhood-news"] }),
      ]);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <SectionCard
      title="Automated neighbourhood news"
      description="The hourly worker imports linked headlines from an approved publisher feed. Pause imports or hide stories here."
    >
      {feeds.isError && <Notice tone="error">{friendlyError(feeds.error)}</Notice>}
      {feeds.isPending && (
        <p role="status" className="text-sm">
          Loading feed status…
        </p>
      )}
      {feeds.data?.map((feed) => (
        <div key={feed.id} className="mb-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong>{feed.name}</strong>
            <Button
              variant="outline"
              size="sm"
              disabled={change.isPending}
              onClick={() => change.mutate({ type: "feed", id: feed.id, value: !feed.enabled })}
            >
              {feed.enabled ? "Pause imports" : "Resume imports"}
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {feed.enabled ? "Enabled · checks hourly" : "Paused"} · Last successful import:{" "}
            {feed.last_success_at ? formatDateTime(feed.last_success_at) : "Not yet run"}
          </p>
          {feed.last_error && <p className="mt-2 text-sm text-amber-700">{feed.last_error}</p>}
        </div>
      ))}
      {headlines.isError && <Notice tone="error">{friendlyError(headlines.error)}</Notice>}
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Review imported headlines ({headlines.data?.length ?? 0})
        </summary>
        <ul className="mt-3 space-y-3">
          {headlines.data?.map((item) => (
            <li
              key={item.id}
              className="flex flex-col justify-between gap-2 border-t pt-3 sm:flex-row sm:items-center"
            >
              <span className="text-sm [overflow-wrap:anywhere]">
                {item.title}
                {item.is_hidden && <strong className="ml-2 text-amber-700">Hidden</strong>}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 self-start"
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({ type: "headline", id: item.id, value: !item.is_hidden })
                }
              >
                {item.is_hidden ? "Restore" : "Hide"}
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </SectionCard>
  );
}
