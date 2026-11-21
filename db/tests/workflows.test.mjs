// End-to-end checks of the Ward 109 Resolved schema and access rules (workflows A–E, privacy,
// files, statistics, roles) on an embedded Postgres. Run: node db/tests/workflows.test.mjs
// PGlite is resolved from PGLITE_PATH if set, otherwise from node_modules.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { PGlite } = await import(
  process.env.PGLITE_PATH ? pathToFileURL(process.env.PGLITE_PATH).href : "@electric-sql/pglite"
);
const db = new PGlite();

await db.exec(readFileSync(join(here, "supabase-stubs.sql"), "utf8"));
const migrationsDir = join(here, "..", "migrations");
for (const file of readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  console.log("applied", file);
}

let failures = 0;
let passes = 0;
async function as(userId, sql, params = []) {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(userId ? "SET ROLE authenticated" : "SET ROLE anon");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("RESET ROLE");
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
  }
}
const admin = (sql, params = []) => db.query(sql, params);
function pass(name, extra = "") {
  passes++;
  console.log("  PASS", name, extra);
}
function fail(name, why) {
  failures++;
  console.log("  FAIL", name, "->", why);
}
async function ok(name, fn, check = () => true) {
  try {
    const r = await fn();
    if (!check(r)) return fail(name, "unexpected result " + JSON.stringify(r.rows).slice(0, 300));
    pass(name);
    return r;
  } catch (e) {
    fail(name, e.message);
  }
}
async function denied(name, fn, match) {
  try {
    const r = await fn();
    const n = r?.affectedRows ?? r?.rows?.length;
    if (n === 0) return pass(name, "(0 rows)");
    fail(name, "was allowed: " + JSON.stringify(r?.rows).slice(0, 200));
  } catch (e) {
    if (match && !match.test(e.message)) return fail(name, "wrong error: " + e.message);
    pass(name, "-> " + e.message.split("\n")[0]);
  }
}
const one = (r) => r.rows[0];

// Fixtures ---------------------------------------------------------------------------------
const ward = one(await admin("SELECT id FROM public.wards WHERE ward_number = 109")).id;
const sub = async (name) =>
  one(await admin("SELECT id FROM public.suburbs WHERE name = $1", [name])).id;
const cat = async (slug) =>
  one(await admin("SELECT id FROM public.service_categories WHERE slug = $1", [slug])).id;
const issue = async (slug, name) =>
  one(
    await admin(
      "SELECT it.id FROM public.issue_types it JOIN public.service_categories c ON c.id = it.category_id WHERE c.slug = $1 AND it.name = $2",
      [slug, name],
    ),
  ).id;
const entity = async (slug) =>
  one(await admin("SELECT id FROM public.municipal_entities WHERE slug = $1", [slug])).id;

const WOODMEAD = await sub("Woodmead");
const EDENBURG = await sub("Edenburg");
const ROADS = await cat("roads");
const WATER = await cat("water");
const POTHOLE = await issue("roads", "Potholes");
const LEAK = await issue("water", "Water leak");
const JRA = await entity("jra");
const JW = await entity("joburg-water");

await admin(
  "INSERT INTO public.role_email_grants (email, role, ward_id) VALUES ('admin@ward109.test', 'ward_admin', $1)",
  [ward],
);
await admin(
  "INSERT INTO public.role_email_grants (email, role) VALUES ('super@ward109.test', 'super_admin')",
);
await admin(
  "INSERT INTO public.role_email_grants (email, role, ward_id, municipal_entity_id) VALUES ('liaison@jra.test', 'municipal_liaison', $1, $2)",
  [ward, JRA],
);
await admin(
  "INSERT INTO public.role_email_grants (email, role, ward_id, municipal_entity_id) VALUES ('liaison@jw.test', 'municipal_liaison', $1, $2)",
  [ward, JW],
);

const user = async (email, confirmed = true) =>
  one(
    await admin("INSERT INTO auth.users (email, email_confirmed_at) VALUES ($1, $2) RETURNING id", [
      email,
      confirmed ? new Date() : null,
    ]),
  ).id;
const R1 = await user("resident1@example.com");
const R2 = await user("resident2@example.com");
const ADMIN = await user("admin@ward109.test");
const COUNCILLOR = await user("CharleneMcCord109@gmail.com", false);
const LIAISON = await user("liaison@jra.test");
const LIAISON_JW = await user("liaison@jw.test");
const SUPER = await user("super@ward109.test");
const DEMO = await user("demo.resident@example.com");
await admin("UPDATE public.profiles SET is_demo = true WHERE id = $1", [DEMO]);

// Registration details --------------------------------------------------------------------
console.log("\nRegistration details (name, surname, location)");
const registered = async (email, meta) =>
  one(
    await admin(
      "INSERT INTO auth.users (email, email_confirmed_at, raw_user_meta_data) VALUES ($1, now(), $2) RETURNING id",
      [email, JSON.stringify(meta)],
    ),
  ).id;
const REG = await registered("thandi@example.com", {
  first_name: "  Thandi ",
  last_name: "Mokoena",
  suburb: "Wendywood",
  lives_in_ward: true,
  street_address: "12 Example Road",
});
await ok(
  "profile gets first name, surname, suburb and address",
  () =>
    as(
      REG,
      "SELECT p.first_name, p.last_name, p.full_name, p.street_address, p.lives_in_ward, s.name AS suburb FROM public.profiles p LEFT JOIN public.suburbs s ON s.id = p.default_suburb_id WHERE p.id = $1",
      [REG],
    ),
  (r) =>
    one(r).first_name === "Thandi" &&
    one(r).last_name === "Mokoena" &&
    one(r).full_name === "Thandi Mokoena" &&
    one(r).suburb === "Wendywood" &&
    one(r).street_address === "12 Example Road" &&
    one(r).lives_in_ward === true,
);
const FAKE = await registered("fake@example.com", {
  first_name: "A",
  last_name: "B",
  suburb: "Atlantis",
});
await ok(
  "unknown suburb is not saved",
  () => admin("SELECT default_suburb_id, lives_in_ward FROM public.profiles WHERE id = $1", [FAKE]),
  (r) => one(r).default_suburb_id === null && one(r).lives_in_ward === null,
);
const OUTSIDER = await registered("outside@example.com", {
  first_name: "Sipho",
  last_name: "Dlamini",
  suburb: null,
  lives_in_ward: false,
});
await ok(
  "resident outside Ward 109 recorded as such",
  () =>
    admin("SELECT lives_in_ward, default_suburb_id FROM public.profiles WHERE id = $1", [OUTSIDER]),
  (r) => one(r).lives_in_ward === false && one(r).default_suburb_id === null,
);
await ok(
  "junk metadata does not block sign-up",
  async () => ({
    rows: [
      {
        id: await registered("junk@example.com", {
          lives_in_ward: "maybe",
          first_name: "x".repeat(500),
          suburb: 42,
        }),
      },
    ],
  }),
  (r) => !!one(r).id,
);
await ok(
  "resident can correct their own name",
  () => as(REG, "UPDATE public.profiles SET first_name = 'Thandiwe' WHERE id = $1", [REG]),
  (r) => r.affectedRows === 1,
);
await ok(
  "other residents cannot see registration details",
  () => as(OUTSIDER, "SELECT first_name FROM public.profiles WHERE id = $1", [REG]),
  (r) => r.rows.length === 0,
);

const DRAFT_SQL = `INSERT INTO public.complaints (resident_id, ward_id, category_id, issue_type_id, suburb_id, description, status)
  VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id, tracking_number, status, municipal_entity_id`;
const SUBMIT_SQL = `UPDATE public.complaints SET
  contact_name = $2, contact_mobile = '082 123 4567', street_address = '12 Example Road', street_name = 'Example Road',
  municipal_reported = true, municipal_reference_number = $3, municipal_logged_at = now() - interval '3 days',
  consent_at = now(), consent_version = '2026-11', status = 'submitted'
  WHERE id = $1 RETURNING tracking_number, status, submitted_at`;
async function submitted(
  owner,
  category = ROADS,
  issueType = POTHOLE,
  suburb = WOODMEAD,
  ref = "JRA-1001",
) {
  const id = one(
    await as(owner, DRAFT_SQL, [
      owner,
      ward,
      category,
      issueType,
      suburb,
      "Large pothole damaging tyres outside number 12",
    ]),
  ).id;
  await as(owner, SUBMIT_SQL, [id, "Test Resident", ref]);
  return id;
}

// Roles ---------------------------------------------------------------------------------------
console.log("\nRoles and provisioning");
await ok(
  "ward admin role granted from verified email",
  () => as(ADMIN, "SELECT public.is_ward_staff($1) s", [ward]),
  (r) => one(r).s === true,
);
await ok(
  "councillor not granted before email confirmed",
  () => as(COUNCILLOR, "SELECT count(*)::int n FROM public.my_roles()"),
  (r) => one(r).n === 0,
);
await admin("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1", [COUNCILLOR]);
await ok(
  "councillor granted after confirmation (email case-insensitive)",
  () => as(COUNCILLOR, "SELECT role FROM public.my_roles()"),
  (r) => one(r)?.role === "councillor",
);
await ok(
  "resident has no elevated roles",
  () => as(R1, "SELECT count(*)::int n FROM public.my_roles()"),
  (r) => one(r).n === 0,
);
await denied("resident cannot grant themselves a role", () =>
  as(
    R1,
    "INSERT INTO public.user_roles (user_id, role, ward_id, granted_by) VALUES ($1, 'ward_admin', $2, $1)",
    [R1, ward],
  ),
);
await denied("ward admin cannot grant roles", () =>
  as(
    ADMIN,
    "INSERT INTO public.user_roles (user_id, role, ward_id, granted_by) VALUES ($1, 'ward_admin', $2, $3)",
    [R2, ward, ADMIN],
  ),
);
await denied("resident cannot read role email grants", () =>
  as(R1, "SELECT * FROM public.role_email_grants"),
);
await ok("super admin grants a role", () =>
  as(
    SUPER,
    "INSERT INTO public.user_roles (user_id, role, ward_id, granted_by) VALUES ($1, 'ward_admin', $2, $3) RETURNING id",
    [R2, ward, SUPER],
  ),
);
await ok(
  "super admin revokes it",
  () => as(SUPER, "DELETE FROM public.user_roles WHERE user_id = $1", [R2]),
  (r) => r.affectedRows === 1,
);
await denied("resident cannot flip own demo flag", () =>
  as(R1, "UPDATE public.profiles SET is_demo = true WHERE id = $1", [R1]),
);
await ok(
  "resident updates own profile",
  () =>
    as(
      R1,
      "UPDATE public.profiles SET full_name = 'Resident One', mobile = '0821234567' WHERE id = $1",
      [R1],
    ),
  (r) => r.affectedRows === 1,
);
await ok(
  "resident cannot see other profiles",
  () => as(R1, "SELECT id FROM public.profiles"),
  (r) => r.rows.length === 1,
);
await ok(
  "staff can see resident profiles",
  () => as(ADMIN, "SELECT id FROM public.profiles"),
  (r) => r.rows.length >= 8,
);

// Workflow A ------------------------------------------------------------------------------------
console.log("\nWorkflow A: register, log, submit, tracking number");
await ok(
  "public can read municipal directory",
  () => as(null, "SELECT name, verification_status FROM public.municipal_entities"),
  (r) => r.rows.length === 9 && r.rows.every((e) => e.verification_status === "pending"),
);
await ok(
  "public can read suburbs and categories",
  () =>
    as(
      null,
      "SELECT (SELECT count(*) FROM public.suburbs)::int s, (SELECT count(*) FROM public.service_categories)::int c",
    ),
  (r) => one(r).s === 11 && one(r).c === 8,
);
const draft = await ok(
  "resident saves a draft without a reference",
  () =>
    as(R1, DRAFT_SQL, [
      R1,
      ward,
      ROADS,
      POTHOLE,
      WOODMEAD,
      "Large pothole damaging tyres outside number 12",
    ]),
  (r) => one(r).tracking_number === null && one(r).municipal_entity_id === JRA,
);
const C1 = draft && one(draft).id;
await denied(
  "cannot submit without a municipal reference",
  () =>
    as(
      R1,
      "UPDATE public.complaints SET contact_name='X', contact_mobile='0821234567', street_address='12 Example Road', consent_at=now(), status='submitted' WHERE id=$1",
      [C1],
    ),
  /check constraint/,
);
const sub1 = await ok(
  "submitting issues a W109-YYYY-000001 tracking number",
  () => as(R1, SUBMIT_SQL, [C1, "Resident One", "JRA-1001"]),
  (r) => /^W109-\d{4}-000001$/.test(one(r).tracking_number) && one(r).status === "submitted",
);
await ok(
  "submission recorded in status history",
  () =>
    as(R1, "SELECT to_status FROM public.complaint_status_history WHERE complaint_id = $1", [C1]),
  (r) => r.rows.length === 1 && one(r).to_status === "submitted",
);
await ok(
  "resident notified (in-app + email queued)",
  () =>
    as(
      R1,
      "SELECT channel, title FROM public.notifications WHERE complaint_id = $1 ORDER BY channel",
      [C1],
    ),
  (r) => r.rows.length === 2 && r.rows[0].title.includes("registered"),
);
await denied("resident cannot edit after submission", () =>
  as(R1, "UPDATE public.complaints SET description = 'Changed after submitting it' WHERE id = $1", [
    C1,
  ]),
);
await denied("resident cannot delete a submitted complaint", () =>
  as(R1, "DELETE FROM public.complaints WHERE id = $1", [C1]),
);
await denied(
  "resident cannot pre-assign staff",
  () =>
    as(
      R1,
      "INSERT INTO public.complaints (resident_id, ward_id, assigned_admin_id) VALUES ($1, $2, $1)",
      [R1, ward],
    ),
  /staff-only/,
);
await denied("resident cannot file as someone else", () =>
  as(R1, "INSERT INTO public.complaints (resident_id, ward_id) VALUES ($1, $2)", [R2, ward]),
);
await denied("resident cannot insert straight to resolved", () =>
  as(
    R1,
    "INSERT INTO public.complaints (resident_id, ward_id, status) VALUES ($1, $2, 'resolved')",
    [R1, ward],
  ),
);
await ok(
  "other resident sees none of it",
  () => as(R2, "SELECT id FROM public.complaints"),
  (r) => r.rows.length === 0,
);
await denied("anonymous visitors cannot read complaints", () =>
  as(null, "SELECT id FROM public.complaints"),
);
await ok(
  "second complaint gets the next number",
  async () => {
    const id = await submitted(R2, WATER, LEAK, WOODMEAD, "JW-555");
    return as(R2, "SELECT tracking_number FROM public.complaints WHERE id = $1", [id]);
  },
  (r) => /-000002$/.test(one(r).tracking_number),
);

// Workflow B ----------------------------------------------------------------------------------------
console.log("\nWorkflow B: admin review, assignment, follow-up");
await ok(
  "ward admin sees all complaints",
  () => as(ADMIN, "SELECT id FROM public.complaints"),
  (r) => r.rows.length === 2,
);
await denied(
  "cannot assign a complaint to a resident",
  () => as(ADMIN, "SELECT public.assign_complaint($1, $2)", [C1, R2]),
  /ward staff/,
);
await ok("admin assigns complaint to themselves", () =>
  as(ADMIN, "SELECT public.assign_complaint($1, $2)", [C1, ADMIN]),
);
await ok(
  "assignment recorded",
  () =>
    as(
      ADMIN,
      "SELECT assigned_to FROM public.complaint_assignments WHERE complaint_id = $1 AND ended_at IS NULL",
      [C1],
    ),
  (r) => one(r)?.assigned_to === ADMIN,
);
await denied(
  "resident cannot call staff status change",
  () => as(R1, "SELECT public.change_complaint_status($1, 'resolved')", [C1]),
  /Not authorised/,
);
await ok("admin moves to Under Review with a public note", () =>
  as(
    ADMIN,
    "SELECT public.change_complaint_status($1, 'under_review', 'Reference verified with JRA.', true)",
    [C1],
  ),
);
await ok(
  "admin verifies the reference",
  () =>
    as(
      ADMIN,
      "UPDATE public.complaints SET reference_verified_at = now(), reference_verified_by = $2, next_follow_up_at = now() + interval '7 days' WHERE id = $1",
      [C1, ADMIN],
    ),
  (r) => r.affectedRows === 1,
);
await ok(
  "status note visible to resident",
  () =>
    as(
      R1,
      "SELECT note FROM public.complaint_status_history WHERE complaint_id = $1 AND to_status = 'under_review'",
      [C1],
    ),
  (r) => one(r)?.note === "Reference verified with JRA.",
);
await ok(
  "resident notified of status update",
  () =>
    as(
      R1,
      "SELECT body FROM public.notifications WHERE complaint_id = $1 AND event = 'status_updated' AND channel = 'in_app'",
      [C1],
    ),
  (r) => one(r)?.body.includes("Under Review"),
);
await ok("admin adds internal note", () =>
  as(
    ADMIN,
    "INSERT INTO public.internal_notes (complaint_id, author_id, body) VALUES ($1, $2, 'Called JRA depot, awaiting crew') RETURNING id",
    [C1, ADMIN],
  ),
);
await ok(
  "resident cannot read internal notes",
  () => as(R1, "SELECT id FROM public.internal_notes"),
  (r) => r.rows.length === 0,
);
await ok(
  "liaison cannot read internal notes",
  () => as(LIAISON, "SELECT id FROM public.internal_notes"),
  (r) => r.rows.length === 0,
);
await ok("admin creates follow-up task", () =>
  as(
    ADMIN,
    "INSERT INTO public.follow_up_tasks (complaint_id, title, assigned_to, created_by, due_at) VALUES ($1, 'Chase JRA depot', $2, $2, now() + interval '2 days') RETURNING id",
    [C1, ADMIN],
  ),
);
await ok(
  "resident cannot see tasks",
  () => as(R1, "SELECT id FROM public.follow_up_tasks"),
  (r) => r.rows.length === 0,
);
await ok(
  "private (staff-only) status note hidden from resident",
  async () => {
    await as(
      ADMIN,
      "SELECT public.change_complaint_status($1, 'awaiting_municipal_feedback', 'Internal: depot unresponsive', false)",
      [C1],
    );
    return as(
      R1,
      "SELECT note FROM public.complaint_status_history WHERE complaint_id = $1 AND to_status = 'awaiting_municipal_feedback'",
      [C1],
    );
  },
  (r) => r.rows.length === 0,
);

// Workflow C -------------------------------------------------------------------------------------------
console.log("\nWorkflow C: escalation Resident → Admin → Councillor → Liaison");
await denied(
  "other resident cannot escalate",
  () => as(R2, "SELECT public.request_escalation($1, 'Still not fixed after two weeks')", [C1]),
  /not found/,
);
const esc = await ok(
  "resident requests escalation",
  () =>
    as(
      R1,
      "SELECT public.request_escalation($1, 'Still not fixed after two weeks', 'Car tyre damaged') AS id",
      [C1],
    ),
  (r) => !!one(r).id,
);
const E1 = esc && one(esc).id;
await denied(
  "cannot open a second escalation",
  () => as(R1, "SELECT public.request_escalation($1, 'Asking again for escalation')", [C1]),
  /already open/,
);
await ok(
  "complaint shows Escalation Requested",
  () => as(R1, "SELECT status FROM public.complaints WHERE id = $1", [C1]),
  (r) => one(r).status === "escalation_requested",
);
await ok(
  "configured turnaround blocks early escalation",
  async () => {
    await as(
      ADMIN,
      "UPDATE public.escalation_rules SET turnaround_days = 30 WHERE category_id = $1",
      [WATER],
    );
    const id = (await as(R2, "SELECT id FROM public.complaints WHERE resident_id = $1", [R2]))
      .rows[0].id;
    try {
      await as(R2, "SELECT public.request_escalation($1, 'Leak still running down the street')", [
        id,
      ]);
      return { rows: [{ blocked: false }] };
    } catch (e) {
      return { rows: [{ blocked: /available from/.test(e.message) }] };
    }
  },
  (r) => one(r).blocked === true,
);
await ok(
  "urgent safety pathway bypasses turnaround",
  async () => {
    const id = (await as(R2, "SELECT id FROM public.complaints WHERE resident_id = $1", [R2]))
      .rows[0].id;
    await as(
      R2,
      "SELECT public.request_escalation($1, 'Water flooding into the road, risk to drivers', NULL, true)",
      [id],
    );
    return as(R2, "SELECT priority, status FROM public.complaints WHERE id = $1", [id]);
  },
  (r) => one(r).priority === "urgent" && one(r).status === "escalation_requested",
);
await denied(
  "resident cannot advance escalation",
  () => as(R1, "SELECT public.advance_escalation($1, 'with_councillor')", [E1]),
  /Not authorised/,
);
await ok("admin reviews escalation", () =>
  as(
    ADMIN,
    "SELECT public.advance_escalation($1, 'admin_review', 'Checked: reference valid, 14 days open')",
    [E1],
  ),
);
await ok("councillor takes escalation", () =>
  as(
    COUNCILLOR,
    "SELECT public.advance_escalation($1, 'with_councillor', 'Will raise with JRA regional manager')",
    [E1],
  ),
);
await ok(
  "complaint shows Escalated to Councillor",
  () => as(R1, "SELECT status FROM public.complaints WHERE id = $1", [C1]),
  (r) => one(r).status === "escalated_to_councillor",
);
await ok(
  "resident notified of escalation",
  () =>
    as(
      R1,
      "SELECT id FROM public.notifications WHERE complaint_id = $1 AND event = 'complaint_escalated' AND channel = 'in_app'",
      [C1],
    ),
  (r) => r.rows.length === 1,
);
await ok(
  "councillor notes stay internal",
  () => as(R1, "SELECT id FROM public.internal_notes WHERE escalation_id = $1", [E1]),
  (r) => r.rows.length === 0,
);
await ok("councillor refers to liaison", () =>
  as(COUNCILLOR, "SELECT public.advance_escalation($1, 'with_liaison')", [E1]),
);
await ok(
  "JRA liaison sees the roads complaint",
  () => as(LIAISON, "SELECT id FROM public.complaints"),
  (r) => r.rows.length === 1 && one(r).id === C1,
);
await ok(
  "Joburg Water liaison does not see it",
  () => as(LIAISON_JW, "SELECT id FROM public.complaints WHERE id = $1", [C1]),
  (r) => r.rows.length === 0,
);
await denied(
  "other liaison cannot respond",
  () => as(LIAISON_JW, "SELECT public.record_liaison_response($1, 'Not ours')", [C1]),
  /Not authorised/,
);
await denied(
  "liaison cannot close a complaint",
  () => as(LIAISON, "SELECT public.record_liaison_response($1, 'Closing', 'closed')", [C1]),
  /only report progress/,
);
await ok("liaison records response and reports resolution", () =>
  as(
    LIAISON,
    "SELECT public.record_liaison_response($1, 'Pothole patched on 18 Nov by JRA crew.', 'resolution_reported')",
    [C1],
  ),
);

// Workflow D --------------------------------------------------------------------------------------------
console.log("\nWorkflow D: resolution reported → resident confirms → closed");
await ok(
  "resident sees verified municipal response",
  () =>
    as(R1, "SELECT summary, is_verified FROM public.municipal_responses WHERE complaint_id = $1", [
      C1,
    ]),
  (r) => one(r)?.is_verified === true,
);
await ok(
  "resident notified to confirm resolution",
  () =>
    as(
      R1,
      "SELECT id FROM public.notifications WHERE complaint_id = $1 AND event = 'resolution_reported' AND channel = 'in_app'",
      [C1],
    ),
  (r) => r.rows.length === 1,
);
await ok(
  "resolution marked as verified (liaison-reported)",
  () =>
    as(
      ADMIN,
      "SELECT resolution_verified, resolution_reported_at FROM public.complaints WHERE id = $1",
      [C1],
    ),
  (r) => one(r).resolution_verified === true && one(r).resolution_reported_at !== null,
);
await denied(
  "other resident cannot confirm",
  () => as(R2, "SELECT public.confirm_resolution($1)", [C1]),
  /not found/,
);
await ok("resident confirms resolution", () =>
  as(R1, "SELECT public.confirm_resolution($1)", [C1]),
);
await ok(
  "complaint closed with resolution timestamps",
  () =>
    as(
      R1,
      "SELECT status, resolved_at, closed_at, resident_confirmed_at FROM public.complaints WHERE id = $1",
      [C1],
    ),
  (r) =>
    one(r).status === "closed" &&
    one(r).resolved_at &&
    one(r).closed_at &&
    one(r).resident_confirmed_at,
);
await ok(
  "escalation closed",
  () => as(R1, "SELECT stage FROM public.escalations WHERE id = $1", [E1]),
  (r) => one(r).stage === "closed",
);

// Workflow E --------------------------------------------------------------------------------------------
console.log("\nWorkflow E: resident disputes → reopened → admin follows up");
await denied(
  "reopen needs a reason",
  () => as(R1, "SELECT public.reopen_complaint($1, 'no')", [C1]),
  /at least 10/,
);
await ok("resident reopens", () =>
  as(R1, "SELECT public.reopen_complaint($1, 'Pothole has opened up again after rain')", [C1]),
);
await ok(
  "reopened clears resolution and counts it",
  () =>
    as(
      R1,
      "SELECT status, resolved_at, closed_at, reopened_count FROM public.complaints WHERE id = $1",
      [C1],
    ),
  (r) =>
    one(r).status === "reopened" &&
    one(r).resolved_at === null &&
    one(r).closed_at === null &&
    one(r).reopened_count === 1,
);
await ok("admin resumes follow-up", () =>
  as(ADMIN, "SELECT public.change_complaint_status($1, 'in_progress', 'Re-reported to JRA.')", [
    C1,
  ]),
);
await ok(
  "every change recorded in history",
  () =>
    as(
      ADMIN,
      "SELECT to_status FROM public.complaint_status_history WHERE complaint_id = $1 ORDER BY created_at",
      [C1],
    ),
  (r) =>
    r.rows.map((x) => x.to_status).join(",") ===
    "submitted,under_review,awaiting_municipal_feedback,escalation_requested,under_review,escalated_to_councillor,awaiting_municipal_feedback,resolution_reported,closed,reopened,in_progress",
);
await denied(
  "cannot confirm a resolution that was not reported",
  () => as(R1, "SELECT public.confirm_resolution($1)", [C1]),
  /Only a reported/,
);

// Evidence ------------------------------------------------------------------------------------------------
console.log("\nEvidence files");
const C3 = await submitted(R1);
const OBJ =
  "INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('complaint-evidence', $1, $2)";
const ATT =
  "INSERT INTO public.complaint_attachments (complaint_id, uploaded_by, storage_path, file_name, mime_type, size_bytes) VALUES ($1, $2, $3, 'photo.jpg', 'image/jpeg', 1000)";
await ok(
  "bucket is private, 10 MB, images + PDF",
  () =>
    admin(
      "SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'complaint-evidence'",
    ),
  (r) =>
    one(r).public === false &&
    Number(one(r).file_size_limit) === 10485760 &&
    one(r).allowed_mime_types.includes("application/pdf"),
);
await ok("owner uploads evidence", () => as(R1, OBJ, [`${C3}/a1b2c3d4e5f6.jpg`, R1]));
await denied("bad file name rejected", () => as(R1, OBJ, [`${C3}/../../x.jpg`, R1]));
await denied("executable type rejected", () => as(R1, OBJ, [`${C3}/a1b2c3d4e5f7.exe`, R1]));
await denied("other resident cannot upload to it", () =>
  as(R2, OBJ, [`${C3}/a1b2c3d4e5f8.jpg`, R2]),
);
for (let i = 1; i <= 5; i++) await as(R1, ATT, [C3, R1, `${C3}/file${i}00000.jpg`]);
await denied(
  "sixth evidence file rejected",
  () => as(R1, ATT, [C3, R1, `${C3}/file600000.jpg`]),
  /at most 5/,
);
await admin("DELETE FROM public.complaint_attachments WHERE storage_path = $1", [
  `${C3}/file500000.jpg`,
]);
await ok("attachment row for uploaded object", () =>
  as(R1, ATT.replace("'photo.jpg'", "'p.jpg'"), [C3, R1, `${C3}/a1b2c3d4e5f6.jpg`]),
);
await ok(
  "owner can read the file",
  () => as(R1, "SELECT name FROM storage.objects"),
  (r) => r.rows.length === 1,
);
await ok(
  "other resident cannot read it",
  () => as(R2, "SELECT name FROM storage.objects"),
  (r) => r.rows.length === 0,
);
await ok(
  "staff can read it",
  () => as(ADMIN, "SELECT name FROM storage.objects"),
  (r) => r.rows.length === 1,
);
await denied(
  "unsupported file type rejected",
  () =>
    as(
      R1,
      "INSERT INTO public.complaint_attachments (complaint_id, uploaded_by, storage_path, file_name, mime_type, size_bytes) VALUES ($1, $2, $3, 'x.svg', 'image/svg+xml', 10)",
      [C1, R1, `${C1}/zzzzzzzz.jpg`],
    ),
  /check constraint/,
);

// Public statistics and demo isolation -----------------------------------------------------------------------
console.log("\nPublic statistics, privacy thresholds, demo data");
await ok(
  "small counts are hidden publicly",
  () => as(null, "SELECT public.public_ward_stats(109) s"),
  (r) => one(r).s.total === null,
);
const demoComplaint = await submitted(DEMO);
await ok(
  "demo resident's complaints are flagged demo",
  () => admin("SELECT is_demo FROM public.complaints WHERE id = $1", [demoComplaint]),
  (r) => one(r).is_demo === true,
);
for (let i = 0; i < 3; i++) await submitted(R2, ROADS, POTHOLE, WOODMEAD, `JRA-20${i}`);
await ok(
  "totals appear once above threshold, demo excluded",
  () => as(null, "SELECT public.public_ward_stats(109) s"),
  (r) => one(r).s.total === 6,
);
await ok(
  "public stats contain no personal data",
  () => as(null, "SELECT public.public_ward_stats(109)::text s"),
  (r) => !/Resident|082|Example Road|@/.test(one(r).s),
);
await ok(
  "duplicate detection shows similar open complaints without personal data",
  () =>
    as(R2, "SELECT * FROM public.find_similar_complaints($1, $2, 'Example Road')", [
      ROADS,
      WOODMEAD,
    ]),
  (r) =>
    r.rows.length >= 1 &&
    r.rows.every((x) =>
      Object.keys(x).every(
        (k) => !/name$|mobile|email|address|resident/.test(k) || k === "issue_type",
      ),
    ),
);
await denied("anonymous users cannot run duplicate detection", () =>
  as(null, "SELECT * FROM public.find_similar_complaints($1, $2)", [ROADS, WOODMEAD]),
);

// Boundary verification ---------------------------------------------------------------------------------------------
console.log("\nWard boundary checks (official 2026 boundary)");
const pin = async (suburb, lat, lng) =>
  one(
    await as(
      R1,
      "INSERT INTO public.complaints (resident_id, ward_id, suburb_id, latitude, longitude, location_source) VALUES ($1, $2, $3, $4, $5, 'map_pin') RETURNING boundary_check",
      [R1, ward, suburb, lat, lng],
    ),
  ).boundary_check;
const WENDYWOOD = await sub("Wendywood");
await ok(
  "official boundary loaded and public",
  () => as(null, "SELECT source FROM public.ward_boundaries WHERE is_active"),
  (r) => r.rows.length === 1 && /Demarcation Board/.test(one(r).source),
);
await ok(
  "Buccleuch and Woodmead marked partial",
  () => as(null, "SELECT count(*)::int n FROM public.suburbs WHERE coverage = 'partial'"),
  (r) => one(r).n === 4,
);
await ok(
  "full-coverage suburb without a pin needs no check",
  async () => ({ rows: [{ b: await pin(WENDYWOOD, null, null) }] }),
  (r) => one(r).b === "not_required",
);
await ok(
  "partial suburb without a pin stays pending",
  async () => ({ rows: [{ b: await pin(EDENBURG, null, null) }] }),
  (r) => one(r).b === "pending",
);
await ok(
  "pin in Wendywood is inside Ward 109",
  async () => ({ rows: [{ b: await pin(WENDYWOOD, -26.0794, 28.0836) }] }),
  (r) => one(r).b === "inside",
);
await ok(
  "pin in Kelvin is inside Ward 109",
  async () => ({ rows: [{ b: await pin(EDENBURG, -26.075, 28.0947) }] }),
  (r) => one(r).b === "inside",
);
await ok(
  "pin in Sandton CBD is outside Ward 109",
  async () => ({ rows: [{ b: await pin(WENDYWOOD, -26.1076, 28.0567) }] }),
  (r) => one(r).b === "outside",
);
await denied("ward admin cannot replace the boundary", () =>
  as(ADMIN, "UPDATE public.ward_boundaries SET is_active = false"),
);
await ok(
  "super admin can retire the boundary",
  () => as(SUPER, "UPDATE public.ward_boundaries SET is_active = false WHERE is_active"),
  (r) => r.affectedRows === 1,
);

// Misc ---------------------------------------------------------------------------------------------------------------
console.log("\nNotifications, announcements, audit, POPIA");
await ok(
  "resident marks notification read",
  () =>
    as(
      R1,
      "UPDATE public.notifications SET read_at = now() WHERE user_id = $1 AND channel = 'in_app'",
      [R1],
    ),
  (r) => r.affectedRows >= 1,
);
await denied("resident cannot rewrite a notification", () =>
  as(R1, "UPDATE public.notifications SET body = 'hacked' WHERE user_id = $1", [R1]),
);
await denied("resident cannot read others' notifications", () =>
  as(R2, "SELECT id FROM public.notifications WHERE user_id = $1", [R1]),
);
await ok(
  "councillor drafts and publishes an announcement",
  () =>
    as(
      COUNCILLOR,
      "INSERT INTO public.announcements (ward_id, kind, title, body, is_published, created_by) VALUES ($1, 'community_meeting', 'Ward meeting', 'Community meeting at Wendywood hall.', true, $2) RETURNING published_at",
      [ward, COUNCILLOR],
    ),
  (r) => one(r).published_at !== null,
);
await denied("official notice needs a source reference", () =>
  as(
    COUNCILLOR,
    "INSERT INTO public.announcements (ward_id, source, title, body, created_by) VALUES ($1, 'official_verified', 'Water off', 'Planned maintenance.', $2)",
    [ward, COUNCILLOR],
  ),
);
await as(
  COUNCILLOR,
  "INSERT INTO public.announcements (ward_id, title, body, created_by) VALUES ($1, 'Draft notice', 'Not yet published.', $2)",
  [ward, COUNCILLOR],
);
await ok(
  "public sees only published announcements",
  () => as(null, "SELECT title FROM public.announcements"),
  (r) => r.rows.length === 1,
);
await denied("residents cannot publish announcements", () =>
  as(
    R1,
    "INSERT INTO public.announcements (ward_id, title, body, created_by) VALUES ($1, 'Fake', 'Fake notice', $2)",
    [ward, R1],
  ),
);
await ok(
  "audit log captured complaint and role changes",
  () => as(SUPER, "SELECT DISTINCT table_name FROM public.audit_logs"),
  (r) =>
    ["complaints", "user_roles", "escalations", "internal_notes"].every((t) =>
      r.rows.some((x) => x.table_name === t),
    ),
);
await ok(
  "residents cannot read the audit log",
  () => as(R1, "SELECT id FROM public.audit_logs"),
  (r) => r.rows.length === 0,
);
await ok("resident files a data access request", () =>
  as(
    R1,
    "INSERT INTO public.privacy_requests (user_id, kind, details) VALUES ($1, 'access', 'Please send my data') RETURNING id",
    [R1],
  ),
);
await ok(
  "other residents cannot see it",
  () => as(R2, "SELECT id FROM public.privacy_requests"),
  (r) => r.rows.length === 0,
);
await ok(
  "super admin sees it",
  () => as(SUPER, "SELECT id FROM public.privacy_requests"),
  (r) => r.rows.length === 1,
);
await ok(
  "rate limit blocks bursts of complaints",
  async () => {
    await admin(
      "UPDATE public.system_settings SET value = '3' WHERE key = 'limits.complaints_per_hour'",
    );
    try {
      for (let i = 0; i < 5; i++)
        await as(R2, DRAFT_SQL, [
          R2,
          ward,
          ROADS,
          POTHOLE,
          WOODMEAD,
          "Another pothole on the same road",
        ]);
      return { rows: [{ blocked: false }] };
    } catch (e) {
      return { rows: [{ blocked: /Too many/.test(e.message) }] };
    }
  },
  (r) => one(r).blocked,
);
console.log("\nCouncillor team management");
const GRANT_SQL =
  "INSERT INTO public.role_email_grants (email, role, ward_id, created_by) VALUES ($1, $2, $3, $4) RETURNING id";
const NEW_ADMIN = await user("new.admin@ward109.test");
const teamGrant = await ok(
  "councillor adds a ward administrator by email",
  () => as(COUNCILLOR, GRANT_SQL, ["new.admin@ward109.test", "ward_admin", ward, COUNCILLOR]),
  (r) => r.rows.length === 1,
);
await ok(
  "the confirmed account becomes ward staff",
  () => as(NEW_ADMIN, "SELECT public.is_ward_staff($1) s", [ward]),
  (r) => one(r).s === true,
);
await denied("councillor cannot grant the councillor role", () =>
  as(COUNCILLOR, GRANT_SQL, ["someone@example.com", "councillor", ward, COUNCILLOR]),
);
await denied("councillor cannot grant super admin", () =>
  as(
    COUNCILLOR,
    "INSERT INTO public.role_email_grants (email, role, created_by) VALUES ('x@example.com', 'super_admin', $1)",
    [COUNCILLOR],
  ),
);
await denied("ward administrators cannot grant roles", () =>
  as(ADMIN, GRANT_SQL, ["other@example.com", "ward_admin", ward, ADMIN]),
);
await denied("residents cannot grant roles", () =>
  as(R1, GRANT_SQL, ["r1friend@example.com", "ward_admin", ward, R1]),
);
await ok(
  "councillor sees only ward administrator grants",
  () => as(COUNCILLOR, "SELECT DISTINCT role FROM public.role_email_grants"),
  (r) => r.rows.length === 1 && one(r).role === "ward_admin",
);
await ok(
  "councillor removes the administrator, revoking access",
  async () => {
    await as(COUNCILLOR, "DELETE FROM public.role_email_grants WHERE id = $1", [one(teamGrant).id]);
    return as(NEW_ADMIN, "SELECT public.is_ward_staff($1) s", [ward]);
  },
  (r) => one(r).s === false,
);

await ok(
  "removing an email grant revokes the role",
  async () => {
    await admin("DELETE FROM public.role_email_grants WHERE email = 'admin@ward109.test'");
    return as(ADMIN, "SELECT public.is_ward_staff($1) s", [ward]);
  },
  (r) => one(r).s === false,
);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
