import { readFileSync } from "node:fs";
import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in your local environment.");
const sql = postgres(process.env.DATABASE_URL, {
  ssl: "require",
  max: 1,
  prepare: false,
  onnotice: () => {},
});
try {
  await sql.unsafe(
    readFileSync(new URL("./automation/neighbourhood-news.sql", import.meta.url), "utf8"),
  );
  console.log("Hourly neighbourhood news job installed.");
  console.log("First sync:", await sql`select app_private.sync_neighbourhood_news() as imported`);
  console.log(
    "Sources:",
    await sql`select name, enabled, last_success_at, last_error from public.news_feeds`,
  );
} finally {
  await sql.end();
}
