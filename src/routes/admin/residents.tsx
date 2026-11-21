import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, MapPin, Search, UserPlus, Users } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { EmptyState, NativeSelect, Notice, PageHeader, StatCard } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Input } from "@/components/ui/input";
import { useWardComplaints } from "@/hooks/use-ward-complaints";
import { db, friendlyError } from "@/lib/db";
import { APP_NAME, OPEN_STATUSES, formatDate } from "@/lib/ward109";

export const Route = createFileRoute("/admin/residents")({
  head: () => ({ meta: [{ title: `Residents · ${APP_NAME}` }] }),
  component: ResidentsPage,
});

const DAY = 86_400_000;

function ResidentsPage() {
  const [search, setSearch] = useState("");
  const [suburb, setSuburb] = useState("all");
  const term = useDeferredValue(search).trim().toLowerCase();
  const complaints = useWardComplaints();

  const residents = useQuery({
    queryKey: ["admin", "residents"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Ward staff may read resident profiles to contact them about their complaints (row rules).
      const [profiles, roles] = await Promise.all([
        db
          .from("profiles")
          .select(
            "id, full_name, email, mobile, street_address, lives_in_ward, created_at, is_demo, suburbs(name)",
          )
          .order("created_at", { ascending: false })
          .limit(2000),
        db.from("user_roles").select("user_id"),
      ]);
      if (profiles.error) throw profiles.error;
      if (roles.error) throw roles.error;
      return {
        profiles: profiles.data,
        staffIds: new Set(roles.data.map((r) => r.user_id)),
      };
    },
  });

  const perResident = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    for (const c of complaints.data ?? []) {
      const entry = map.get(c.resident_id) ?? { total: 0, open: 0 };
      entry.total++;
      if (OPEN_STATUSES.includes(c.status)) entry.open++;
      map.set(c.resident_id, entry);
    }
    return map;
  }, [complaints.data]);

  const people = useMemo(
    () =>
      (residents.data?.profiles ?? []).filter(
        (p) => !p.is_demo && !residents.data?.staffIds.has(p.id),
      ),
    [residents.data],
  );
  const suburbs = useMemo(
    () => [...new Set(people.map((p) => p.suburbs?.name).filter(Boolean) as string[])].sort(),
    [people],
  );
  const stats = useMemo(() => {
    const at = Date.now();
    return {
      total: people.length,
      inWard: people.filter((p) => p.lives_in_ward).length,
      newThisMonth: people.filter((p) => at - new Date(p.created_at).getTime() < 30 * DAY).length,
      reporting: people.filter((p) => perResident.has(p.id)).length,
    };
  }, [people, perResident]);

  const visible = people.filter(
    (p) =>
      (suburb === "all" || (suburb === "none" ? !p.suburbs : p.suburbs?.name === suburb)) &&
      (!term ||
        [p.full_name, p.email, p.mobile, p.street_address].some((v) =>
          v?.toLowerCase().includes(term),
        )),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Ward management"
        title="Residents"
        description="People registered on the platform. Staff accounts and demo records are not listed."
      />

      <Notice tone="info" className="mt-6">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Lock className="size-3.5" /> Personal information.
        </span>{" "}
        Use these details only to handle residents' complaints, as set out in the privacy notice
        (POPIA). Do not share or export them for other purposes.
      </Notice>

      {residents.isPending ? (
        <PageLoader />
      ) : residents.isError ? (
        <Notice tone="error" className="mt-6" title="Residents could not be loaded">
          {friendlyError(residents.error)}
        </Notice>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Registered residents" value={stats.total} icon={Users} />
            <StatCard label="Live in Ward 109" value={stats.inWard} icon={MapPin} tone="teal" />
            <StatCard
              label="New (30 days)"
              value={stats.newThisMonth}
              icon={UserPlus}
              tone="green"
            />
            <StatCard
              label="Have reported a fault"
              value={stats.reporting}
              icon={Users}
              tone="amber"
            />
          </div>

          {people.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={Users}
                title="No residents yet"
                description="Residents appear here once they create an account."
              />
            </div>
          ) : (
            <div className="mt-6 rounded-xl border bg-card shadow-sm">
              <div className="flex flex-col gap-2 border-b p-4 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email, phone or street"
                    aria-label="Search residents"
                    className="h-10 pl-9"
                  />
                </div>
                <NativeSelect
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  aria-label="Filter by suburb"
                  className="md:w-56"
                >
                  <option value="all">All suburbs</option>
                  {suburbs.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="none">No suburb / outside the ward</option>
                </NativeSelect>
              </div>
              {visible.length === 0 ? (
                <p className="px-4 py-14 text-center text-sm text-muted-foreground">
                  No residents match these filters.
                </p>
              ) : (
                <>
                  <ul className="divide-y md:hidden" aria-label="Residents">
                    {visible.map((p) => {
                      const counts = perResident.get(p.id);
                      return (
                        <li key={p.id} className="space-y-3 p-4">
                          <p className="break-words font-semibold">{p.full_name ?? "Resident"}</p>
                          <div className="flex min-w-0 flex-col items-start text-sm">
                            {p.email && (
                              <a
                                href={`mailto:${p.email}`}
                                className="inline-flex min-h-11 max-w-full items-center break-all text-teal underline-offset-2 hover:underline"
                              >
                                {p.email}
                              </a>
                            )}
                            {p.mobile && (
                              <a
                                href={`tel:${p.mobile.replace(/[^\d+]/g, "")}`}
                                className="inline-flex min-h-11 items-center text-teal underline-offset-2 hover:underline"
                              >
                                {p.mobile}
                              </a>
                            )}
                          </div>
                          <p className="break-words text-sm text-muted-foreground">
                            {[
                              p.street_address,
                              p.suburbs?.name ??
                                (p.lives_in_ward === false ? "Outside Ward 109" : null),
                            ]
                              .filter(Boolean)
                              .join(", ") || "Location not provided"}
                          </p>
                          <dl className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <dt className="text-muted-foreground">Complaints</dt>
                              <dd className="mt-1 font-medium">
                                {counts?.total ?? 0}
                                {counts?.open ? ` · ${counts.open} open` : ""}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">Joined</dt>
                              <dd className="mt-1">{formatDate(p.created_at)}</dd>
                            </div>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        <tr>
                          <th className="px-4 py-3">Resident</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3 text-right">Complaints</th>
                          <th className="px-4 py-3">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visible.map((p) => {
                          const c = perResident.get(p.id);
                          return (
                            <tr key={p.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-medium">
                                {p.full_name ?? <span className="text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                <p>{p.email}</p>
                                {p.mobile && (
                                  <p className="text-xs text-muted-foreground">{p.mobile}</p>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <p>
                                  {p.suburbs?.name ??
                                    (p.lives_in_ward === false ? "Outside Ward 109" : "—")}
                                </p>
                                {p.street_address && (
                                  <p className="max-w-[240px] truncate text-xs text-muted-foreground">
                                    {p.street_address}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {c ? (
                                  <>
                                    <span className="font-semibold">{c.total}</span>
                                    {c.open > 0 && (
                                      <span className="block text-xs text-teal">{c.open} open</span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {formatDate(p.created_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
