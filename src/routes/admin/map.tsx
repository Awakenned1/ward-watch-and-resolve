import { createFileRoute } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";
import { useMemo, useState } from "react";

import { NativeSelect, Notice, PageHeader } from "@/components/app-ui";
import { ComplaintMap, MapLegend } from "@/components/complaint-map";
import { PageLoader } from "@/components/site-layout";
import { toMapPoints, useWardComplaints } from "@/hooks/use-ward-complaints";
import { friendlyError } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  APP_NAME,
  DONE_STATUSES,
  ESCALATED_STATUSES,
  OPEN_STATUSES,
  WARD_BOUNDARY,
} from "@/lib/ward109";

export const Route = createFileRoute("/admin/map")({
  head: () => ({ meta: [{ title: `Ward map · ${APP_NAME}` }] }),
  component: MapPage,
});

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "escalated", label: "Escalated" },
  { key: "done", label: "Resolved & closed" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function MapPage() {
  const complaints = useWardComplaints();
  const [filter, setFilter] = useState<FilterKey>("open");
  const [category, setCategory] = useState("all");

  const rows = useMemo(() => complaints.data ?? [], [complaints.data]);
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows)
      if (r.service_categories) map.set(r.service_categories.id, r.service_categories.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = rows.filter(
    (r) =>
      (filter === "all" ||
        (filter === "open" && OPEN_STATUSES.includes(r.status)) ||
        (filter === "escalated" && ESCALATED_STATUSES.includes(r.status)) ||
        (filter === "done" && DONE_STATUSES.includes(r.status))) &&
      (category === "all" || r.service_categories?.id === category),
  );
  const points = toMapPoints(filtered);
  const unpinned = filtered.length - points.length;

  const bySuburb = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const name = r.suburbs?.name ?? "Not specified";
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  return (
    <div>
      <PageHeader
        eyebrow="Ward management"
        title="Ward map"
        description="Complaints residents pinned on the map, inside the official Ward 109 boundary."
      />

      {complaints.isPending ? (
        <PageLoader />
      ) : complaints.isError ? (
        <Notice tone="error" className="mt-8" title="Complaints could not be loaded">
          {friendlyError(complaints.error)}
        </Notice>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
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
              <NativeSelect
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Filter by service"
                className="md:w-56"
              >
                <option value="all">All services</option>
                {categories.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <ComplaintMap points={points} className="h-[520px] lg:h-[620px]" />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <MapLegend />
              <p className="text-xs text-muted-foreground">
                Boundary: {WARD_BOUNDARY.source}, effective {WARD_BOUNDARY.effectiveDate}.
              </p>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm font-medium text-muted-foreground">Shown on the map</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{points.length}</p>
              {unpinned > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <MapPinOff className="mt-0.5 size-3.5 shrink-0" />
                  {unpinned} more {unpinned === 1 ? "complaint has" : "complaints have"} an address
                  but no map pin.
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-card shadow-sm">
              <p className="border-b px-5 py-3 text-sm font-semibold">By suburb</p>
              {bySuburb.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                  No complaints match.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {bySuburb.map(([name, count]) => (
                    <li key={name} className="flex justify-between px-5 py-2.5">
                      <span>{name}</span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
