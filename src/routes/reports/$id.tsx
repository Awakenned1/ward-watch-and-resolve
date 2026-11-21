import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  Lock,
  Megaphone,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  Field,
  NativeSelect,
  Notice,
  PriorityBadge,
  SectionCard,
  StatusBadge,
} from "@/components/app-ui";
import { PageLoader, RequireAuth } from "@/components/site-layout";
import { TicketConversation } from "@/components/ticket-conversation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRoles, useUserId } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import type { Enums } from "@/lib/db-types";
import {
  prepareEvidence,
  signedEvidenceUrls,
  uploadEvidence,
  validateEvidence,
} from "@/lib/evidence";
import {
  APP_NAME,
  EVIDENCE,
  STAFF_STATUS_OPTIONS,
  STATUS_INFO,
  daysSince,
  formatDate,
  formatDateTime,
  type ComplaintStatus,
} from "@/lib/ward109";

export const Route = createFileRoute("/reports/$id")({
  validateSearch: z.object({ submitted: z.boolean().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: `Complaint · ${APP_NAME}` }] }),
  component: () => (
    <RequireAuth>
      <ComplaintPage />
    </RequireAuth>
  ),
});

const COMPLAINT_SELECT =
  "*, suburbs(name, coverage), service_categories(name, slug), issue_types(name), municipal_entities(name, contact_type, contact_value)";

function useComplaintData(id: string, isStaff: boolean) {
  const complaint = useQuery({
    queryKey: ["complaints", "detail", id],
    refetchInterval: 30_000,
    queryFn: async () => {
      // Row rules return nothing unless the viewer owns the complaint, is ward staff or its liaison.
      const { data, error } = await db
        .from("complaints")
        .select(COMPLAINT_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const related = useQuery({
    queryKey: ["complaints", "related", id, isStaff],
    enabled: !!complaint.data,
    queryFn: async () => {
      const [history, attachments, responses, escalations, notes] = await Promise.all([
        db
          .from("complaint_status_history")
          .select("id, from_status, to_status, note, is_public, created_at")
          .eq("complaint_id", id)
          .order("created_at"),
        db
          .from("complaint_attachments")
          .select("id, storage_path, file_name, mime_type, kind, created_at")
          .eq("complaint_id", id)
          .order("created_at"),
        db
          .from("municipal_responses")
          .select(
            "id, summary, channel, responded_at, is_verified, needs_more_info, visible_to_resident",
          )
          .eq("complaint_id", id)
          .order("responded_at"),
        db
          .from("escalations")
          .select("id, reason, additional_info, is_urgent_safety, stage, created_at, closed_at")
          .eq("complaint_id", id)
          .order("created_at", { ascending: false }),
        isStaff
          ? db
              .from("internal_notes")
              .select("id, body, created_at, author_id")
              .eq("complaint_id", id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [history, attachments, responses, escalations, notes])
        if (r.error) throw r.error;
      const urls = await signedEvidenceUrls(attachments.data!.map((a) => a.storage_path)).catch(
        () => new Map<string, string>(),
      );
      return {
        history: history.data!,
        attachments: attachments.data!.map((a) => ({
          ...a,
          url: urls.get(a.storage_path) ?? null,
        })),
        responses: responses.data!,
        escalations: escalations.data!,
        notes: notes.data ?? [],
      };
    },
    // Signed links last 10 minutes.
    staleTime: 8 * 60 * 1000,
    refetchInterval: 30_000,
  });
  return { complaint, related };
}

function ComplaintPage() {
  const userId = useUserId();
  const { id } = Route.useParams();
  const { submitted } = Route.useSearch();
  const { isStaff } = useRoles();
  const { complaint, related } = useComplaintData(id, isStaff);

  if (complaint.isPending) return <PageLoader />;
  if (complaint.isError || !complaint.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Notice tone="warning" title="Complaint not found">
          {complaint.error
            ? friendlyError(complaint.error)
            : "It doesn't exist, or you don't have access to it."}
        </Notice>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/reports">Back to my complaints</Link>
        </Button>
      </div>
    );
  }
  const c = complaint.data;
  if (c.status === "draft") return <Navigate to="/report" search={{ draft: c.id }} replace />;

  const r = related.data;
  const openEscalation = r?.escalations.find((e) => !["closed", "declined"].includes(e.stage));
  const daysOpen = daysSince(c.submitted_at);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to={isStaff ? "/admin/complaints" : "/reports"}>
          <ArrowLeft className="size-4" /> {isStaff ? "All complaints" : "My complaints"}
        </Link>
      </Button>

      {submitted && (
        <Notice
          tone="success"
          className="mt-4"
          title="Your complaint has been registered successfully."
        >
          Your Ward 109 tracking number is{" "}
          <strong className="font-mono">{c.tracking_number}</strong>. Keep it for your records.
          We'll notify you when it is updated.
        </Notice>
      )}

      <div className="mt-4 flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">
            Tracking number
          </p>
          <h1 className="mt-1 font-mono text-2xl font-bold sm:text-3xl">{c.tracking_number}</h1>
          <p className="mt-1 text-muted-foreground">
            {c.issue_types?.name} · {c.service_categories?.name}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} className="text-sm" />
            <PriorityBadge priority={c.priority} />
            {c.reopened_count > 0 && (
              <span className="text-xs text-muted-foreground">Reopened {c.reopened_count}×</span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{STATUS_INFO[c.status].description}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:text-right">
          <Meta label="Submitted">{formatDate(c.submitted_at)}</Meta>
          <Meta label="Last updated">{formatDateTime(c.last_updated_at)}</Meta>
          <Meta label="Days open">{c.closed_at ? "—" : (daysOpen ?? "—")}</Meta>
          <Meta label="Next follow-up">{formatDate(c.next_follow_up_at)}</Meta>
        </dl>
      </div>

      {!isStaff && r && (
        <ResidentActions
          complaintId={c.id}
          status={c.status}
          hasReference={!!c.municipal_reference_number}
          hasOpenEscalation={!!openEscalation}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {(isStaff || c.resident_id === userId) && (
            <TicketConversation id={c.id} closed={c.status === "closed"} />
          )}
          <SectionCard title="Complaint details">
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Detail label="Resident">{c.contact_name}</Detail>
              <Detail label="Contact">
                <a
                  href={`tel:${c.contact_mobile}`}
                  className="inline-flex min-h-11 items-center text-teal hover:underline"
                >
                  {c.contact_mobile}
                </a>
                {c.contact_email && (
                  <span className="block text-muted-foreground">{c.contact_email}</span>
                )}
              </Detail>
              <Detail label="Location" wide>
                {c.street_address}
                {c.suburbs?.name && `, ${c.suburbs.name}`}
                {c.landmark && (
                  <span className="block text-muted-foreground">Near {c.landmark}</span>
                )}
                {c.latitude != null && c.longitude != null && (
                  <a
                    className="mt-1 inline-block text-teal hover:underline"
                    href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=18/${c.latitude}/${c.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View pinned location
                  </a>
                )}
              </Detail>
              <Detail label="Municipal entity">{c.municipal_entities?.name ?? "—"}</Detail>
              <Detail label="Official municipal reference">
                <span className="font-mono">{c.municipal_reference_number}</span>
                {c.reference_verified_at && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="size-3.5" /> Verified
                  </span>
                )}
              </Detail>
              <Detail label="Logged with municipality">
                {formatDateTime(c.municipal_logged_at)}
              </Detail>
              <Detail label="Issue started">{formatDate(c.issue_started_on)}</Detail>
              <Detail label="Description" wide>
                <p className="whitespace-pre-wrap">{c.description}</p>
              </Detail>
            </dl>
          </SectionCard>

          <SectionCard
            title="Evidence"
            description={`${r?.attachments.length ?? 0} of ${EVIDENCE.maxFiles} files`}
            actions={
              !isStaff && r && c.status !== "closed" && r.attachments.length < EVIDENCE.maxFiles ? (
                <AddEvidenceButton
                  complaintId={c.id}
                  remaining={EVIDENCE.maxFiles - r.attachments.length}
                />
              ) : null
            }
          >
            {!r ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : r.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos or documents attached.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group block aspect-square overflow-hidden rounded-lg border bg-muted"
                    >
                      {a.mime_type.startsWith("image/") && a.url ? (
                        <img
                          src={a.url}
                          alt={a.file_name}
                          loading="lazy"
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <span className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                          <FileText className="size-8 text-muted-foreground" />
                          <span className="line-clamp-2 text-xs break-all">{a.file_name}</span>
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {r && r.responses.length > 0 && (
            <SectionCard title="Municipal feedback">
              <ul className="space-y-4">
                {r.responses.map((m) => (
                  <li key={m.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDateTime(m.responded_at)}</span>
                      {m.is_verified ? (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                          <ShieldCheck className="size-3.5" /> Verified by municipal liaison
                        </span>
                      ) : (
                        <span>Recorded by the ward office</span>
                      )}
                      {m.needs_more_info && (
                        <span className="font-medium text-amber-700">More information needed</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap">{m.summary}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          {isStaff && r && (
            <StaffPanel
              complaint={c}
              notes={r.notes}
              openEscalationId={openEscalation?.id ?? null}
            />
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <SectionCard title="Progress">
            {!r ? (
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            ) : (
              <ol className="relative space-y-5 border-l-2 border-secondary pl-5">
                {r.history.map((h, i) => (
                  <li key={h.id} className="relative">
                    <span
                      className={
                        "absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-card " +
                        (i === r.history.length - 1 ? "bg-teal" : "bg-slate-300")
                      }
                    />
                    <p className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={h.to_status} />
                      {!h.is_public && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" /> Internal
                        </span>
                      )}
                    </div>
                    {h.note && <p className="mt-1.5 text-sm whitespace-pre-wrap">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {r && r.escalations.length > 0 && (
            <SectionCard title="Escalations">
              <ul className="space-y-3 text-sm">
                {r.escalations.map((e) => (
                  <li key={e.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{e.stage.replaceAll("_", " ")}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(e.created_at)}
                      </span>
                    </div>
                    {e.is_urgent_safety && (
                      <span className="mt-1 inline-block text-xs font-semibold text-red-700">
                        Urgent safety review
                      </span>
                    )}
                    <p className="mt-1 text-muted-foreground">{e.reason}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div
      className={
        wide ? "min-w-0 [overflow-wrap:anywhere] sm:col-span-2" : "min-w-0 [overflow-wrap:anywhere]"
      }
    >
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}

function useInvalidate(complaintId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["complaints", "detail", complaintId] }),
      queryClient.invalidateQueries({ queryKey: ["complaints", "related", complaintId] }),
      queryClient.invalidateQueries({ queryKey: ["complaints", "mine"] }),
      queryClient.invalidateQueries({ queryKey: ["complaints", "all"] }),
    ]);
}

function ResidentActions({
  complaintId,
  status,
  hasReference,
  hasOpenEscalation,
}: {
  complaintId: string;
  status: ComplaintStatus;
  hasReference: boolean;
  hasOpenEscalation: boolean;
}) {
  const invalidate = useInvalidate(complaintId);
  const [dialog, setDialog] = useState<null | "escalate" | "reopen">(null);

  const confirm = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("confirm_resolution", { _complaint: complaintId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Thank you. The complaint is now closed.");
      await invalidate();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const canEscalate =
    hasReference &&
    !hasOpenEscalation &&
    !["resolved", "closed", "resolution_reported"].includes(status);
  const awaitingConfirmation = status === "resolution_reported" || status === "resolved";
  const canReopen = ["resolution_reported", "resolved", "closed"].includes(status);

  if (!canEscalate && !awaitingConfirmation && !canReopen) return null;

  return (
    <>
      {awaitingConfirmation && (
        <Notice tone="success" className="mt-4" title="A resolution has been reported">
          Please check whether the fault has been fixed and confirm, or reopen it if it hasn't.
        </Notice>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {awaitingConfirmation && (
          <Button
            onClick={() => confirm.mutate()}
            disabled={confirm.isPending}
            className="bg-success hover:bg-success/90"
          >
            {confirm.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Confirm it's resolved
          </Button>
        )}
        {canReopen && (
          <Button variant="outline" onClick={() => setDialog("reopen")}>
            <RotateCcw className="size-4" />{" "}
            {awaitingConfirmation ? "It's not fixed" : "Reopen complaint"}
          </Button>
        )}
        {canEscalate && (
          <Button variant="outline" onClick={() => setDialog("escalate")}>
            <Megaphone className="size-4" /> Request escalation
          </Button>
        )}
      </div>
      <EscalateDialog
        open={dialog === "escalate"}
        onOpenChange={(o) => setDialog(o ? "escalate" : null)}
        complaintId={complaintId}
        onDone={invalidate}
      />
      <ReopenDialog
        open={dialog === "reopen"}
        onOpenChange={(o) => setDialog(o ? "reopen" : null)}
        complaintId={complaintId}
        onDone={invalidate}
      />
    </>
  );
}

function EscalateDialog({
  open,
  onOpenChange,
  complaintId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaintId: string;
  onDone: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const escalate = useMutation({
    mutationFn: async (v: { reason: string; info: string; urgent: boolean }) => {
      const { error } = await db.rpc("request_escalation", {
        _complaint: complaintId,
        _reason: v.reason,
        ...(v.info ? { _additional_info: v.info } : {}),
        _urgent_safety: v.urgent,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Escalation requested", { description: "The ward office will review it." });
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    if (reason.length < 10)
      return setError("Explain why you are escalating (at least 10 characters).");
    setError(null);
    escalate.mutate({
      reason,
      info: String(form.get("info") ?? "").trim(),
      urgent: form.get("urgent") === "on",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request councillor escalation</DialogTitle>
          <DialogDescription>
            Use this if the municipal entity has not resolved the fault within its turnaround time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field id="reason" label="Reason for escalation">
            <Textarea
              id="reason"
              name="reason"
              rows={4}
              maxLength={2000}
              placeholder="e.g. Logged 3 weeks ago and still not repaired; follow-ups unanswered."
            />
          </Field>
          <Field id="info" label="Additional information" optional>
            <Textarea id="info" name="info" rows={3} maxLength={4000} />
          </Field>
          <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            <input
              type="checkbox"
              name="urgent"
              className="mt-0.5 size-4 accent-[var(--destructive)]"
            />
            <span>
              <strong>Urgent safety risk</strong> (e.g. exposed cables, open manhole). For
              life-threatening emergencies call 10111 or 112.
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={escalate.isPending}>
              {escalate.isPending && <Loader2 className="size-4 animate-spin" />}
              Request escalation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({
  open,
  onOpenChange,
  complaintId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  complaintId: string;
  onDone: () => Promise<unknown>;
}) {
  const [error, setError] = useState<string | null>(null);
  const reopen = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await db.rpc("reopen_complaint", {
        _complaint: complaintId,
        _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Complaint reopened", { description: "The ward office will follow up." });
      onOpenChange(false);
      await onDone();
    },
    onError: (e) => setError(friendlyError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this complaint</DialogTitle>
          <DialogDescription>Tell the ward office what is still wrong.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
            if (reason.length < 10) return setError("Please explain (at least 10 characters).");
            setError(null);
            reopen.mutate(reason);
          }}
        >
          <Field id="reopen-reason" label="What is still wrong?">
            <Textarea id="reopen-reason" name="reason" rows={4} maxLength={1900} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reopen.isPending}>
              {reopen.isPending && <Loader2 className="size-4 animate-spin" />}
              Reopen complaint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddEvidenceButton({ complaintId, remaining }: { complaintId: string; remaining: number }) {
  const userId = useUserId()!;
  const invalidate = useInvalidate(complaintId);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    let added = 0;
    for (const file of Array.from(files).slice(0, remaining)) {
      const problem = validateEvidence(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      try {
        await uploadEvidence(complaintId, userId, await prepareEvidence(file));
        added++;
      } catch (e) {
        toast.error(friendlyError(e));
      }
    }
    setBusy(false);
    if (added) {
      toast.success(added === 1 ? "File added" : `${added} files added`);
      await invalidate();
    }
  }

  return (
    <Button asChild variant="outline" size="sm" disabled={busy}>
      <label className="cursor-pointer">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
        Add photos
        <input
          type="file"
          multiple
          accept={EVIDENCE.accept}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    </Button>
  );
}

// A staff action: runs the call, reports the outcome, and refreshes the complaint.
function useStaffAction(
  label: string,
  invalidate: () => Promise<unknown>,
  fn: () => PromiseLike<{ error: unknown }>,
) {
  return useMutation({
    mutationFn: async () => {
      const { error } = await fn();
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(label);
      await invalidate();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
}

type StaffComplaint = {
  id: string;
  status: ComplaintStatus;
  assigned_admin_id: string | null;
  reference_verified_at: string | null;
};

const ESCALATION_STAGES: { value: Enums<"escalation_stage">; label: string }[] = [
  { value: "admin_review", label: "Under admin review" },
  { value: "with_councillor", label: "Escalate to councillor" },
  { value: "with_liaison", label: "Refer to municipal liaison" },
  { value: "declined", label: "Decline escalation" },
  { value: "closed", label: "Close escalation" },
];

function StaffPanel({
  complaint: c,
  notes,
  openEscalationId,
}: {
  complaint: StaffComplaint;
  notes: { id: string; body: string; created_at: string }[];
  openEscalationId: string | null;
}) {
  const userId = useUserId()!;
  const invalidate = useInvalidate(c.id);
  const [status, setStatus] = useState<ComplaintStatus>(c.status);
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [internal, setInternal] = useState("");
  const [stage, setStage] = useState<Enums<"escalation_stage">>("admin_review");

  const changeStatus = useStaffAction("Status updated", invalidate, async () => {
    const res = await db.rpc("change_complaint_status", {
      _complaint: c.id,
      _status: status,
      ...(note.trim() ? { _note: note.trim() } : {}),
      _public: isPublic,
    });
    if (!res.error) setNote("");
    return res;
  });
  const assignToMe = useStaffAction("Assigned to you", invalidate, async () =>
    db.rpc("assign_complaint", { _complaint: c.id, _admin: userId }),
  );
  const verifyReference = useStaffAction("Reference marked as verified", invalidate, async () =>
    db
      .from("complaints")
      .update({ reference_verified_at: new Date().toISOString(), reference_verified_by: userId })
      .eq("id", c.id),
  );
  const addNote = useStaffAction("Internal note added", invalidate, async () => {
    const res = await db
      .from("internal_notes")
      .insert({ complaint_id: c.id, author_id: userId, body: internal.trim() });
    if (!res.error) setInternal("");
    return res;
  });
  const advance = useStaffAction("Escalation updated", invalidate, async () =>
    db.rpc("advance_escalation", { _escalation: openEscalationId!, _stage: stage }),
  );

  return (
    <section className="rounded-xl border-2 border-primary/20 bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-secondary/60 px-5 py-3">
        <Lock className="size-4 text-primary" />
        <h2 className="font-semibold">Ward administration</h2>
        <span className="text-xs text-muted-foreground">Not visible to the resident</span>
      </div>
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => assignToMe.mutate()}
            disabled={assignToMe.isPending || c.assigned_admin_id === userId}
          >
            <UserCheck className="size-4" />{" "}
            {c.assigned_admin_id === userId ? "Assigned to you" : "Assign to me"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => verifyReference.mutate()}
            disabled={verifyReference.isPending || !!c.reference_verified_at}
          >
            <ShieldCheck className="size-4" />{" "}
            {c.reference_verified_at ? "Reference verified" : "Mark reference verified"}
          </Button>
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (status === c.status) {
              toast.error("Choose a different status.");
              return;
            }
            changeStatus.mutate();
          }}
        >
          <h3 className="text-sm font-semibold">Update status</h3>
          <NativeSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
            aria-label="New status"
          >
            {STAFF_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_INFO[s].label}
              </option>
            ))}
          </NativeSelect>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Note for the timeline (e.g. Followed up with JRA depot; crew booked for Thursday)"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4"
            />
            Show this note to the resident
          </label>
          <Button type="submit" size="sm" disabled={changeStatus.isPending}>
            {changeStatus.isPending && <Loader2 className="size-4 animate-spin" />}
            Save status
          </Button>
        </form>

        {openEscalationId && (
          <div className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-semibold">Escalation</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <NativeSelect
                value={stage}
                onChange={(e) => setStage(e.target.value as Enums<"escalation_stage">)}
                aria-label="Escalation stage"
              >
                {ESCALATION_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
              <Button
                size="sm"
                className="sm:h-10"
                onClick={() => advance.mutate()}
                disabled={advance.isPending}
              >
                Update escalation
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">Internal notes</h3>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!internal.trim()) return;
              addNote.mutate();
            }}
          >
            <Textarea
              value={internal}
              onChange={(e) => setInternal(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="Only ward staff can see internal notes"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="self-start"
              disabled={addNote.isPending || !internal.trim()}
            >
              Add note
            </Button>
          </form>
          {notes.length > 0 && (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md bg-muted/60 p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
