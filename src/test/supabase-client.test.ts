import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db-types";

let client: SupabaseClient<Database> | undefined;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("VITE_SUPABASE_URL", "https://ward-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
});
afterEach(async () => {
  await client?.auth.stopAutoRefresh();
  client = undefined;
  localStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Direct Supabase access", () => {
  it("sends public requests directly to the configured backend using the publishable key", async () => {
    const request = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", request);
    const { supabase } = await import("@/lib/supabase");
    client = supabase;

    const { error } = await supabase.from("wards").select("id");

    expect(error).toBeNull();
    const [url, init] = request.mock.calls[0]!;
    expect(new URL(url).origin).toBe("https://ward-test.supabase.co");
    expect(init.headers.get("apikey")).toBe("sb_publishable_test_key");
    expect(init.headers.has("Authorization")).toBe(false);
  });

  it("keeps resident bearer tokens and stores the session in this browser", async () => {
    const token = [
      btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
      btoa(JSON.stringify({ sub: "resident", exp: Math.floor(Date.now() / 1000) + 3600 })),
      "signature",
    ].join(".");
    const request = vi.fn().mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      return path === "/auth/v1/token"
        ? Response.json({
            access_token: token,
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "refresh-test",
            user: { id: "resident", email: "resident@example.com" },
          })
        : Response.json([]);
    });
    vi.stubGlobal("fetch", request);
    const bridge = vi.spyOn(window, "postMessage");
    const { supabase } = await import("@/lib/supabase");
    client = supabase;

    const { error } = await supabase.auth.signInWithPassword({
      email: "resident@example.com",
      password: "Password123",
    });
    expect(error).toBeNull();
    await supabase.from("profiles").select("id");

    const [, init] = request.mock.calls.at(-1)!;
    expect(init.headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(localStorage.getItem("sb-ward-test-auth-token")).toContain(token);
    expect(bridge).not.toHaveBeenCalled();
  });

  it("reports missing browser configuration without contacting another backend", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const { supabase } = await import("@/lib/supabase");

    expect(() => supabase.auth).toThrow("Set VITE_SUPABASE_URL");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a secret key in browser configuration", async () => {
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_secret_do_not_ship");
    const { supabase } = await import("@/lib/supabase");

    expect(() => supabase.auth).toThrow("Use a Supabase publishable key");
  });
});
