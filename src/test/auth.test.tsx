import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: { mode: "sign-up" as "sign-in" | "sign-up" | "forgot", redirect: undefined },
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => mocks.search }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  Navigate: () => null,
}));
vi.mock("@/components/site-layout", () => ({ PageLoader: () => <div>Loading</div> }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ status: "signed_out", session: null }),
  useRoles: () => ({ isStaff: false, isLoading: false }),
}));
vi.mock("@/hooks/use-backend-ready", () => ({
  useBackendReady: () => ({ data: false }),
}));
vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  db: { auth: mocks },
}));

import { Route } from "@/routes/auth";

const AuthPage = Route.options.component!;
const registered = {
  data: { user: { id: "resident", identities: [{ id: "email" }] }, session: null },
  error: null,
};

function credentials() {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "resident@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "Password123" },
  });
}

function registration() {
  credentials();
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Jane" } });
  fireEvent.change(screen.getByLabelText("Surname"), { target: { value: "Resident" } });
  fireEvent.change(screen.getByLabelText("Location (suburb)"), {
    target: { value: "outside" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search.mode = "sign-up";
  mocks.signUp.mockResolvedValue(registered);
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.resend.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("Account access while reporting is being set up", () => {
  it("accepts registration and requests confirmation without claiming accounts are closed", async () => {
    render(<AuthPage />);
    expect(screen.queryByText("Accounts are not open yet")).not.toBeInTheDocument();
    expect(screen.getByText("Fault reporting is being set up")).toBeInTheDocument();
    registration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "resident@example.com",
      password: "Password123",
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: {
          first_name: "Jane",
          last_name: "Resident",
          suburb: null,
          lives_in_ward: false,
          street_address: null,
        },
      },
    });
  });

  it("keeps sign-in available and reports invalid credentials", async () => {
    mocks.search.mode = "sign-in";
    mocks.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    render(<AuthPage />);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("allows retry after a rejected registration request", async () => {
    mocks.signUp.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AuthPage />);
    registration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check your internet");
    const retry = screen.getByRole("button", { name: "Create account" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });

  it("shows an actual server signup restriction without showing success", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "signup_disabled", message: "Signups not allowed for this instance" },
    });
    render(<AuthPage />);
    registration();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "New account registration is temporarily unavailable",
    );
    expect(screen.queryByRole("heading", { name: "Check your email" })).not.toBeInTheDocument();
  });

  it("recovers from a rejected confirmation resend", async () => {
    mocks.search.mode = "sign-in";
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    mocks.resend.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AuthPage />);
    credentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resend the confirmation email" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Check your internet"));
    const retry = screen.getByRole("button", { name: "Resend the confirmation email" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });

  it("recovers from a rejected password reset request", async () => {
    mocks.search.mode = "forgot";
    mocks.resetPasswordForEmail.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<AuthPage />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "resident@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Check your internet");
    const retry = screen.getByRole("button", { name: "Send reset link" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
  });
});
