// Applies db/migrations/*.sql to a Supabase Postgres database, once each, in order.
// Usage (the URL is a secret: pass it inline, never commit it):
//   DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres" node db/migrate.mjs [--dry-run]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the project's Session pooler connection string.");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const sql = postgres(url, { max: 1, ssl: "require", onnotice: () => {} });
try {
  // A dry run must not create the schema or migration ledger.
  let hasLedger = true;
  if (dryRun) {
    const [state] = await sql`
      SELECT to_regclass('app_private.schema_migrations') IS NOT NULL AS present`;
    hasLedger = state.present;
  } else {
    // Kept out of the API-exposed public schema.
    await sql`CREATE SCHEMA IF NOT EXISTS app_private`;
    await sql`REVOKE ALL ON SCHEMA app_private FROM PUBLIC`;
    await sql`
      CREATE TABLE IF NOT EXISTS app_private.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;
  }
  const applied = new Map(
    (hasLedger ? await sql`SELECT name, checksum FROM app_private.schema_migrations` : []).map(
      (r) => [r.name, r.checksum],
    ),
  );

  for (const file of files) {
    const body = readFileSync(join(dir, file), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`${file} was changed after it was applied. Add a new migration instead.`);
      }
      console.log(`skip   ${file}`);
      continue;
    }
    if (dryRun) {
      console.log(`would apply ${file}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO app_private.schema_migrations (name, checksum) VALUES (${file}, ${checksum})`;
    });
    console.log(`apply  ${file}`);
  }
  if (!dryRun) await sql`NOTIFY pgrst, 'reload schema'`;
  console.log(dryRun ? "Dry run complete." : "Database is up to date.");
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
