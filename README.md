# Ward Resolve

Community fault reporting for every resident, regardless of political affiliation.
No party membership is required. Reporting currently serves Ward 109, Johannesburg;
accounts are also open to people who live outside the ward.

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
Councillor Ward 109 | City of Johannesburg

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

## Tickets, community and news

Residents can save drafts, submit a fault with a municipal reference, track its
status under My tickets, and exchange private messages with verified ward staff.
The notifications bell shows new replies and progress updates. Ticket messages
refresh every 15 seconds while open; ticket progress refreshes every 30 seconds.
In-app delivery works independently of email. Outgoing notification email, SMS
and WhatsApp still require a separate delivery worker/provider.

The Community channel supports public resident blog posts, editing and deletion.
Only the author's first name is published. Ward staff can hide/restore posts with
a moderation reason under Ward management → Community posts. Editing a hidden
post keeps it hidden until staff restore it. Fault records and ticket messages
never appear in the public community channel.

The News tab combines published staff announcements with attributed publisher
headlines. After applying migrations, install the hourly Supabase Cron worker:

```sh
node --env-file=.env.local db/setup-news-automation.mjs
```

This enables `http` and `pg_cron`, imports the approved Sandton Chronicle RSS feed,
filters for the Sandton area, and deduplicates article links. Only headlines and
links are stored. Staff can pause imports and hide headlines under News & updates.
The worker accepts a fixed HTTPS publisher URL, has timeouts, and cannot be called
by browser users. Feed success/error status is shown to staff; Cron run history is
available in the Supabase dashboard. Re-running setup updates the same named job.

```sh
bun run test:db
bun run db:types
```

Database checks use embedded PostgreSQL and cover private ticket conversations,
public blogs, moderation, news imports and row rules as well as existing workflows.

## Mobile app

Ward Resolve installs as a mobile app straight from the website, with no app store.
Residents open `/app` (linked as **Get the app** in the mobile menu and footer):

- Android (Chrome, Samsung Internet, Edge): the **Install app** button adds it to the
  home screen and app drawer.
- iPhone and iPad: Share → **Add to Home Screen**, with step-by-step instructions on the page.
- Desktop Chrome and Edge: the install icon in the address bar.

The installed app opens full screen and offers Report, My tickets and News shortcuts on a long press.
It uses the same account and data as the website, and updates with each deployment.

The pieces are `public/manifest.webmanifest`, the icons in `public/icons/`, `public/sw.js`
and `public/offline.html`. The service worker only caches fingerprinted build files and
icons. It never caches pages, server functions or Supabase responses, because those can
contain residents' personal details. Without a connection it shows the offline page.
The service worker registers only in production builds, so `bun run dev` is unaffected.
Installation needs HTTPS, which Vercel provides.

## Dependency security

`package.json` overrides pin patched versions of transitive packages (seroval, zod, js-yaml,
nanoid, source-map-js and Vite). Run `bun audit` before each release. The remaining
brace-expansion advisory affects only ESLint's tooling and is not shipped to users.

## Vercel hosting

Import this repository in Vercel. `vercel.json` selects TanStack Start, Bun installs
the locked dependencies, and Nitro generates Vercel's server function and static
assets automatically. It also sets security headers (HSTS, no framing, no MIME
sniffing, and a permissions policy that allows only location and camera) and serves
the service worker uncached. The project uses Node.js 22. Leave the output directory at
the framework default; this application needs server rendering.
The setup follows [Vercel's TanStack Start guide](https://vercel.com/docs/frameworks/full-stack/tanstack-start).

Add these two build environment variables to the Vercel project:

- `VITE_SUPABASE_URL`: your Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: your Supabase publishable key.

Redeploy after changing build environment variables. The browser uses only these
public credentials. Database migrations and the news scheduler run separately in
Supabase, so Vercel does not need the database password or Supabase secret key.

After the first deployment, open Supabase **Authentication → URL Configuration**.
Set **Site URL** to the final production origin (Vercel domain or custom domain),
and add that origin's `/auth` and `/reset-password` URLs to the allowed redirects.
Configure the actual production domain instead of the earlier Lovable address.
Add exact preview origins separately if you want to test confirmation/reset there.
Keep email confirmation enabled and verify email delivery for residents before
launch. The app already builds confirmation/reset links from its current origin.

## Local production preview

```sh
bun run test
bun run build
node .output/server/index.mjs
```

The production build includes a standalone Node server in `.output/server` and
static assets in `.output/public`. Supply the two `VITE_SUPABASE_*` variables at
build time for the deployment's Supabase project.
