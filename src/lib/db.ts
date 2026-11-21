// Resident requests use the publishable Supabase client and database row-level security.
export { supabase as db } from "@/lib/supabase";

// Turns Supabase/Postgres errors into messages residents can act on.
export function friendlyError(error: unknown): string {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (
    code === "signup_disabled" ||
    /signups? (are |is )?not allowed|signups? (are |is )?disabled/i.test(message)
  ) {
    return "New account registration is temporarily unavailable. If you already have an account, you can still sign in.";
  }
  if (code === "email_provider_disabled") {
    return "Email sign-in is temporarily unavailable. Please try again later.";
  }
  if (/Database error (saving new user|creating new user|querying schema)/i.test(message)) {
    return "We couldn't complete your account request. Please contact the ward office or try again later.";
  }
  if (/Email address not authorized/i.test(message)) {
    return "We can't send a confirmation email to this address yet. The ward office is setting up email delivery. Please try again later.";
  }
  if (/Email not confirmed/i.test(message)) {
    return "Please confirm your email address first. Check your inbox (and spam folder) for the confirmation link.";
  }
  if (/Invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/User already registered/i.test(message)) {
    return "An account with this email already exists. Sign in instead, or reset your password.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (/Could not find the (table|function)|schema cache/i.test(message)) {
    return "The service is still being set up. Please try again later.";
  }
  if (/row-level security|permission denied|Not authorised/i.test(message)) {
    return "You don't have permission to do that.";
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return "No connection. Check your internet and try again.";
  }
  return message || "Something went wrong. Please try again.";
}
