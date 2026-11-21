import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Newspaper } from "lucide-react";
import { useState } from "react";
import { EmptyState, Notice, PageHeader } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import { ANNOUNCEMENT_KINDS, formatDate, formatDateTime } from "@/lib/ward109";

export function NewsFeed() {
  const [tab, setTab] = useState("all");
  const { isStaff } = useRoles();
  const notices = useQuery({
    queryKey: ["announcements", "published"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("announcements")
        .select("id,kind,source,source_reference,title,body,starts_at,ends_at,published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  const headlines = useQuery({
    queryKey: ["neighbourhood-news", "published"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("neighbourhood_news")
        .select("id,title,article_url,published_at,news_feeds(name)")
        .eq("is_hidden", false)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <PageHeader
        eyebrow="Stay informed"
        title="News & neighbourhood updates"
        description="Ward office notices and automatically collected headlines from local publishers."
        actions={
          isStaff && (
            <Button asChild>
              <Link to="/admin/updates">Manage news</Link>
            </Button>
          )
        }
      />
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter news">
        {[
          { id: "all", label: "All news" },
          { id: "ward", label: "Ward office" },
          { id: "local", label: "Local headlines" },
        ].map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? "default" : "outline"}
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {tab !== "local" && (
        <section className="mt-8" aria-labelledby="ward-notices">
          <h2 id="ward-notices" className="mb-4 text-xl font-semibold">
            From the ward office
          </h2>
          {notices.isPending ? (
            <PageLoader />
          ) : notices.isError ? (
            <Notice tone="error">{friendlyError(notices.error)}</Notice>
          ) : !notices.data.length ? (
            <EmptyState
              icon={Newspaper}
              title="No ward notices yet"
              description="Published service alerts and ward office news will appear here."
            />
          ) : (
            <ol className="space-y-4">
              {notices.data.map((notice) => (
                <li key={notice.id}>
                  <article className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-primary">
                        {ANNOUNCEMENT_KINDS[notice.kind]}
                      </span>
                      <span className="rounded-full bg-accent px-2.5 py-1 font-medium">
                        {notice.source === "official_verified"
                          ? "Verified municipal notice"
                          : "Ward office"}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold [overflow-wrap:anywhere]">
                      {notice.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(notice.published_at)}
                    </p>
                    {notice.starts_at && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        When: {formatDateTime(notice.starts_at)}
                        {notice.ends_at ? ` – ${formatDateTime(notice.ends_at)}` : ""}
                      </p>
                    )}
                    <p className="mt-3 text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {notice.body}
                    </p>
                    {notice.source_reference && (
                      <p className="mt-3 text-xs break-words text-muted-foreground">
                        Source: {notice.source_reference}
                      </p>
                    )}
                  </article>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {tab !== "ward" && (
        <section className="mt-8" aria-labelledby="local-headlines">
          <h2 id="local-headlines" className="text-xl font-semibold">
            Around the neighbourhood
          </h2>
          <p className="mt-2 mb-4 text-sm text-muted-foreground">
            Collected hourly from local publisher feeds for Sandton and surrounding suburbs.
            Headlines are selected automatically and may cover the wider area. Read the original for
            full details; these are not ward office notices.
          </p>
          {headlines.isPending ? (
            <PageLoader />
          ) : headlines.isError ? (
            <Notice tone="error">{friendlyError(headlines.error)}</Notice>
          ) : !headlines.data.length ? (
            <EmptyState
              icon={Newspaper}
              title="No local headlines yet"
              description="New stories will appear after the next successful feed check."
            />
          ) : (
            <ol className="grid gap-4 sm:grid-cols-2">
              {headlines.data.map((article) => (
                <li
                  key={article.id}
                  className="flex flex-col rounded-xl border bg-card p-5 shadow-sm"
                >
                  <p className="text-xs font-semibold text-teal">
                    {article.news_feeds?.name ?? "Local publisher"} · Automated headline
                  </p>
                  <h3 className="mt-3 text-lg font-semibold [overflow-wrap:anywhere]">
                    {article.title}
                  </h3>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(article.published_at)}
                  </p>
                  <a
                    href={article.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto flex min-h-11 items-center gap-2 pt-4 text-sm font-semibold text-teal hover:underline"
                  >
                    Read at source
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
