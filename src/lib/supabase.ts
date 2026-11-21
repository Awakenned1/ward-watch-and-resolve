import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db-types";

function createSupabaseClient() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error(
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local or the build environment.",
    );
  }
  if (key.startsWith("sb_secret_")) {
    throw new Error("Use a Supabase publishable key in browser configuration.");
  }

  const inBrowser = typeof window !== "undefined";
  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
        // Opaque publishable keys belong in apikey; keep signed-in users' bearer tokens.
        if (key.startsWith("sb_publishable_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: {
      persistSession: inBrowser,
      autoRefreshToken: inBrowser,
      detectSessionInUrl: inBrowser,
    },
  });
}

// Lazy initialization lets SSR render signed-out screens before browser hydration.
let client: SupabaseClient<Database> | undefined;
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    client ??= createSupabaseClient();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
