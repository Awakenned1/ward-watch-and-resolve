import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sql: Object.assign(vi.fn(), { end: vi.fn(), begin: vi.fn() }),
  hasLedger: false,
}));
vi.mock("postgres", () => ({ default: () => mocks.sql }));
const originalArgs = process.argv;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  process.argv = ["node", "db/migrate.mjs", "--dry-run"];
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.sql.mockImplementation(async (query: TemplateStringsArray) =>
    query.join("").includes("to_regclass") ? [{ present: mocks.hasLedger }] : [],
  );
});
afterEach(() => {
  process.argv = originalArgs;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Database migration inspection", () => {
  it.each([false, true])(
    "keeps dry runs read-only when a migration ledger exists: %s",
    async (hasLedger) => {
      mocks.hasLedger = hasLedger;
      const runner = "../../db/migrate.mjs";
      await import(runner);

      expect(mocks.sql).toHaveBeenCalled();
      for (const [query] of mocks.sql.mock.calls) {
        expect(query.join("").trim()).toMatch(/^SELECT /);
      }
      expect(mocks.sql.begin).not.toHaveBeenCalled();
      expect(mocks.sql.end).toHaveBeenCalledOnce();
      expect(console.log).toHaveBeenCalledWith("Dry run complete.");
    },
  );
});
