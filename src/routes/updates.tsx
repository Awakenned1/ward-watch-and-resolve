import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, CalendarDays, Megaphone } from "lucide-react";

import { EmptyState, Notice, PageHeader } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { WhatsAppChannelLink } from "@/components/whatsapp-channel";
import { db, friendlyError } from "@/lib/db";
import { ANNOUNCEMENT_KINDS, APP_NAME, formatDate, formatDateTime } from "@/lib/ward109";

export const Route = createFileRoute("/updates")({
  head: () => ({
    meta: [
      { title: `Ward updates · ${APP_NAME}` },
      {
        name: "description",
        content: "Service interruptions, maintenance, road closures and meetings in Ward 109.",
      },
    ],
  }),
  component: UpdatesPage,
});

function UpdatesPage() {
  const updates = useQuery({
    queryKey: ["announcements"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Row rules only return published notices to the public.
      const { data, error } = await db
        .from("announcements")
        .select("id, kind, source, source_reference, title, body, starts_at, ends_at, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <PageHeader
        eyebrow="Updates"
        title="Ward 109 updates"
        description="Scheduled interruptions, maintenance, road closures, community meetings and service delivery news."
        actions={<WhatsAppChannelLink />}
      />
      <div className="mt-8">
        {updates.isPending ? (
          <PageLoader />
        ) : updates.isError ? (
          <Notice tone="error" title="Updates could not be loaded">
            {friendlyError(updates.error)}
          </Notice>
        ) : updates.data.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No updates yet"
            description="Notices from the Ward 109 office will appear here."
          />
        ) : (
          <ol className="space-y-4">
            {updates.data.map((u) => (
              <li key={u.id} className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-primary">
                    {ANNOUNCEMENT_KINDS[u.kind]}
                  </span>
                  {u.source === "official_verified" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200 ring-inset">
                      <BadgeCheck className="size-3.5" /> Official municipal notice
                    </span>
                  ) : (
                    <span className="rounded-full bg-accent px-2.5 py-0.5 font-semibold text-accent-foreground">
                      Ward office update
                    </span>
                  )}
                  <span className="text-muted-foreground">{formatDate(u.published_at)}</span>
                </div>
                <h2 className="mt-3 text-lg font-semibold">{u.title}</h2>
                {(u.starts_at || u.ends_at) && (
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" />
                    {formatDateTime(u.starts_at)}
                    {u.ends_at && ` – ${formatDateTime(u.ends_at)}`}
                  </p>
                )}
                <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{u.body}</p>
                {u.source_reference && (
                  <p className="mt-3 text-xs text-muted-foreground">Source: {u.source_reference}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
