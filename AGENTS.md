## Project conventions

- The app uses TanStack Start, Vite, and a directly configured Supabase backend.
- Preserve published git history; keep changes compatible with existing data.
- Add database changes in `db/migrations/` and apply them with `db/migrate.mjs`.
  Never change an already-applied migration; add a new one.
- Regenerate files marked as generated using their owning tools.
- Keep credentials in local environment files or deployment secrets. Only the
  Supabase project URL and publishable key may use the browser's `VITE_` prefix.

## Ward 109 fault reporting

- Keep report access private through database row rules; only report owners and the verified Ward 109 staff role can view resident records, because reports contain personal contact and address details.
- Grant the Ward 109 staff role only through trusted verified-email provisioning, never resident-editable metadata or client-side checks.
- Store optional fault photos in private storage and issue temporary links only after an authenticated access check, because residents' locations may be identifiable.
- Use the typed Supabase browser client in `src/lib/supabase.ts` for resident report screens and rely on the database's owner/staff rules for every read and write, because route visibility alone cannot protect direct data access.
