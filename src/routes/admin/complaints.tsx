import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Loader2, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { NativeSelect, Notice, PageHeader, PriorityBadge, StatusBadge } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserId } from "@/hooks/use-auth";
import { useReferenceData } from "@/hooks/use-reference-data";
import {
  isOverdue,
  useWardComplaints,
  WARD_COMPLAINTS_LIMIT,
  type WardComplaint,
} from "@/hooks/use-ward-complaints";
import { db, friendlyError } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  APP_NAME,
  DONE_STATUSES,
  ESCALATED_STATUSES,
  OPEN_STATUSES,
  PRIORITY_INFO,
  STATUS_INFO,
  daysSince,
  formatDate,
  type ComplaintStatus,
} from "@/lib/ward109";

const GROUPS = [
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "escalated", label: "Escalations" },
  { key: "overdue", label: "Overdue follow-ups" },
  { key: "done", label: "Resolved & closed" },
  { key: "all", label: "All" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

const searchSchema = z.object({
  group: z
    .enum(["active", "new", "escalated", "overdue", "done", "all"])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/admin/complaints")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Complaints · ${APP_NAME}` }] }),
  component: ComplaintsPage,
});

function inGroup(group: GroupKey, status: ComplaintStatus, overdue: boolean) {
  return (
    group === "all" ||
    (group === "active" && OPEN_STATUSES.includes(status)) ||
    (group === "new" && status === "submitted") ||
    (group === "escalated" && ESCALATED_STATUSES.includes(status)) ||
    (group === "done" && DONE_STATUSES.includes(status)) ||
    (group === "overdue" && overdue)
  );
}

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  // Quote everything and neutralise spreadsheet formulas in resident-supplied text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: WardComplaint[]) {
  const header = [
    "Tracking number",
    "Municipal reference",
    "Status",
    "Priority",
    "Service",
    "Issue",
    "Responsible entity",
    "Suburb",
    "Street address",
    "Resident",
    "Mobile",
    "Email",
    "Registered",
    "Resolved",
    "Days open",
    "Next follow-up",
  ];
  const lines = rows.map((r) =>
    [
      r.tracking_number,
      r.municipal_reference_number,
      STATUS_INFO[r.status].label,
      PRIORITY_INFO[r.priority].label,
      r.service_categories?.name,
      r.issue_types?.name,
      r.municipal_entities?.name,
      r.suburbs?.name,
      r.street_address,
      r.contact_name,
      r.contact_mobile,
      r.contact_email,
      formatDate(r.submitted_at),
      formatDate(r.resolved_at),
      r.closed_at ? "" : daysSince(r.submitted_at),
      formatDate(r.next_follow_up_at),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n");
}

function ComplaintsPage() {
  const userId = useUserId();
  const navigate = Route.useNavigate();
  const { group: groupParam } = Route.useSearch();
  const group: GroupKey = groupParam ?? "active";
  const [category, setCategory] = useState("all");
  const [suburb, setSuburb] = useState("all");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const term = useDeferredValue(search).trim().toLowerCase();
  const complaints = useWardComplaints();
  const reference = useReferenceData();

  const rows = useMemo(() => complaints.data ?? [], [complaints.data]);
  const now = Date.now();

  const options = useMemo(() => {
    const cats = new Map<string, string>();
    const subs = new Map<string, string>();
    for (const r of rows) {
      if (r.service_categories) cats.set(r.service_categories.id, r.service_categories.name);
      if (r.suburbs) subs.set(r.suburbs.id, r.suburbs.name);
    }
    const sort = (m: Map<string, string>) => [...m].sort((a, b) => a[1].localeCompare(b[1]));
    return { categories: sort(cats), suburbs: sort(subs) };
  }, [rows]);

  const counts = useMemo(() => {
    const at = Date.now();
    return Object.fromEntries(
      GROUPS.map((g) => [
        g.key,
        rows.filter((r) => inGroup(g.key, r.status, isOverdue(r, at))).length,
      ]),
    ) as Record<GroupKey, number>;
  }, [rows]);

  const visible = rows.filter(
    (r) =>
      inGroup(group, r.status, isOverdue(r, now)) &&
      (category === "all" || r.service_categories?.id === category) &&
      (suburb === "all" || r.suburbs?.id === suburb) &&
      (!mine || r.assigned_admin_id === userId) &&
      (!term ||
        [r.tracking_number, r.municipal_reference_number, r.contact_name, r.street_address].some(
          (v) => v?.toLowerCase().includes(term),
        )),
  );

  async function exportCsv() {
    const wardId = reference.data?.ward.id;
    if (!wardId || !userId) return;
    setExporting(true);
    // Exports contain personal information, so each one is logged before the file is created.
    const { error } = await db.from("report_exports").insert({
      requested_by: userId,
      ward_id: wardId,
      report_type: "complaints_list",
      format: "csv",
      params: { group, category, suburb, mine, search: term },
      row_count: visible.length,
    });
    setExporting(false);
    if (error) return void toast.error(friendlyError(error));
    const blob = new Blob(["﻿" + toCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ward-109-complaints-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visible.length} complaints`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Ward management"
        title="Complaints"
        description="Every complaint registered in Ward 109. Open one to update its status, assign it, verify the municipal reference or add notes."
        actions={
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={exporting || visible.length === 0 || !reference.data}
          >
            {exporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Export CSV
          </Button>
        }
      />

      {complaints.isPending ? (
        <PageLoader />
      ) : complaints.isError ? (
        <Notice tone="error" className="mt-8" title="Complaints could not be loaded">
          {friendlyError(complaints.error)}
        </Notice>
      ) : (
        <div className="mt-6 rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => navigate({ search: { group: g.key }, replace: true })}
                  aria-pressed={group === g.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    group === g.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {g.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      group === g.key ? "bg-white/20" : "bg-muted",
                    )}
                  >
                    {counts[g.key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tracking/municipal reference, resident or street"
                  aria-label="Search complaints"
                  className="h-10 pl-9"
                />
              </div>
              <NativeSelect
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by service"
                className="md:w-48"
              >
                <option value="all">All services</option>
                {options.categories.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                aria-label="Filter by suburb"
                className="md:w-48"
              >
                <option value="all">All suburbs</option>
                {options.suburbs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={mine}
                  onChange={(e) => setMine(e.target.checked)}
                  className="size-4"
                />
                Assigned to me
              </label>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-14 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No complaints have been registered yet."
                : "No complaints match these filters."}
            </p>
          ) : (
            <>
              <ul className="divide-y md:hidden" aria-label="Complaints">
                {visible.map((r) => {
                  const overdue = isOverdue(r, now);
                  return (
                    <li key={r.id}>
                      <Link
                        to="/reports/$id"
                        params={{ id: r.id }}
                        className="block space-y-3 p-4 active:bg-muted/40"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-primary">
                            {r.tracking_number}
                          </span>
                          <StatusBadge status={r.status} />
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <div className="min-w-0 break-words">
                          <p className="font-semibold">
                            {r.issue_types?.name ?? r.service_categories?.name}
                          </p>
                          <p className="mt-1 text-sm">{r.contact_name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {[r.street_address, r.suburbs?.name].filter(Boolean).join(", ")}
                          </p>
                        </div>
                        <dl className="grid grid-cols-2 gap-3 text-sm">
                          <div className="min-w-0 break-words">
                            <dt className="text-muted-foreground">City reference</dt>
                            <dd className="mt-1 font-mono">
                              {r.municipal_reference_number ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Days open</dt>
                            <dd className="mt-1">
                              {r.closed_at ? "—" : daysSince(r.submitted_at)}
                            </dd>
                          </div>
                          <div className="col-span-2">
                            <dt className="text-muted-foreground">Next follow-up</dt>
                            <dd className={cn("mt-1", overdue && "font-semibold text-red-700")}>
                              {formatDate(r.next_follow_up_at)}
                              {overdue && " · Overdue"}
                            </dd>
                          </div>
                        </dl>
                        {r.assigned_admin_id === userId && (
                          <p className="text-sm font-medium text-teal">Assigned to you</p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Resident</th>
                      <th className="px-4 py-3">Issue</th>
                      <th className="px-4 py-3">Suburb</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3 text-right">Days open</th>
                      <th className="px-4 py-3">Next follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visible.map((r) => {
                      const overdue = isOverdue(r, now);
                      return (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Link
                              to="/reports/$id"
                              params={{ id: r.id }}
                              className="font-mono font-semibold whitespace-nowrap text-primary hover:underline"
                            >
                              {r.tracking_number}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">
                              {r.municipal_reference_number}
                              {r.reference_verified_at && (
                                <span className="ml-1 font-sans text-emerald-700">✓ verified</span>
                              )}
                            </p>
                            {r.is_demo && (
                              <span className="mt-1 inline-block rounded bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-700 uppercase">
                                Demo
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{r.contact_name}</p>
                            <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                              {r.street_address}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p>{r.issue_types?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.service_categories?.name}
                            </p>
                          </td>
                          <td className="px-4 py-3">{r.suburbs?.name}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={r.status} className="whitespace-nowrap" />
                            {r.assigned_admin_id === userId && (
                              <p className="mt-1 text-xs text-teal">Assigned to you</p>
                            )}
                            {r.reopened_count > 0 && (
                              <p className="mt-1 text-xs text-rose-700">
                                Reopened {r.reopened_count}×
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <PriorityBadge priority={r.priority} />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {r.closed_at ? "—" : daysSince(r.submitted_at)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 whitespace-nowrap",
                              overdue && "font-semibold text-red-700",
                            )}
                          >
                            {formatDate(r.next_follow_up_at)}
                            {overdue && <span className="block text-xs">Overdue</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {rows.length >= WARD_COMPLAINTS_LIMIT && (
            <p className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing the latest {WARD_COMPLAINTS_LIMIT} complaints.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
