import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { CheckCircle2, Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Field, NativeSelect, Notice } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { useBackendReady } from "@/hooks/use-backend-ready";
import { db, friendlyError } from "@/lib/db";
import { APP_NAME, TAGLINE, WARD_SUBURBS } from "@/lib/ward109";

const searchSchema = z.object({
  // Only same-site paths, so the link cannot bounce users to another site.
  redirect: z
    .string()
    .regex(/^\/(?!\/)/)
    .optional()
    .catch(undefined),
  // Opens straight on a tab, e.g. /auth?mode=sign-up.
  mode: z.enum(["sign-in", "sign-up", "forgot"]).optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Sign in · ${APP_NAME}` }] }),
  component: AuthPage,
});

type Mode = "sign-in" | "sign-up" | "forgot";
const OUTSIDE_WARD = "outside";

const email = z.string().trim().email("Enter a valid email address");
const signInSchema = z.object({ email, password: z.string().min(1, "Enter your password") });
const nameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Enter your ${label}`)
    .max(60, `Your ${label} is too long`)
    .regex(/^\p{L}[\p{L}\p{M}' .-]*$/u, `Use letters only in your ${label}`);
const signUpSchema = z.object({
  first_name: nameField("first name"),
  last_name: nameField("surname"),
  suburb: z
    .string()
    .refine(
      (v) => v === OUTSIDE_WARD || WARD_SUBURBS.some((s) => s.name === v),
      "Choose where you live",
    ),
  street_address: z.string().trim().max(200, "Street address is too long"),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/\d/, "Include at least one number"),
});

type FieldName = "first_name" | "last_name" | "suburb" | "street_address" | "email" | "password";
type Errors = Partial<Record<FieldName, string | undefined>>;

function fieldErrors(error: z.ZodError): Errors {
  const out: Errors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]) as FieldName;
    out[key] ??= issue.message;
  }
  return out;
}

// Staff land on the ward management dashboard, residents on their complaints.
function SignedInRedirect({ redirect }: { redirect: string | undefined }) {
  const { isStaff, isLoading } = useRoles();
  if (redirect) return <Navigate to={redirect} replace />;
  if (isLoading) return <PageLoader />;
  return <Navigate to={isStaff ? "/admin" : "/reports"} replace />;
}

function PasswordInput({
  id,
  autoComplete,
  invalid,
}: {
  id: string;
  autoComplete: string;
  invalid: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        className="h-11 pr-11 md:h-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const auth = useAuth();
  const { redirect, mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initialMode ?? "sign-in");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ kind: "confirm" | "reset"; email: string } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const backendReady = useBackendReady();

  if (auth.status === "loading") return <PageLoader />;
  if (auth.status === "signed_in") return <SignedInRedirect redirect={redirect} />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setUnconfirmed(null);
  };

  // Confirmation links come back to this page, which then sends each user to the right place.
  const confirmRedirect = () =>
    `${window.location.origin}/auth${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`;

  async function resendConfirmation() {
    if (!unconfirmed || busy) return;
    setFormError(null);
    setBusy(true);
    try {
      const { error } = await db.auth.resend({
        type: "signup",
        email: unconfirmed,
        options: { emailRedirectTo: confirmRedirect() },
      });
      if (error) return setFormError(friendlyError(error));
      setSent({ kind: "confirm", email: unconfirmed });
      setUnconfirmed(null);
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setErrors({});
    setFormError(null);
    setUnconfirmed(null);
    setBusy(true);
    try {
      await submit(form);
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submit(form: FormData) {
    const value = (name: string) => String(form.get(name) ?? "");
    const origin = window.location.origin;

    if (mode === "forgot") {
      const parsed = email.safeParse(value("email"));
      if (!parsed.success) return setErrors({ email: parsed.error.issues[0]?.message });
      const { error } = await db.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${origin}/reset-password`,
      });
      if (error) return setFormError(friendlyError(error));
      return setSent({ kind: "reset", email: parsed.data });
    }

    if (mode === "sign-in") {
      const parsed = signInSchema.safeParse({ email: value("email"), password: value("password") });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      const { error } = await db.auth.signInWithPassword(parsed.data);
      if (error) {
        setFormError(friendlyError(error));
        if (/Email not confirmed/i.test(error.message)) setUnconfirmed(parsed.data.email);
      }
      return;
    }

    const parsed = signUpSchema.safeParse({
      first_name: value("first_name"),
      last_name: value("last_name"),
      suburb: value("suburb"),
      street_address: value("street_address"),
      email: value("email"),
      password: value("password"),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const d = parsed.data;
    const { data, error } = await db.auth.signUp({
      email: d.email,
      password: d.password,
      options: {
        emailRedirectTo: confirmRedirect(),
        // Copied into the profile by the database (handle_new_user); never used for access.
        data: {
          first_name: d.first_name,
          last_name: d.last_name,
          suburb: d.suburb === OUTSIDE_WARD ? null : d.suburb,
          lives_in_ward: d.suburb !== OUTSIDE_WARD,
          street_address: d.street_address || null,
        },
      },
    });
    if (error) return setFormError(friendlyError(error));
    // With email confirmation on, an already-registered email comes back with no identities.
    if (data.user && data.user.identities?.length === 0) {
      return setFormError(
        "An account with this email already exists. Sign in instead, or reset your password.",
      );
    }
    if (!data.session) setSent({ kind: "confirm", email: d.email });
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl lg:grid-cols-[1fr_480px] lg:gap-12 lg:px-4 lg:py-12">
      <aside className="relative hidden overflow-hidden rounded-2xl bg-primary p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-sm font-semibold tracking-wider text-teal-200 uppercase">{APP_NAME}</p>
          <h1 className="mt-3 text-4xl leading-tight font-bold">{TAGLINE}</h1>
          <p className="mt-4 max-w-md text-white/75">
            Register the municipal faults you have logged with the City, track their progress and
            escalate unresolved issues to the Ward 109 Councillor.
          </p>
        </div>
        <ul className="relative space-y-3 text-sm">
          {[
            "Your complaints are private to you and the ward office",
            "Get a W109 tracking number for every complaint",
            "Follow every update until the fault is resolved",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2.5">
              <CheckCircle2 className="size-5 shrink-0 text-teal-300" /> {t}
            </li>
          ))}
        </ul>
      </aside>

      <div className="px-4 py-10 sm:px-6 lg:px-0 lg:py-4">
        {sent ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-teal">
              <MailCheck className="size-7" />
            </span>
            <h2 className="mt-5 text-2xl font-bold">Check your email</h2>
            <p className="mt-2 text-muted-foreground">
              {sent.kind === "confirm" ? (
                <>
                  We sent a confirmation link to{" "}
                  <strong className="text-foreground">{sent.email}</strong>. Open it to activate
                  your account, then sign in.
                </>
              ) : (
                <>
                  If an account exists for <strong className="text-foreground">{sent.email}</strong>
                  , you will receive a link to choose a new password.
                </>
              )}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Didn't get it? Check your spam folder.
            </p>
            <Button
              className="mt-6"
              variant="outline"
              onClick={() => {
                setSent(null);
                switchMode("sign-in");
              }}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold">
              {mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create your account"
                  : "Reset your password"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "sign-in" ? (
                <>
                  New to {APP_NAME}?{" "}
                  <button
                    type="button"
                    className="font-semibold text-teal hover:underline"
                    onClick={() => switchMode("sign-up")}
                  >
                    Create an account
                  </button>
                </>
              ) : mode === "sign-up" ? (
                <>
                  Already registered?{" "}
                  <button
                    type="button"
                    className="font-semibold text-teal hover:underline"
                    onClick={() => switchMode("sign-in")}
                  >
                    Sign in
                  </button>
                </>
              ) : (
                "Enter your email and we'll send you a reset link."
              )}
            </p>

            {backendReady.data === false && (
              <Notice className="mt-5" title="Fault reporting is being set up">
                You can register or sign in below. Fault reporting will be available once setup is
                complete.
              </Notice>
            )}

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              {mode === "sign-up" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="first_name" label="First name" error={errors.first_name}>
                      <Input
                        id="first_name"
                        name="first_name"
                        autoComplete="given-name"
                        maxLength={60}
                        aria-invalid={!!errors.first_name}
                        className="h-11 md:h-10"
                      />
                    </Field>
                    <Field id="last_name" label="Surname" error={errors.last_name}>
                      <Input
                        id="last_name"
                        name="last_name"
                        autoComplete="family-name"
                        maxLength={60}
                        aria-invalid={!!errors.last_name}
                        className="h-11 md:h-10"
                      />
                    </Field>
                  </div>
                  <Field id="suburb" label="Location (suburb)" error={errors.suburb}>
                    <NativeSelect
                      id="suburb"
                      name="suburb"
                      defaultValue=""
                      aria-invalid={!!errors.suburb}
                    >
                      <option value="" disabled>
                        Choose your suburb
                      </option>
                      {WARD_SUBURBS.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name}
                          {s.partial ? " (part)" : ""}
                        </option>
                      ))}
                      <option value={OUTSIDE_WARD}>I live outside Ward 109</option>
                    </NativeSelect>
                  </Field>
                  <Field
                    id="street_address"
                    label="Street address"
                    optional
                    error={errors.street_address}
                  >
                    <Input
                      id="street_address"
                      name="street_address"
                      autoComplete="street-address"
                      maxLength={200}
                      placeholder="e.g. 12 Example Road"
                      className="h-11 md:h-10"
                    />
                  </Field>
                </>
              )}

              <Field id="email" label="Email address" error={errors.email}>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={!!errors.email}
                  className="h-11 md:h-10"
                />
              </Field>

              {mode !== "forgot" && (
                <Field
                  id="password"
                  label="Password"
                  error={errors.password}
                  hint={
                    mode === "sign-up"
                      ? "At least 8 characters, with a letter and a number."
                      : undefined
                  }
                >
                  <PasswordInput
                    id="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    invalid={!!errors.password}
                  />
                </Field>
              )}

              {mode === "sign-in" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm font-medium text-teal hover:underline"
                    onClick={() => switchMode("forgot")}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === "sign-up" && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  By creating an account you agree that the Ward 109 office may process your details
                  to handle your complaints, as described in the{" "}
                  <Link to="/privacy" className="font-medium text-teal hover:underline">
                    privacy notice
                  </Link>
                  .
                </p>
              )}

              {formError && (
                <Notice tone="error">
                  {formError}
                  {unconfirmed && (
                    <button
                      type="button"
                      className="mt-1 block font-semibold underline underline-offset-2"
                      onClick={resendConfirmation}
                      disabled={busy}
                    >
                      Resend the confirmation email
                    </button>
                  )}
                </Notice>
              )}

              <Button
                type="submit"
                className="h-11 w-full text-base md:h-10 md:text-sm"
                disabled={busy}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "sign-in"
                  ? "Sign in"
                  : mode === "sign-up"
                    ? "Create account"
                    : "Send reset link"}
              </Button>

              {mode === "forgot" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => switchMode("sign-in")}
                >
                  Back to sign in
                </Button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
