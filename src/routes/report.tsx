import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Field, NativeSelect, Notice, PageHeader, StatusBadge } from "@/components/app-ui";
import { LocationPicker, type LatLng } from "@/components/location-picker";
import { PageLoader, RequireAuth } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProfile, useUserId } from "@/hooks/use-auth";
import { entityHref, useReferenceData, type ReferenceData } from "@/hooks/use-reference-data";
import { db, friendlyError } from "@/lib/db";
import {
  prepareEvidence,
  uploadEvidence,
  validateEvidence,
  type PreparedFile,
} from "@/lib/evidence";
import { cn } from "@/lib/utils";
import { APP_NAME, EVIDENCE, PRIVACY_NOTICE_VERSION, WARD_NUMBER } from "@/lib/ward109";

const searchSchema = z.object({ draft: z.string().uuid().optional().catch(undefined) });

export const Route = createFileRoute("/report")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Report an issue · ${APP_NAME}` }] }),
  component: () => (
    <RequireAuth>
      <ReportPage />
    </RequireAuth>
  ),
});

const STEPS = [
  { title: "Your details", short: "Details" },
  { title: "Location", short: "Location" },
  { title: "The issue", short: "Issue" },
  { title: "Municipal reference", short: "Reference" },
  { title: "Evidence", short: "Evidence" },
  { title: "Review & submit", short: "Review" },
] as const;

type FormState = {
  contact_name: string;
  contact_mobile: string;
  contact_email: string;
  preferred_contact: "email" | "sms";
  suburb_id: string;
  street_address: string;
  street_name: string;
  landmark: string;
  pin: LatLng | null;
  category_id: string;
  issue_type_id: string;
  description: string;
  issue_started_on: string;
  priority: "routine" | "urgent";
  reported: "" | "yes" | "no";
  municipal_reference_number: string;
  logged_date: string;
  logged_time: string;
  consent: boolean;
};

const EMPTY: FormState = {
  contact_name: "",
  contact_mobile: "",
  contact_email: "",
  preferred_contact: "email",
  suburb_id: "",
  street_address: "",
  street_name: "",
  landmark: "",
  pin: null,
  category_id: "",
  issue_type_id: "",
  description: "",
  issue_started_on: "",
  priority: "routine",
  reported: "",
  municipal_reference_number: "",
  logged_date: "",
  logged_time: "",
  consent: false,
};

const MOBILE_RE = /^\+?[0-9 ()-]{7,20}$/;
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
// Date + optional time entered in South African time, as an ISO timestamp.
const loggedAtIso = (date: string, time: string) =>
  new Date(`${date}T${time || "00:00"}:00+02:00`).toISOString();

const stepSchemas = [
  z.object({
    contact_name: z.string().trim().min(2, "Enter your full name").max(100, "Name is too long"),
    contact_mobile: z
      .string()
      .trim()
      .regex(MOBILE_RE, "Enter a valid mobile number, e.g. 082 123 4567"),
    contact_email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]),
  }),
  z.object({
    suburb_id: z.string().min(1, "Choose the suburb"),
    street_address: z
      .string()
      .trim()
      .min(3, "Enter the street address")
      .max(200, "Address is too long"),
    street_name: z.union([
      z.literal(""),
      z.string().trim().min(2, "Street name is too short").max(120, "Street name is too long"),
    ]),
    landmark: z.string().trim().max(200, "Landmark is too long"),
  }),
  z.object({
    category_id: z.string().min(1, "Choose a service category"),
    issue_type_id: z.string().min(1, "Choose the type of issue"),
    description: z
      .string()
      .trim()
      .min(10, "Describe the issue (at least 10 characters)")
      .max(4000, "Description is too long"),
    issue_started_on: z
      .string()
      .refine((v) => !v || v <= todayIso(), "This date can't be in the future"),
  }),
  z
    .object({
      reported: z.enum(["yes", "no"], { errorMap: () => ({ message: "Choose yes or no" }) }),
      municipal_reference_number: z.string().trim(),
      logged_date: z.string(),
      logged_time: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.reported !== "yes") return;
      if (v.municipal_reference_number.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["municipal_reference_number"],
          message: "Enter the official reference number",
        });
      if (v.municipal_reference_number.length > 80)
        ctx.addIssue({
          code: "custom",
          path: ["municipal_reference_number"],
          message: "Reference number is too long",
        });
      if (!v.logged_date)
        ctx.addIssue({
          code: "custom",
          path: ["logged_date"],
          message: "Enter the date you logged it",
        });
      else if (
        new Date(loggedAtIso(v.logged_date, v.logged_time)).getTime() >
        Date.now() + 10 * 60 * 1000
      )
        ctx.addIssue({
          code: "custom",
          path: ["logged_date"],
          message: "This date can't be in the future",
        });
    }),
  z.object({}),
  z.object({
    consent: z.literal(true, {
      errorMap: () => ({ message: "Please confirm and consent to continue" }),
    }),
  }),
];

type Errors = Partial<Record<keyof FormState, string>>;

function validateStep(step: number, form: FormState): Errors {
  const result = stepSchemas[step]!.safeParse(form);
  if (result.success) return {};
  const errors: Errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof FormState;
    errors[key] ??= issue.message;
  }
  return errors;
}

// Draft rows must still satisfy column checks, so incomplete values are saved as null.
function toRow(form: FormState) {
  const trimmed = (v: string, min: number) => (v.trim().length >= min ? v.trim() : null);
  const reported = form.reported === "yes";
  return {
    contact_name: trimmed(form.contact_name, 1),
    contact_mobile: MOBILE_RE.test(form.contact_mobile.trim()) ? form.contact_mobile.trim() : null,
    contact_email: z.string().email().safeParse(form.contact_email.trim()).success
      ? form.contact_email.trim()
      : null,
    preferred_contact: form.preferred_contact,
    suburb_id: form.suburb_id || null,
    street_address: trimmed(form.street_address, 3),
    street_name: trimmed(form.street_name, 2),
    landmark: trimmed(form.landmark, 1),
    latitude: form.pin?.lat ?? null,
    longitude: form.pin?.lng ?? null,
    location_source: form.pin ? ("map_pin" as const) : ("address" as const),
    category_id: form.category_id || null,
    issue_type_id: form.issue_type_id || null,
    description: trimmed(form.description, 10),
    issue_started_on: form.issue_started_on || null,
    priority: form.priority,
    municipal_reported: reported,
    municipal_reference_number: reported ? trimmed(form.municipal_reference_number, 2) : null,
    municipal_logged_at:
      reported && form.logged_date ? loggedAtIso(form.logged_date, form.logged_time) : null,
  };
}

function ReportPage() {
  const { draft: draftParam } = Route.useSearch();
  const userId = useUserId()!;
  const reference = useReferenceData();
  const profile = useProfile();

  const existingDraft = useQuery({
    queryKey: ["draft", draftParam],
    enabled: !!draftParam,
    queryFn: async () => {
      const { data, error } = await db
        .from("complaints")
        .select("*, complaint_attachments(id, storage_path, file_name, mime_type)")
        .eq("id", draftParam!)
        .eq("status", "draft")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (reference.isPending || profile.isPending || (draftParam && existingDraft.isPending)) {
    return <PageLoader />;
  }
  if (reference.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Notice tone="error" title="The reporting service is not available">
          {friendlyError(reference.error)}
        </Notice>
      </div>
    );
  }
  if (draftParam && !existingDraft.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Notice tone="warning" title="Draft not found">
          This draft may already have been submitted or deleted.{" "}
          <Link to="/report" className="font-semibold underline">
            Start a new report
          </Link>
          .
        </Notice>
      </div>
    );
  }

  const d = existingDraft.data;
  const p = profile.data;
  const logged = d?.municipal_logged_at ? new Date(d.municipal_logged_at) : null;
  const initial: FormState = d
    ? {
        ...EMPTY,
        contact_name: d.contact_name ?? "",
        contact_mobile: d.contact_mobile ?? "",
        contact_email: d.contact_email ?? "",
        preferred_contact: d.preferred_contact === "sms" ? "sms" : "email",
        suburb_id: d.suburb_id ?? "",
        street_address: d.street_address ?? "",
        street_name: d.street_name ?? "",
        landmark: d.landmark ?? "",
        pin:
          d.latitude != null && d.longitude != null ? { lat: d.latitude, lng: d.longitude } : null,
        category_id: d.category_id ?? "",
        issue_type_id: d.issue_type_id ?? "",
        description: d.description ?? "",
        issue_started_on: d.issue_started_on ?? "",
        priority: d.priority === "urgent" ? "urgent" : "routine",
        reported: d.municipal_reported || d.municipal_reference_number ? "yes" : "",
        municipal_reference_number: d.municipal_reference_number ?? "",
        logged_date: logged
          ? logged.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" })
          : "",
        logged_time: logged
          ? logged.toLocaleTimeString("en-GB", {
              timeZone: "Africa/Johannesburg",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "",
      }
    : {
        ...EMPTY,
        contact_name: p?.full_name ?? "",
        contact_mobile: p?.mobile ?? "",
        contact_email: p?.email ?? "",
        preferred_contact: p?.preferred_contact === "sms" ? "sms" : "email",
        suburb_id: p?.default_suburb_id ?? "",
        street_address: p?.street_address ?? "",
      };

  return (
    <ReportWizard
      key={d?.id ?? "new"}
      userId={userId}
      reference={reference.data}
      initial={initial}
      draftId={d?.id ?? null}
      existingFiles={d?.complaint_attachments ?? []}
    />
  );
}

type ExistingFile = { id: string; storage_path: string; file_name: string; mime_type: string };

function ReportWizard({
  userId,
  reference,
  initial,
  draftId: initialDraftId,
  existingFiles: initialExisting,
}: {
  userId: string;
  reference: ReferenceData;
  initial: FormState;
  draftId: string | null;
  existingFiles: ExistingFile[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);
  const [existing, setExisting] = useState<ExistingFile[]>(initialExisting);
  const [pending, setPending] = useState<PreparedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "submit">(null);
  const [dirty, setDirty] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setDirty(true);
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Keep the latest pending files for async uploads and release previews on unmount.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () =>
      pendingRef.current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl)),
    [],
  );

  const category = reference.categories.find((c) => c.id === form.category_id);
  const issueTypes = reference.issueTypes.filter((t) => t.category_id === form.category_id);
  const issueType = reference.issueTypes.find((t) => t.id === form.issue_type_id);
  const suburb = reference.suburbs.find((s) => s.id === form.suburb_id);
  const entity = category?.municipal_entities ?? null;
  const fileCount = existing.length + pending.length;
  const streetName = form.street_name.trim();

  const similar = useQuery({
    queryKey: ["similar", form.category_id, form.suburb_id, streetName, form.pin],
    enabled: step >= 2 && !!form.category_id && !!form.suburb_id,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.rpc("find_similar_complaints", {
        _category: form.category_id,
        _suburb: form.suburb_id,
        ...(streetName ? { _street_name: streetName } : {}),
        ...(form.pin ? { _lat: form.pin.lat, _lng: form.pin.lng } : {}),
      });
      if (error) throw error;
      return data;
    },
  });

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  function goTo(target: number) {
    // Moving forward validates every step in between.
    for (let s = step; s < target; s++) {
      const e = validateStep(s, form);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        scrollTop();
        return;
      }
      if (s === 3 && form.reported === "no") {
        setStep(3);
        scrollTop();
        return;
      }
    }
    setErrors({});
    setStep(target);
    scrollTop();
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = EVIDENCE.maxFiles - fileCount;
    const chosen = Array.from(files);
    if (chosen.length > room) toast.warning(`You can attach up to ${EVIDENCE.maxFiles} files.`);
    setProcessing(true);
    const prepared: PreparedFile[] = [];
    for (const file of chosen.slice(0, Math.max(0, room))) {
      const problem = validateEvidence(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      try {
        prepared.push(await prepareEvidence(file));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setProcessing(false);
    if (prepared.length) {
      setPending((p) => [...p, ...prepared]);
      setDirty(true);
    }
  }

  function removePending(key: string) {
    setPending((p) => {
      const item = p.find((f) => f.key === key);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return p.filter((f) => f.key !== key);
    });
  }

  async function removeExisting(file: ExistingFile) {
    const { error } = await db.from("complaint_attachments").delete().eq("id", file.id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    await db.storage.from(EVIDENCE.bucket).remove([file.storage_path]);
    setExisting((e) => e.filter((f) => f.id !== file.id));
  }

  // Saves the draft row, then uploads any new evidence to it.
  async function persistDraft(): Promise<string> {
    const row = toRow(form);
    let id = draftId;
    if (id) {
      const { error } = await db.from("complaints").update(row).eq("id", id).eq("status", "draft");
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("complaints")
        .insert({ ...row, resident_id: userId, ward_id: reference.ward.id, status: "draft" })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
      setDraftId(id);
    }
    for (const item of pendingRef.current) {
      const saved = await uploadEvidence(id, userId, item);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      setPending((p) => p.filter((f) => f.key !== item.key));
      setExisting((e) => [
        ...e,
        { id: saved.id, storage_path: saved.path, file_name: item.name, mime_type: item.mimeType },
      ]);
    }
    return id;
  }

  async function saveDraft() {
    setSaving("draft");
    try {
      await persistDraft();
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast.success("Draft saved", { description: "You can finish it later from My complaints." });
      navigate({ to: "/reports" });
    } catch (e) {
      toast.error("Your draft could not be saved", { description: friendlyError(e) });
    } finally {
      setSaving(null);
    }
  }

  async function submit() {
    for (let s = 0; s < STEPS.length; s++) {
      const e = validateStep(s, form);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(s);
        scrollTop();
        return;
      }
    }
    if (form.reported !== "yes") {
      setStep(3);
      return;
    }
    setSaving("submit");
    try {
      const id = await persistDraft();
      const { data, error } = await db
        .from("complaints")
        .update({
          status: "submitted",
          consent_at: new Date().toISOString(),
          consent_version: PRIVACY_NOTICE_VERSION,
        })
        .eq("id", id)
        .select("tracking_number")
        .single();
      if (error) throw error;
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["complaints"] });
      toast.success("Your complaint has been registered successfully.", {
        description: `Tracking number ${data.tracking_number}`,
      });
      navigate({ to: "/reports/$id", params: { id }, search: { submitted: true } });
    } catch (e) {
      toast.error("Your complaint could not be submitted", { description: friendlyError(e) });
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null || processing;
  const isLast = step === STEPS.length - 1;
  const blockedNoReference = step === 3 && form.reported === "no";

  return (
    <div className="mx-auto max-w-3xl scroll-mt-24 px-4 py-8 sm:py-10" ref={topRef}>
      <PageHeader
        eyebrow={draftId ? "Draft" : "New complaint"}
        title="Report an issue"
        description="Register a municipal fault you have logged with the City, so the ward office can track and escalate it."
      />

      <Stepper step={step} onSelect={goTo} />

      <div className="mt-6 rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold tracking-wider text-teal uppercase">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold">{STEPS[step]!.title}</h2>
        </div>

        <div className="space-y-5 px-5 py-6 sm:px-6">
          {step === 0 && (
            <>
              <Field id="contact_name" label="Full name" error={errors.contact_name}>
                <Input
                  id="contact_name"
                  value={form.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                  autoComplete="name"
                  aria-invalid={!!errors.contact_name}
                  className="h-11 md:h-10"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="contact_mobile" label="Mobile number" error={errors.contact_mobile}>
                  <Input
                    id="contact_mobile"
                    type="tel"
                    inputMode="tel"
                    value={form.contact_mobile}
                    onChange={(e) => set("contact_mobile", e.target.value)}
                    autoComplete="tel"
                    placeholder="082 123 4567"
                    aria-invalid={!!errors.contact_mobile}
                    className="h-11 md:h-10"
                  />
                </Field>
                <Field
                  id="contact_email"
                  label="Email address"
                  optional
                  error={errors.contact_email}
                >
                  <Input
                    id="contact_email"
                    type="email"
                    inputMode="email"
                    value={form.contact_email}
                    onChange={(e) => set("contact_email", e.target.value)}
                    autoComplete="email"
                    aria-invalid={!!errors.contact_email}
                    className="h-11 md:h-10"
                  />
                </Field>
              </div>
              <fieldset>
                <legend className="text-sm font-medium">Preferred way to contact you</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <ChoiceCard
                    checked={form.preferred_contact === "email"}
                    onSelect={() => set("preferred_contact", "email")}
                    title="Email"
                    name="preferred_contact"
                  />
                  <ChoiceCard
                    checked={form.preferred_contact === "sms"}
                    onSelect={() => set("preferred_contact", "sms")}
                    title="SMS"
                    subtitle="When available"
                    name="preferred_contact"
                  />
                  <ChoiceCard
                    checked={false}
                    disabled
                    title="WhatsApp"
                    subtitle="Coming soon"
                    name="preferred_contact"
                  />
                </div>
              </fieldset>
            </>
          )}

          {step === 1 && (
            <>
              <Field id="suburb_id" label="Suburb" error={errors.suburb_id}>
                <NativeSelect
                  id="suburb_id"
                  value={form.suburb_id}
                  onChange={(e) => set("suburb_id", e.target.value)}
                  aria-invalid={!!errors.suburb_id}
                >
                  <option value="" disabled>
                    Choose the suburb
                  </option>
                  {reference.suburbs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.coverage === "partial" ? " (part of Ward 109)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {suburb?.coverage === "partial" && (
                <Notice tone="info">
                  Only part of {suburb.name} is in Ward {WARD_NUMBER}. Please pin the fault on the
                  map so the ward office can confirm it is inside the ward.
                </Notice>
              )}
              <Field id="street_address" label="Street address" error={errors.street_address}>
                <Input
                  id="street_address"
                  value={form.street_address}
                  onChange={(e) => set("street_address", e.target.value)}
                  autoComplete="street-address"
                  placeholder="e.g. 12 Example Road"
                  aria-invalid={!!errors.street_address}
                  className="h-11 md:h-10"
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="street_name"
                  label="Street name"
                  optional
                  error={errors.street_name}
                  hint="Helps us spot repeat issues on the same street."
                >
                  <Input
                    id="street_name"
                    value={form.street_name}
                    onChange={(e) => set("street_name", e.target.value)}
                    placeholder="e.g. Example Road"
                    className="h-11 md:h-10"
                  />
                </Field>
                <Field id="landmark" label="Nearest landmark" optional error={errors.landmark}>
                  <Input
                    id="landmark"
                    value={form.landmark}
                    onChange={(e) => set("landmark", e.target.value)}
                    placeholder="e.g. Opposite the park entrance"
                    className="h-11 md:h-10"
                  />
                </Field>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">
                  Pin the location{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <LocationPicker value={form.pin} onChange={(p) => set("pin", p)} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Notice tone="warning" title="Emergencies">
                For emergencies or crimes in progress call <strong>10111</strong> (SAPS) or{" "}
                <strong>112</strong> from a mobile phone. This platform is not monitored 24/7.
              </Notice>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="category_id" label="Municipal service" error={errors.category_id}>
                  <NativeSelect
                    id="category_id"
                    value={form.category_id}
                    onChange={(e) => {
                      set("category_id", e.target.value);
                      set("issue_type_id", "");
                    }}
                    aria-invalid={!!errors.category_id}
                  >
                    <option value="" disabled>
                      Choose a service
                    </option>
                    {reference.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field id="issue_type_id" label="Type of issue" error={errors.issue_type_id}>
                  <NativeSelect
                    id="issue_type_id"
                    value={form.issue_type_id}
                    disabled={!form.category_id}
                    onChange={(e) => {
                      const type = reference.issueTypes.find((t) => t.id === e.target.value);
                      set("issue_type_id", e.target.value);
                      set("priority", type?.suggests_urgent ? "urgent" : "routine");
                    }}
                    aria-invalid={!!errors.issue_type_id}
                  >
                    <option value="" disabled>
                      {form.category_id ? "Choose the issue" : "Choose a service first"}
                    </option>
                    {issueTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              {category?.emergency_warning && (
                <Notice tone="error" title="Not for emergencies">
                  JMPD issues on this platform must be non-emergency. Report crimes in progress to
                  10111 immediately.
                </Notice>
              )}
              <Field
                id="description"
                label="Describe the issue"
                error={errors.description}
                hint="What is wrong, exactly where, and how it affects residents."
              >
                <Textarea
                  id="description"
                  rows={5}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  aria-invalid={!!errors.description}
                  maxLength={4000}
                />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="issue_started_on"
                  label="When did it start?"
                  optional
                  error={errors.issue_started_on}
                >
                  <Input
                    id="issue_started_on"
                    type="date"
                    max={todayIso()}
                    value={form.issue_started_on}
                    onChange={(e) => set("issue_started_on", e.target.value)}
                    className="h-11 md:h-10"
                  />
                </Field>
                <fieldset>
                  <legend className="text-sm font-medium">Priority</legend>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      checked={form.priority === "routine"}
                      onSelect={() => set("priority", "routine")}
                      title="Routine"
                      name="priority"
                      compact
                    />
                    <ChoiceCard
                      checked={form.priority === "urgent"}
                      onSelect={() => set("priority", "urgent")}
                      title="Urgent"
                      name="priority"
                      compact
                    />
                  </div>
                  {issueType?.suggests_urgent && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Suggested: urgent, based on the type of issue.
                    </p>
                  )}
                </fieldset>
              </div>
              {similar.data && similar.data.length > 0 && (
                <Notice tone="info" title="Similar open complaints nearby">
                  <ul className="mt-1 space-y-1">
                    {similar.data.map((s) => (
                      <li key={s.tracking_number} className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{s.tracking_number}</span>
                        <span>{s.issue_type}</span>
                        <StatusBadge status={s.status} />
                        {s.distance_m != null && (
                          <span className="text-xs">~{s.distance_m} m away</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">
                    The ward office may already be following up this issue. You can still submit
                    your own complaint with your municipal reference number.
                  </p>
                </Notice>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <fieldset>
                <legend className="font-medium">
                  Have you already reported this issue to{" "}
                  {entity?.short_name ?? entity?.name ?? "the responsible municipal entity"}?
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ChoiceCard
                    checked={form.reported === "yes"}
                    onSelect={() => set("reported", "yes")}
                    title="Yes"
                    subtitle="I have a municipal reference number"
                    name="reported"
                  />
                  <ChoiceCard
                    checked={form.reported === "no"}
                    onSelect={() => set("reported", "no")}
                    title="No"
                    subtitle="I still need to log it"
                    name="reported"
                  />
                </div>
                {errors.reported && (
                  <p className="mt-2 text-sm font-medium text-destructive">{errors.reported}</p>
                )}
              </fieldset>

              {form.reported === "no" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-semibold">Log it with the City first</p>
                  <p className="mt-1">
                    A municipal reference number is required before your complaint can be registered
                    and escalated. Faults not logged first cannot be tracked or resolved.
                  </p>
                  {entity && (
                    <EntityContact
                      name={entity.name}
                      type={entity.contact_type}
                      value={entity.contact_value}
                      links={entity.secondary_links}
                    />
                  )}
                  <p className="mt-3">
                    Save this complaint as a draft now, then come back and add the reference number.
                  </p>
                </div>
              )}

              {form.reported === "yes" && (
                <div className="space-y-5">
                  <Field
                    id="municipal_reference_number"
                    label="Official reference number"
                    error={errors.municipal_reference_number}
                    hint={`The number ${entity?.short_name ?? "the municipal entity"} gave you. Never make one up.`}
                  >
                    <Input
                      id="municipal_reference_number"
                      value={form.municipal_reference_number}
                      onChange={(e) => set("municipal_reference_number", e.target.value)}
                      aria-invalid={!!errors.municipal_reference_number}
                      className="h-11 font-mono md:h-10"
                    />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="logged_date" label="Date logged" error={errors.logged_date}>
                      <Input
                        id="logged_date"
                        type="date"
                        max={todayIso()}
                        value={form.logged_date}
                        onChange={(e) => set("logged_date", e.target.value)}
                        aria-invalid={!!errors.logged_date}
                        className="h-11 md:h-10"
                      />
                    </Field>
                    <Field id="logged_time" label="Time logged" optional>
                      <Input
                        id="logged_time"
                        type="time"
                        value={form.logged_time}
                        onChange={(e) => set("logged_time", e.target.value)}
                        className="h-11 md:h-10"
                      />
                    </Field>
                  </div>
                  {entity && (
                    <p className="text-sm text-muted-foreground">
                      Municipal entity: <strong className="text-foreground">{entity.name}</strong>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-sm text-muted-foreground">
                Add up to {EVIDENCE.maxFiles} photos or PDF documents. Photos are resized and their
                location data is removed before upload. Only you and the ward office can see them.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {existing.map((f) => (
                  <FileTile
                    key={f.id}
                    name={f.file_name}
                    pdf={f.mime_type === "application/pdf"}
                    uploaded
                    onRemove={() => removeExisting(f)}
                  />
                ))}
                {pending.map((f) => (
                  <FileTile
                    key={f.key}
                    name={f.name}
                    pdf={f.mimeType === "application/pdf"}
                    preview={f.previewUrl}
                    onRemove={() => removePending(f.key)}
                  />
                ))}
                {fileCount < EVIDENCE.maxFiles && (
                  <label
                    className={cn(
                      "flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center text-sm text-muted-foreground transition-colors hover:border-teal hover:bg-accent/40 hover:text-foreground",
                      processing && "pointer-events-none opacity-60",
                    )}
                  >
                    {processing ? (
                      <Loader2 className="size-6 animate-spin" />
                    ) : (
                      <ImagePlus className="size-6" />
                    )}
                    <span className="px-2 font-medium">
                      {processing ? "Preparing…" : "Add photo or PDF"}
                    </span>
                    <span className="text-xs">
                      {fileCount}/{EVIDENCE.maxFiles}
                    </span>
                    <input
                      type="file"
                      multiple
                      accept={EVIDENCE.accept}
                      className="sr-only"
                      onChange={(e) => {
                        void addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <Review form={form} reference={reference} fileCount={fileCount} onEdit={goTo} />
              <div className="rounded-lg border bg-muted/40 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(e) => set("consent", e.target.checked)}
                    className="mt-0.5 size-4.5 accent-[var(--primary)]"
                  />
                  <span>
                    I confirm this information is accurate and I consent to the Ward 109 office
                    processing my personal information to handle this complaint, as described in the{" "}
                    <Link
                      to="/privacy"
                      target="_blank"
                      className="font-semibold text-teal underline-offset-2 hover:underline"
                    >
                      privacy notice
                    </Link>
                    .
                  </span>
                </label>
                {errors.consent && (
                  <p className="mt-2 text-sm font-medium text-destructive">{errors.consent}</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={busy}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            <Button type="button" variant="outline" onClick={saveDraft} disabled={busy}>
              {saving === "draft" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save draft
            </Button>
          </div>
          {isLast ? (
            <Button
              type="button"
              size="lg"
              onClick={submit}
              disabled={busy}
              className="bg-teal hover:bg-teal/90"
            >
              {saving === "submit" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Submit complaint
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={() => goTo(step + 1)}
              disabled={busy || blockedNoReference}
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step, onSelect }: { step: number; onSelect: (s: number) => void }) {
  return (
    <nav aria-label="Progress" className="mt-8">
      <div className="sm:hidden">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-teal transition-all"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden grid-cols-6 gap-2 sm:grid">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={state === "current" ? "step" : undefined}
                className="group flex w-full flex-col gap-2 text-left"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    state === "todo" ? "bg-secondary" : "bg-teal",
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    state === "current"
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5 text-teal" />
                  ) : (
                    <span className="tabular-nums">{i + 1}.</span>
                  )}
                  {s.short}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ChoiceCard({
  checked,
  onSelect,
  title,
  subtitle,
  name,
  disabled,
  compact,
}: {
  checked: boolean;
  onSelect?: () => void;
  title: string;
  subtitle?: string;
  name: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border bg-card transition-colors",
        compact ? "px-3 py-2.5" : "p-4",
        checked ? "border-teal bg-accent/60 ring-1 ring-teal" : "hover:border-slate-300",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect?.()}
        className="mt-0.5 size-4 accent-[var(--teal)]"
      />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </label>
  );
}

function FileTile({
  name,
  pdf,
  preview,
  uploaded,
  onRemove,
}: {
  name: string;
  pdf: boolean;
  preview?: string | null;
  uploaded?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
      {preview ? (
        <img src={preview} alt={name} className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <span className="line-clamp-2 text-xs break-all">{name}</span>
          {!pdf && uploaded && (
            <span className="text-[11px] text-muted-foreground">Photo uploaded</span>
          )}
        </div>
      )}
      {uploaded && (
        <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
          Saved
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function EntityContact({
  name,
  type,
  value,
  links,
}: {
  name: string;
  type: string;
  value: string;
  links: unknown;
}) {
  const href = entityHref(type, value);
  const extra = Array.isArray(links) ? (links as { label: string; url: string }[]) : [];
  return (
    <div className="mt-3 rounded-md bg-white/70 p-3">
      <p className="font-semibold">{name}</p>
      {href ? (
        <a
          href={href}
          target={type === "url" ? "_blank" : undefined}
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
        >
          {value} {type === "url" && <ExternalLink className="size-3.5" />}
        </a>
      ) : (
        <p className="mt-1">{value}</p>
      )}
      {extra.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {extra.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary underline"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Review({
  form,
  reference,
  fileCount,
  onEdit,
}: {
  form: FormState;
  reference: ReferenceData;
  fileCount: number;
  onEdit: (step: number) => void;
}) {
  const suburb = reference.suburbs.find((s) => s.id === form.suburb_id)?.name;
  const category = reference.categories.find((c) => c.id === form.category_id);
  const issue = reference.issueTypes.find((t) => t.id === form.issue_type_id)?.name;
  const sections = useMemo(
    (): { step: number; title: string; items: [string, string][] }[] => [
      {
        step: 0,
        title: "Your details",
        items: [
          ["Name", form.contact_name],
          ["Mobile", form.contact_mobile],
          ["Email", form.contact_email || "—"],
          ["Contact by", form.preferred_contact === "sms" ? "SMS" : "Email"],
        ],
      },
      {
        step: 1,
        title: "Location",
        items: [
          ["Suburb", suburb ?? "—"],
          ["Address", form.street_address],
          ["Landmark", form.landmark || "—"],
          [
            "Map pin",
            form.pin ? `${form.pin.lat.toFixed(5)}, ${form.pin.lng.toFixed(5)}` : "Not pinned",
          ],
        ],
      },
      {
        step: 2,
        title: "The issue",
        items: [
          ["Service", category?.name ?? "—"],
          ["Issue", issue ?? "—"],
          ["Priority", form.priority === "urgent" ? "Urgent" : "Routine"],
          ["Description", form.description],
        ],
      },
      {
        step: 3,
        title: "Municipal reference",
        items: [
          ["Entity", category?.municipal_entities?.name ?? "—"],
          ["Reference", form.municipal_reference_number || "—"],
          ["Date logged", [form.logged_date, form.logged_time].filter(Boolean).join(" ") || "—"],
        ],
      },
      {
        step: 4,
        title: "Evidence",
        items: [["Files", fileCount ? `${fileCount} attached` : "None"]],
      },
    ],
    [form, suburb, category, issue, fileCount],
  );
  return (
    <div className="divide-y rounded-lg border">
      {sections.map((section) => (
        <div key={section.title} className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{section.title}</h3>
            <button
              type="button"
              className="text-sm font-medium text-teal hover:underline"
              onClick={() => onEdit(section.step)}
            >
              Edit
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
            {section.items.map(([k, v]) => (
              <Row key={k} label={k}>
                {v}
              </Row>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
        {children}
      </dd>
    </>
  );
}
