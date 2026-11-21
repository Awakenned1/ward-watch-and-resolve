import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Plus,
  Search,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { EmptyState, Notice, PageHeader, StatCard, StatusBadge } from "@/components/app-ui";
import { PageLoader, RequireAuth } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfile, useUserId } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  APP_NAME,
  DONE_STATUSES,
  ESCALATED_STATUSES,
  OPEN_STATUSES,
  formatDate,
  type ComplaintStatus,
} from "@/lib/ward109";

export const Route = createFileRoute("/reports/")({
  head: () => ({ meta: [{ title: `My complaints · ${APP_NAME}` }] }),
  component: () => (
    <RequireAuth>
      <MyComplaintsPage />
    </RequireAuth>
  ),
});

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "escalated", label: "Escalated" },
  { key: "done", label: "Resolved" },
  { key: "draft", label: "Drafts" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matches(filter: FilterKey, status: ComplaintStatus) {
  if (filter === "all") return true;
  if (filter === "open") return OPEN_STATUSES.includes(status);
  if (filter === "escalated") return ESCALATED_STATUSES.includes(status);
  if (filter === "done") return DONE_STATUSES.includes(status);
  return status === "draft";
}

function MyComplaintsPage() {
  const userId = useUserId()!;
  const profile = useProfile();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search).trim().toLowerCase();

  const complaints = useQuery({
    queryKey: ["complaints", "mine", userId],
    queryFn: async () => {
      const { data, error } = await db
        .from("complaints")
        .select(
          "id, tracking_number, status, created_at, submitted_at, last_updated_at, street_address, municipal_reference_number, suburbs(name), service_categories(name), issue_types(name)",
        )
        .eq("resident_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(() => complaints.data ?? [], [complaints.data]);
  const counts = useMemo(() => {
    const real = rows.filter((r) => r.status !== "draft");
    return {
      total: real.length,
      open: real.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      escalated: real.filter((r) => ESCALATED_STATUSES.includes(r.status)).length,
      done: real.filter((r) => DONE_STATUSES.includes(r.status)).length,
    };
  }, [rows]);

  const visible = rows.filter(
    (r) =>
      matches(filter, r.status) &&
      (!term ||
        r.tracking_number?.toLowerCase().includes(term) ||
        r.municipal_reference_number?.toLowerCase().includes(term)),
  );

  const firstName = profile.data?.first_name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <PageHeader
        eyebrow="Resident dashboard"
        title={firstName ? `Welcome back, ${firstName}` : "My complaints"}
        description="Track the municipal faults you have registered with the Ward 109 office."
        actions={
          <Button asChild size="lg" className="bg-teal hover:bg-teal/90">
            <Link to="/report">
              <Plus className="size-4" /> Report new issue
            </Link>
          </Button>
        }
      />

      {complaints.isPending ? (
        <PageLoader />
      ) : complaints.isError ? (
        <Notice tone="error" className="mt-8" title="Your complaints could not be loaded">
          {friendlyError(complaints.error)}
        </Notice>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="My complaints" value={counts.total} icon={ClipboardList} />
            <StatCard label="Open" value={counts.open} icon={FolderOpen} tone="teal" />
            <StatCard
              label="Escalated"
              value={counts.escalated}
              icon={AlertTriangle}
              tone="amber"
            />
            <StatCard label="Resolved" value={counts.done} icon={CheckCircle2} tone="green" />
          </div>

          <div className="mt-8 rounded-xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter complaints">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                      filter === f.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tracking or reference number"
                  aria-label="Search by tracking or municipal reference number"
                  className="h-10 pl-9"
                />
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={ClipboardList}
                  title="No complaints yet"
                  description="Logged a fault with the City that is still unresolved? Register it here to track and escalate it."
                  action={
                    <Button asChild>
                      <Link to="/report">
                        <Plus className="size-4" /> Report an issue
                      </Link>
                    </Button>
                  }
                />
              </div>
            ) : visible.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No complaints match this filter.
              </p>
            ) : (
              <>
                <table className="hidden w-full text-sm md:table">
                  <thead className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Suburb</th>
                      <th className="px-4 py-3">Submitted</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visible.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-mono font-semibold text-foreground">
                            {r.tracking_number ?? "Draft"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.municipal_reference_number
                              ? `Municipal ref ${r.municipal_reference_number}`
                              : "No municipal reference yet"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p>{r.service_categories?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{r.issue_types?.name}</p>
                        </td>
                        <td className="px-4 py-3">{r.suburbs?.name ?? "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {formatDate(r.submitted_at ?? r.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RowAction id={r.id} draft={r.status === "draft"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <ul className="divide-y md:hidden">
                  {visible.map((r) => (
                    <li key={r.id}>
                      <MobileRow row={r} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Row = {
  id: string;
  status: ComplaintStatus;
  tracking_number: string | null;
  created_at: string;
  submitted_at: string | null;
  suburbs: { name: string } | null;
  service_categories: { name: string } | null;
  issue_types: { name: string } | null;
};

function MobileRow({ row: r }: { row: Row }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{r.tracking_number ?? "Draft"}</span>
          <StatusBadge status={r.status} />
        </div>
        <p className="mt-1 truncate text-sm">
          {r.issue_types?.name ?? r.service_categories?.name ?? "Incomplete draft"}
          {r.suburbs?.name ? ` · ${r.suburbs.name}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(r.submitted_at ?? r.created_at)}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </>
  );
  const className = "flex items-center gap-3 p-4 active:bg-muted/40";
  return r.status === "draft" ? (
    <Link to="/report" search={{ draft: r.id }} className={className}>
      {body}
    </Link>
  ) : (
    <Link to="/reports/$id" params={{ id: r.id }} className={className}>
      {body}
    </Link>
  );
}

function RowAction({ id, draft }: { id: string; draft: boolean }) {
  return draft ? (
    <Button asChild size="sm" variant="outline">
      <Link to="/report" search={{ draft: id }}>
        Continue
      </Link>
    </Button>
  ) : (
    <Button asChild size="sm" variant="ghost">
      <Link to="/reports/$id" params={{ id }}>
        View <ChevronRight className="size-4" />
      </Link>
    </Button>
  );
}
