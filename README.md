# Ward Watch And Resolve

Hello 👋

To resolve any issue, please log it directly with the respective City entities; faults not logged first cannot be tracked or resolved.

Log your issue online:
💦 _Joburg Water_ – https://jwfaultlogging.jwater.co.za

💡 _City Power_ – https://citypower.mobi

🛣 _JRA (roads | potholes | kerb | stormwater)_ – hotline@jra.org.za

🍃 _City Parks_ – joburgconnect@joburg.org.za

🗑 _Pikitup (refuse)_ – info@pikitup.co.za

🚔 _JMPD_ – 011 375 5911

🧾 _Revenue & Billing_ – regionErevenue@joburg.org.za

📊 _E-Joburg_ – https://www.e-joburg.org.za

📱 _CoJ Central App_ – Log & track everything in one place:
• Android – https://bit.ly/4ucfYc4
• iPhone – https://bit.ly/42WsUH4

👉 Unresolved? Escalate to me
Full Name:
Contact Number:
Address:
Issue:
Reference Number (requirement):
Date & Time Logged:
Details:

*A picture if necessary

Regards,
Charlene Olivia McCord
Councillor Ward 109 | City of Johannesburg create a system to track for DA Political party. i want a fault login system, they should be able to upload faults , a system where people can login and report faults around the area where DA is in charge

The app runs independently with TanStack Start, React, Tailwind CSS, and Supabase.

## Development

Use Node.js 22.12 or newer and Bun (the dependency lockfile is `bun.lock`).
Copy `.env.example` to `.env.local` and configure your own Supabase project URL
and publishable key. An existing `.env.local` can be kept as-is.

```sh
bun install --frozen-lockfile
bun run dev
```

Account sessions stay in the browser and requests go directly to Supabase.
Never put a database password, service role key, or secret API key in a `VITE_` variable.
Keep `SUPABASE_SECRET_KEY` in the ignored `.env.local` file or server deployment secrets.
`SUPABASE_JWKS_URL` identifies the project's public token-verification keys.
Database row rules protect resident records, and evidence files use private storage.

## Database setup

The Ward 109 schema and reference data are in `db/migrations/`. Set `DATABASE_URL`
in the process environment to the Supabase Session pooler connection string,
then inspect and apply pending migrations:

```sh
node db/migrate.mjs --dry-run
node db/migrate.mjs
```

The Supabase API secret key cannot replace `DATABASE_URL` for schema migrations.
The older `drizzle/migrations/` directory is retained as historical migration records;
it is not the active migration workflow.

For a new empty project, `db/setup-all.sql` is also available for the Supabase SQL
Editor. Inspect an existing database before applying it: it creates the full schema.
Email signup must be enabled in Supabase Auth. Keep email confirmation enabled and
allow the deployed app's `/auth` and `/reset-password` URLs in Auth redirect settings.
Staff access is provisioned only for trusted verified email addresses.

## Validation and production

```sh
bun run test
bun run build
node .output/server/index.mjs
```

The production build includes a standalone Node server in `.output/server` and
static assets in `.output/public`. Supply the two `VITE_SUPABASE_*` variables at
build time for the deployment's Supabase project.
