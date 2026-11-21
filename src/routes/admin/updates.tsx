import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, CalendarDays, Loader2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, Field, NativeSelect, Notice, PageHeader } from "@/components/app-ui";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUserId } from "@/hooks/use-auth";
import { useReferenceData } from "@/hooks/use-reference-data";
import { db, friendlyError } from "@/lib/db";
import type { Enums, Tables } from "@/lib/db-types";
import { cn } from "@/lib/utils";
import { ANNOUNCEMENT_KINDS, APP_NAME, formatDate, formatDateTime } from "@/lib/ward109";

export const Route = createFileRoute("/admin/updates")({
  head: () => ({ meta: [{ title: `Ward updates · ${APP_NAME}` }] }),
  component: UpdatesAdminPage,
});

type Announcement = Pick<
  Tables<"announcements">,
  | "id"
  | "kind"
  | "source"
  | "source_reference"
  | "title"
  | "body"
  | "starts_at"
  | "ends_at"
  | "is_published"
  | "published_at"
  | "created_at"
>;

const schema = z
  .object({
    kind: z.enum(
      Object.keys(ANNOUNCEMENT_KINDS) as [
        Enums<"announcement_kind">,
        ...Enums<"announcement_kind">[],
      ],
    ),
    source: z.enum(["ward_update", "official_verified"]),
    source_reference: z.string().trim().max(200, "Keep the source under 200 characters"),
    title: z.string().trim().min(3, "Add a title").max(160, "Keep the title under 160 characters"),
    body: z
      .string()
      .trim()
      .min(3, "Write the update")
      .max(6000, "Keep the update under 6000 characters"),
    starts_at: z.string(),
    ends_at: z.string(),
    is_published: z.boolean(),
  })
  .refine((v) => v.source === "ward_update" || v.source_reference.length > 0, {
    path: ["source_reference"],
    message: "Say where the official notice came from",
  })
  .refine((v) => !v.starts_at || !v.ends_at || v.ends_at >= v.starts_at, {
    path: ["ends_at"],
    message: "The end must be after the start",
  });
type FormValues = z.infer<typeof schema>;
type Errors = Partial<Record<keyof FormValues, string | undefined>>;

// <input type="datetime-local"> works in the browser's local time.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function UpdatesAdminPage() {
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const queryClient = useQueryClient();

  const updates = useQuery({
    queryKey: ["announcements", "admin"],
    queryFn: async () => {
      // Staff see drafts as well as published updates (row rules).
      const { data, error } = await db
        .from("announcements")
        .select(
          "id, kind, source, source_reference, title, body, starts_at, ends_at, is_published, published_at, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const togglePublish = useMutation({
    mutationFn: async (a: Announcement) => {
      const { error } = await db
        .from("announcements")
        .update({ is_published: !a.is_published })
        .eq("id", a.id);
      if (error) throw error;
      return !a.is_published;
    },
    onSuccess: async (published) => {
      toast.success(published ? "Update published" : "Update moved back to drafts");
      await refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Update deleted");
      setDeleting(null);
      await refresh();
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div>
      <PageHeader
        eyebrow="Ward management"
        title="Ward updates"
        description="Tell residents about water and electricity interruptions, road closures, meetings and service delivery news. Published updates appear on the public Updates page."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New update
          </Button>
        }
      />

      <div className="mt-6">
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
            description="Post your first ward update to keep residents informed."
            action={
              <Button onClick={() => setEditing("new")}>
                <Plus className="size-4" /> New update
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {updates.data.map((u) => (
              <li key={u.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 font-semibold ring-1 ring-inset",
                          u.is_published
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200",
                        )}
                      >
                        {u.is_published ? "Published" : "Draft"}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold text-primary">
                        {ANNOUNCEMENT_KINDS[u.kind]}
                      </span>
                      {u.source === "official_verified" && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-800">
                          <BadgeCheck className="size-3.5" /> Official notice
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {u.is_published
                          ? `Published ${formatDate(u.published_at)}`
                          : `Created ${formatDate(u.created_at)}`}
                      </span>
                    </div>
                    <h2 className="mt-2 font-semibold">{u.title}</h2>
                    {(u.starts_at || u.ends_at) && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarDays className="size-4" />
                        {formatDateTime(u.starts_at)}
                        {u.ends_at && ` – ${formatDateTime(u.ends_at)}`}
                      </p>
                    )}
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{u.body}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={u.is_published ? "outline" : "default"}
                      disabled={togglePublish.isPending}
                      onClick={() => togglePublish.mutate(u)}
                    >
                      {u.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(u)}
                      aria-label={`Edit ${u.title}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(u)}
                      aria-label={`Delete ${u.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <UpdateDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this update?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” will be removed from the Updates page. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UpdateDialog({
  value,
  onClose,
  onSaved,
}: {
  value: Announcement | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const userId = useUserId();
  const reference = useReferenceData();
  const existing = value && value !== "new" ? value : null;
  const [source, setSource] = useState<FormValues["source"]>(existing?.source ?? "ward_update");
  const [publish, setPublish] = useState(existing?.is_published ?? false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = schema.safeParse({
      kind: form.get("kind"),
      source,
      source_reference: String(form.get("source_reference") ?? ""),
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      starts_at: String(form.get("starts_at") ?? ""),
      ends_at: String(form.get("ends_at") ?? ""),
      is_published: publish,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof FormValues;
        next[key] ??= issue.message;
      }
      return setErrors(next);
    }
    const wardId = reference.data?.ward.id;
    if (!wardId || !userId) return;
    const v = parsed.data;
    const row = {
      kind: v.kind,
      source: v.source,
      source_reference: v.source === "official_verified" ? v.source_reference : null,
      title: v.title,
      body: v.body,
      starts_at: fromLocalInput(v.starts_at),
      ends_at: fromLocalInput(v.ends_at),
      is_published: v.is_published,
    };
    setBusy(true);
    const { error } = existing
      ? await db.from("announcements").update(row).eq("id", existing.id)
      : await db.from("announcements").insert({ ...row, ward_id: wardId, created_by: userId });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success(v.is_published ? "Update published" : existing ? "Update saved" : "Draft saved");
    await onSaved();
    onClose();
  }

  return (
    <Dialog open={value !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit update" : "New ward update"}</DialogTitle>
          <DialogDescription>
            Only post official notices you have confirmed with the municipal entity.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="kind" label="Type of update">
              <NativeSelect id="kind" name="kind" defaultValue={existing?.kind ?? "general"}>
                {Object.entries(ANNOUNCEMENT_KINDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="source" label="Source">
              <NativeSelect
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value as FormValues["source"])}
              >
                <option value="ward_update">Ward office update</option>
                <option value="official_verified">Official municipal notice</option>
              </NativeSelect>
            </Field>
          </div>
          {source === "official_verified" && (
            <Field
              id="source_reference"
              label="Where did the notice come from?"
              hint="e.g. City Power planned maintenance notice, 20 November 2026"
              error={errors.source_reference}
            >
              <Input
                id="source_reference"
                name="source_reference"
                defaultValue={existing?.source_reference ?? ""}
                maxLength={200}
                aria-invalid={!!errors.source_reference}
              />
            </Field>
          )}
          <Field id="title" label="Title" error={errors.title}>
            <Input
              id="title"
              name="title"
              defaultValue={existing?.title ?? ""}
              maxLength={160}
              aria-invalid={!!errors.title}
            />
          </Field>
          <Field id="body" label="Details" error={errors.body}>
            <Textarea
              id="body"
              name="body"
              rows={7}
              defaultValue={existing?.body ?? ""}
              maxLength={6000}
              aria-invalid={!!errors.body}
              placeholder="What is happening, where, and what residents should do."
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="starts_at" label="Starts" optional>
              <Input
                id="starts_at"
                name="starts_at"
                type="datetime-local"
                defaultValue={toLocalInput(existing?.starts_at ?? null)}
              />
            </Field>
            <Field id="ends_at" label="Ends" optional error={errors.ends_at}>
              <Input
                id="ends_at"
                name="ends_at"
                type="datetime-local"
                defaultValue={toLocalInput(existing?.ends_at ?? null)}
                aria-invalid={!!errors.ends_at}
              />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <span>
              <span className="block text-sm font-medium">Publish now</span>
              <span className="block text-xs text-muted-foreground">
                Off saves a draft that only the ward office can see.
              </span>
            </span>
            <Switch checked={publish} onCheckedChange={setPublish} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reference.data}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {publish ? "Publish" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
