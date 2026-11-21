import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    }),
  },
}));

import { useBackendReady } from "@/hooks/use-backend-ready";

afterEach(cleanup);

function check() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return renderHook(useBackendReady, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("Reporting readiness", () => {
  it("reports incomplete setup when the schema is missing", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.wards'" },
    });
    const { result } = check();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("reports incomplete setup when active Ward 109 reference data is absent", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = check();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("reports ready when the ward is available", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "ward-109" }, error: null });
    const { result } = check();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it.each([
    { code: "", message: "Failed to fetch" },
    { code: "42501", message: "permission denied for table wards" },
  ])("does not report a backend failure as readiness: $message", async (error) => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error });
    const { result } = check();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
