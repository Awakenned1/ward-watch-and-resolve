import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Loader2, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Field, Notice, PageHeader, SectionCard } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoles, useUserId } from "@/hooks/use-auth";
import { useReferenceData } from "@/hooks/use-reference-data";
import { db, friendlyError } from "@/lib/db";
import type { Enums } from "@/lib/db-types";
import { APP_NAME, formatDate } from "@/lib/ward109";

export const Route = createFileRoute("/admin/team")({
  head: () => ({ meta: [{ title: `Team & access · ${APP_NAME}` }] }),
  component: TeamPage,
});

type Role = Enums<"app_role">;
const ROLE_LABEL: Record<Role, string> = {
  resident: "Resident",
  ward_admin: "Ward administrator",
  councillor: "Ward Councillor",
  municipal_liaison: "Municipal liaison",
  super_admin: "System administrator",
};

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

type Row = {
  key: string;
  name: string | null;
  email: string;
  role: Role;
  entity: string | null;
  since: string;
  pending: boolean;
  grantId: string | null;
};

function TeamPage() {
  const userId = useUserId();
  const { isCouncillor, isSuperAdmin } = useRoles();
  const reference = useReferenceData();
  const queryClient = useQueryClient();
  const canManage = isCouncillor || isSuperAdmin;
  const [removing, setRemoving] = useState<Row | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const team = useQuery({
    queryKey: ["admin", "team"],
    queryFn: async () => {
      const [roles, grants] = await Promise.all([
        db
          .from("user_roles")
          .select("id, user_id, role, created_at, municipal_entities(name)")
          .order("created_at"),
        // Councillors see ward administrator invitations; super admins see all (row rules).
        db.from("role_email_grants").select("id, email, role, created_at").order("created_at"),
      ]);
      if (roles.error) throw roles.error;
      if (grants.error) throw grants.error;
      const ids = [...new Set(roles.data.map((r) => r.user_id))];
      const profiles = ids.length
        ? await db.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const byId = new Map(profiles.data.map((p) => [p.id, p]));

      const rows: Row[] = [];
      const seen = new Set<string>();
      for (const r of roles.data) {
        const p = byId.get(r.user_id);
        const email = p?.email?.toLowerCase() ?? "";
        const grant = grants.data.find((g) => g.email === email && g.role === r.role);
        seen.add(`${email}|${r.role}`);
        rows.push({
          key: r.id,
          name: p?.full_name ?? null,
          email: p?.email ?? "—",
          role: r.role,
          entity: r.municipal_entities?.name ?? null,
          since: r.created_at,
          pending: false,
          grantId: grant?.id ?? null,
        });
      }
      for (const g of grants.data) {
        if (seen.has(`${g.email}|${g.role}`)) continue;
        rows.push({
          key: g.id,
          name: null,
          email: g.email,
          role: g.role,
          entity: null,
          since: g.created_at,
          pending: true,
          grantId: g.id,
        });
      }
      const order: Role[] = ["councillor", "ward_admin", "municipal_liaison", "super_admin"];
      return rows.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    },
  });

  const remove = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await db.from("role_email_grants").delete().eq("id", grantId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Access removed");
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const parsed = emailSchema.safeParse(new FormData(formEl).get("email"));
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    const wardId = reference.data?.ward.id;
    if (!wardId || !userId) return;
    setError(undefined);
    setBusy(true);
    const { error } = await db.from("role_email_grants").insert({
      email: parsed.data,
      role: "ward_admin",
      ward_id: wardId,
      created_by: userId,
    });
    setBusy(false);
    if (error) {
      return setError(
        /duplicate key/i.test(error.message)
          ? "This email already has ward administrator access."
          : friendlyError(error),
      );
    }
    formEl.reset();
    toast.success(`${parsed.data} added as a ward administrator`);
    await queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
  }

  const canRemove = (r: Row) =>
    !!r.grantId && (isSuperAdmin || (isCouncillor && r.role === "ward_admin"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ward management"
        title="Team & access"
        description="Who can see and manage Ward 109 complaints. Access is linked to a verified email address."
      />

      {canManage && (
        <SectionCard
          title="Add a ward administrator"
          description="Administrators can review and update complaints, post updates and see residents' details."
        >
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={onInvite}
            noValidate
          >
            <Field id="invite-email" label="Email address" error={error} className="flex-1">
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                aria-invalid={!!error}
              />
            </Field>
            <Button type="submit" className="sm:mt-[26px]" disabled={busy || !reference.data}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Add administrator
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            They then create an account on {APP_NAME} with this exact email address and confirm it.
            Access is granted automatically once the email is confirmed, and removed as soon as you
            remove it here.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Ward office team" className="[&>div:last-child]:p-0">
        {team.isPending ? (
          <PageLoader />
        ) : team.isError ? (
          <div className="p-5">
            <Notice tone="error" title="The team could not be loaded">
              {friendlyError(team.error)}
            </Notice>
          </div>
        ) : (
          <ul className="divide-y">
            {team.data.map((r) => (
              <li key={r.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-primary">
                  {(r.name ?? r.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name ?? r.email}</p>
                  {r.name && <p className="truncate text-sm text-muted-foreground">{r.email}</p>}
                </div>
                <div className="min-w-0 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-semibold text-primary">
                    <ShieldCheck className="size-3.5" /> {ROLE_LABEL[r.role]}
                    {r.entity ? ` · ${r.entity}` : ""}
                  </span>
                  {r.pending ? (
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 ring-1 ring-amber-200 ring-inset">
                      <Clock className="size-3.5 shrink-0" /> Waiting for sign-up / email
                      confirmation
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Since {formatDate(r.since)}</span>
                  )}
                  {canRemove(r) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoving(r)}
                      aria-label={`Remove ${r.email}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.email} will immediately lose {removing ? ROLE_LABEL[removing.role] : ""}{" "}
              access. Their resident account stays active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (removing?.grantId) remove.mutate(removing.grantId);
              }}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />} Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
