import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { db } from "@/lib/db";
import type { Enums } from "@/lib/db-types";

type AuthState =
  | { status: "loading"; session: null }
  | { status: "signed_out"; session: null }
  | { status: "signed_in"; session: Session };

const AuthContext = createContext<AuthState>({ status: "loading", session: null });

// The session lives in browser storage, so it is only known after hydration.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", session: null });

  useEffect(() => {
    const apply = (session: Session | null) =>
      setState(
        session ? { status: "signed_in", session } : { status: "signed_out", session: null },
      );

    db.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = db.auth.onAuthStateChange((_event, session) => apply(session));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUserId() {
  return useAuth().session?.user.id ?? null;
}

type Role = Enums<"app_role">;

// UI hint only: row-level security decides what each role can actually read and change.
export function useRoles() {
  const userId = useUserId();
  const auth = useAuth();
  const query = useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.rpc("my_roles");
      if (error) throw error;
      return data.map((r) => r.role as Role);
    },
  });
  const roles = query.data ?? [];
  const has = (...wanted: Role[]) => roles.some((r) => wanted.includes(r));
  return {
    roles,
    isStaff: has("ward_admin", "councillor", "super_admin"),
    isCouncillor: has("councillor"),
    isSuperAdmin: has("super_admin"),
    isLiaison: has("municipal_liaison"),
    isLoading: auth.status === "loading" || (!!userId && query.isPending),
  };
}

export function useProfile() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db
        .from("profiles")
        .select(
          "id, first_name, last_name, full_name, email, mobile, preferred_contact, default_suburb_id, street_address",
        )
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
