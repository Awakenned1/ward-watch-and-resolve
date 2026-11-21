import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderOpen,
  Inbox,
  Megaphone,
  Timer,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  EmptyState,
  Notice,
  PriorityBadge,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/app-ui";
import { ComplaintMap, MapLegend } from "@/components/complaint-map";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useProfile, useRoles } from "@/hooks/use-auth";
import {
  isOverdue,
  toMapPoints,
  useWardComplaints,
  type WardComplaint,
} from "@/hooks/use-ward-complaints";
import { db, friendlyError } from "@/lib/db";
import {
  APP_NAME,
  COUNCILLOR,
  DONE_STATUSES,
  ESCALATED_STATUSES,
  OPEN_STATUSES,
  STATUS_INFO,
  daysSince,
  formatDateTime,
} from "@/lib/ward109";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: `Ward overview · ${APP_NAME}` }] }),
  component: OverviewPage,
});

const DAY = 86_400_000;
const WEEKS = 12;

const trendConfig = {
  submitted: { label: "Registered", color: "var(--chart-1)" },
  resolved: { label: "Resolved", color: "var(--chart-2)" },
} satisfies ChartConfig;
const breakdownConfig = {
  open: { label: "Open", color: "var(--chart-1)" },
  done: { label: "Resolved / closed", color: "var(--chart-2)" },
} satisfies ChartConfig;

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-ZA", {
      hour: "numeric",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(new Date()),
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function startOfWeek(t: number) {
  const d = new Date(t);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * DAY;
}

function weeklyTrend(rows: WardComplaint[], now: number) {
  const first = startOfWeek(now) - (WEEKS - 1) * 7 * DAY;
  const weeks = Array.from({ length: WEEKS }, (_, i) => {
    const start = first + i * 7 * DAY;
    return {
      start,
      label: new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short" }).format(start),
      submitted: 0,
      resolved: 0,
    };
  });
  const bucket = (iso: string | null) => {
    if (!iso) return null;
    const i = Math.floor((new Date(iso).getTime() - first) / (7 * DAY));
    return i >= 0 && i < WEEKS ? weeks[i] : null;
  };
  for (const r of rows) {
    const s = bucket(r.submitted_at);
    if (s) s.submitted++;
    const d = bucket(r.resolved_at ?? r.closed_at);
    if (d) d.resolved++;
  }
  return weeks;
}

function breakdown(rows: WardComplaint[], key: (r: WardComplaint) => string | undefined) {
  const map = new Map<string, { name: string; open: number; done: number }>();
  for (const r of rows) {
    const name = key(r) ?? "Not specified";
    const entry = map.get(name) ?? { name, open: 0, done: 0 };
    if (DONE_STATUSES.includes(r.status)) entry.done++;
    else entry.open++;
    map.set(name, entry);
  }
  return [...map.values()].sort((a, b) => b.open + b.done - (a.open + a.done)).slice(0, 8);
}

function OverviewPage() {
  const { isCouncillor } = useRoles();
  const profile = useProfile();
  const complaints = useWardComplaints();

  const residents = useQuery({
    queryKey: ["admin", "resident-counts"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
      const [all, recent] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }).eq("is_demo", false),
        db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("is_demo", false)
          .gte("created_at", weekAgo),
      ]);
      if (all.error) throw all.error;
      if (recent.error) throw recent.error;
      return { total: all.count ?? 0, newThisWeek: recent.count ?? 0 };
    },
  });

  const activity = useQuery({
    queryKey: ["complaints", "activity"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("complaint_status_history")
        .select(
          "id, from_status, to_status, note, is_public, created_at, complaints(id, tracking_number, issue_types(name), suburbs(name))",
        )
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const now = Date.now();
  const rows = useMemo(() => (complaints.data ?? []).filter((r) => !r.is_demo), [complaints.data]);

  const stats = useMemo(() => {
    const at = Date.now();
    const done = rows.filter((r) => DONE_STATUSES.includes(r.status));
    const recentDone = done.filter(
      (r) =>
        (r.resolved_at ?? r.closed_at) &&
        at - new Date((r.resolved_at ?? r.closed_at)!).getTime() < 30 * DAY,
    );
    const durations = done
      .filter((r) => r.resolved_at && r.submitted_at)
      .map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.submitted_at!).getTime()) / DAY);
    return {
      open: rows.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      newThisWeek: rows.filter(
        (r) => r.submitted_at && at - new Date(r.submitted_at).getTime() < 7 * DAY,
      ).length,
      escalated: rows.filter((r) => ESCALATED_STATUSES.includes(r.status)).length,
      overdue: rows.filter((r) => isOverdue(r, at)).length,
      resolved30: recentDone.length,
      rate: rows.length ? Math.round((done.length / rows.length) * 100) : null,
      avgDays: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    };
  }, [rows]);

  const attention = useMemo(() => {
    const at = Date.now();
    const score = (r: WardComplaint) =>
      (ESCALATED_STATUSES.includes(r.status) ? 4 : 0) +
      (r.priority === "critical" ? 3 : r.priority === "urgent" ? 1 : 0) +
      (isOverdue(r, at) ? 2 : 0) +
      (r.status === "submitted" ? 1 : 0) +
      (r.status === "reopened" ? 2 : 0);
    return rows
      .filter((r) => OPEN_STATUSES.includes(r.status) && score(r) > 0)
      .sort(
        (a, b) => score(b) - score(a) || (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""),
      )
      .slice(0, 6);
  }, [rows]);

  const trend = useMemo(() => weeklyTrend(rows, Date.now()), [rows]);
  const byService = useMemo(() => breakdown(rows, (r) => r.service_categories?.name), [rows]);
  const bySuburb = useMemo(() => breakdown(rows, (r) => r.suburbs?.name), [rows]);
  const openPoints = useMemo(
    () => toMapPoints(rows.filter((r) => OPEN_STATUSES.includes(r.status))),
    [rows],
  );
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const firstName = isCouncillor
    ? `Councillor ${COUNCILLOR.name.split(" ").at(-1)}`
    : (profile.data?.first_name ?? "");
  const today = new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(now);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">{today}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Here is what is happening in Ward 109. Figures exclude demo records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/updates">
              <Megaphone className="size-4" /> Post an update
            </Link>
          </Button>
          <Button asChild>
            <Link to="/admin/complaints" search={{ group: "escalated" }}>
              <AlertTriangle className="size-4" /> Review escalations
            </Link>
          </Button>
        </div>
      </div>

      {complaints.isPending ? (
        <PageLoader />
      ) : complaints.isError ? (
        <Notice tone="error" title="Ward data could not be loaded">
          {friendlyError(complaints.error)}
        </Notice>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
            <StatCard label="Open complaints" value={stats.open} icon={FolderOpen} />
            <StatCard label="New this week" value={stats.newThisWeek} icon={Inbox} tone="teal" />
            <StatCard
              label="Escalations"
              value={stats.escalated}
              icon={AlertTriangle}
              tone="amber"
              hint="Awaiting councillor action"
            />
            <StatCard label="Overdue follow-ups" value={stats.overdue} icon={Clock} tone="amber" />
            <StatCard
              label="Resolved (30 days)"
              value={stats.resolved30}
              icon={CheckCircle2}
              tone="green"
              hint={stats.rate != null ? `${stats.rate}% resolved overall` : undefined}
            />
            <StatCard
              label="Avg. days to resolve"
              value={stats.avgDays ?? "—"}
              icon={Timer}
              hint={
                residents.data
                  ? `${residents.data.total} registered residents (+${residents.data.newThisWeek} this week)`
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <SectionCard
              title="Needs your attention"
              description="Escalations, critical faults, overdue follow-ups and new complaints."
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/complaints">
                    All complaints <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
              className="[&>div:last-child]:p-0"
            >
              {attention.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    icon={CheckCircle2}
                    title="Nothing urgent"
                    description="There are no escalations, critical faults or overdue follow-ups right now."
                  />
                </div>
              ) : (
                <ul className="divide-y">
                  {attention.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/reports/$id"
                        params={{ id: r.id }}
                        className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-sm font-semibold text-primary">
                              {r.tracking_number}
                            </span>
                            <StatusBadge status={r.status} />
                            {r.priority !== "routine" && <PriorityBadge priority={r.priority} />}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium">
                            {r.issue_types?.name ?? r.service_categories?.name}
                            <span className="font-normal text-muted-foreground">
                              {" · "}
                              {[r.street_address, r.suburbs?.name].filter(Boolean).join(", ")}
                            </span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground tabular-nums">
                            {daysSince(r.submitted_at)}{" "}
                            {daysSince(r.submitted_at) === 1 ? "day" : "days"}
                          </p>
                          {isOverdue(r, now) && (
                            <p className="font-semibold text-red-700">Follow-up overdue</p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Where the open faults are"
              description={`${openPoints.length} open complaints pinned on the map.`}
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/map">
                    Full map <ArrowRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              <ComplaintMap points={openPoints} className="h-[300px]" />
              <div className="mt-3">
                <MapLegend />
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Complaints over the last 12 weeks"
            description="Complaints registered with the ward office and complaints resolved, per week."
          >
            {rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No complaints have been registered yet.
              </p>
            ) : (
              <ChartContainer config={trendConfig} className="aspect-auto h-[260px] w-full">
                <BarChart data={trend} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="submitted" fill="var(--color-submitted)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <BreakdownCard
              title="By municipal service"
              description="Which services residents are struggling with."
              data={byService}
            />
            <BreakdownCard
              title="By suburb"
              description="Fault hotspots across the ward."
              data={bySuburb}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <SectionCard title="Complaints by status">
              {statusCounts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No complaints yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {statusCounts.map(([status, count]) => (
                    <li key={status} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 sm:w-48">
                        <StatusBadge status={status as WardComplaint["status"]} />
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(count / rows.length) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 text-right text-sm font-semibold tabular-nums">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Recent activity"
              description="The latest status changes across the ward."
              className="[&>div:last-child]:p-0"
            >
              {activity.isPending ? (
                <PageLoader />
              ) : activity.isError ? (
                <p className="p-5 text-sm text-destructive">{friendlyError(activity.error)}</p>
              ) : activity.data.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="divide-y">
                  {activity.data.map((a) => (
                    <li key={a.id} className="flex gap-3 px-5 py-3">
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-teal" aria-hidden />
                      <div className="min-w-0 flex-1 text-sm">
                        <p>
                          {a.complaints ? (
                            <Link
                              to="/reports/$id"
                              params={{ id: a.complaints.id }}
                              className="font-mono font-semibold text-primary hover:underline"
                            >
                              {a.complaints.tracking_number}
                            </Link>
                          ) : null}{" "}
                          {a.from_status ? "moved to" : "registered as"}{" "}
                          <span className="font-medium">{STATUS_INFO[a.to_status].label}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[a.complaints?.issue_types?.name, a.complaints?.suburbs?.name]
                            .filter(Boolean)
                            .join(" · ")}
                          {a.note ? ` — ${a.note}` : ""}
                          {!a.is_public && " (internal)"}
                        </p>
                      </div>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={a.created_at}
                      >
                        {formatDateTime(a.created_at)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>

          {residents.data && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="size-4" />
              {residents.data.total} residents have registered on {APP_NAME}.{" "}
              <Link to="/admin/residents" className="font-medium text-teal hover:underline">
                View residents
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: { name: string; open: number; done: number }[];
}) {
  return (
    <SectionCard title={title} description={description}>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No complaints yet.</p>
      ) : (
        <ChartContainer
          config={breakdownConfig}
          className="aspect-auto w-full"
          style={{ height: Math.max(160, data.length * 38 + 50) }}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={150}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="open" stackId="a" fill="var(--color-open)" />
            <Bar dataKey="done" stackId="a" fill="var(--color-done)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </SectionCard>
  );
}
