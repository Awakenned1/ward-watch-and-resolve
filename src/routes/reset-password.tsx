import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Field, Notice } from "@/components/app-ui";
import { PageLoader } from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { db, friendlyError } from "@/lib/db";
import { APP_NAME } from "@/lib/ward109";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: `Choose a new password · ${APP_NAME}` }] }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

// The reset link signs the user in with a short-lived recovery session; here they set a new password.
function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === "loading") return <PageLoader />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid password");
    if (password !== String(form.get("confirm") ?? "")) return setError("Passwords do not match");
    setBusy(true);
    const { error: updateError } = await db.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(friendlyError(updateError));
    toast.success("Password updated");
    navigate({ to: "/reports" });
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-teal">
          <KeyRound className="size-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Choose a new password</h1>
        {auth.status === "signed_out" ? (
          <Notice tone="warning" className="mt-6" title="This reset link has expired">
            Request a new link from the sign-in page.
          </Notice>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Field
              id="password"
              label="New password"
              hint="At least 8 characters, with a letter and a number."
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                className="h-11 md:h-10"
              />
            </Field>
            <Field id="confirm" label="Confirm new password">
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                className="h-11 md:h-10"
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" className="h-11 w-full md:h-10" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
