-- Ward 109 Resolved: reference data. All imported contacts start as pending verification.

INSERT INTO public.roles (role, label, description) VALUES
  ('resident', 'Resident', 'Logs, tracks and escalates their own complaints.'),
  ('ward_admin', 'Ward Administrator', 'Manages all ward complaints, assignments, escalations and reports.'),
  ('councillor', 'Ward Councillor', 'Executive oversight, escalations, announcements and reports.'),
  ('municipal_liaison', 'Municipal Liaison', 'Responds to complaints assigned to their municipal entity.'),
  ('super_admin', 'Super Administrator', 'Manages users, roles, configuration, security and audit logs.');

INSERT INTO public.wards (ward_number, name, tracking_prefix) VALUES (109, 'Ward 109', 'W109');

INSERT INTO public.suburbs (ward_id, name, coverage, sort_order)
SELECT w.id, s.name, s.coverage::public.suburb_coverage, s.ord
FROM public.wards w,
  (VALUES
    ('Buccleuch', 'full', 1),
    ('Edenburg', 'partial', 2),
    ('Gallo Manor', 'full', 3),
    ('Kelvin', 'full', 4),
    ('Khyber Rock', 'full', 5),
    ('Marlboro Gardens', 'full', 6),
    ('Morningside', 'partial', 7),
    ('Morningside Manor Extension 1', 'full', 8),
    ('Morningside Manor Extension 2', 'full', 9),
    ('Wendywood', 'full', 10),
    ('Woodmead', 'full', 11)
  ) AS s(name, coverage, ord)
WHERE w.ward_number = 109;

INSERT INTO public.municipal_entities (slug, name, short_name, services, contact_type, contact_value, secondary_links, sort_order) VALUES
  ('joburg-water', 'Johannesburg Water', 'Joburg Water', 'Water and sanitation', 'url', 'https://jwfaultlogging.jwater.co.za', '[]', 1),
  ('city-power', 'City Power', 'City Power', 'Electricity', 'url', 'https://citypower.mobi', '[]', 2),
  ('jra', 'Johannesburg Roads Agency', 'JRA', 'Roads, potholes, kerbs and stormwater', 'email', 'hotline@jra.org.za', '[]', 3),
  ('city-parks', 'Johannesburg City Parks and Zoo', 'City Parks', 'Parks and public spaces', 'email', 'joburgconnect@joburg.org.za', '[]', 4),
  ('pikitup', 'Pikitup', 'Pikitup', 'Refuse and waste management', 'email', 'info@pikitup.co.za', '[]', 5),
  ('jmpd', 'Johannesburg Metropolitan Police Department', 'JMPD', 'Non-emergency municipal law enforcement', 'phone', '011 375 5911', '[]', 6),
  ('coj-revenue', 'City of Johannesburg Revenue', 'Revenue & Billing', 'Accounts, billing and meter readings', 'email', 'regionErevenue@joburg.org.za', '[]', 7),
  ('e-joburg', 'E-Joburg', 'E-Joburg', 'Online municipal services', 'url', 'https://www.e-joburg.org.za', '[]', 8),
  ('coj-central-app', 'CoJ Central App', 'CoJ Central App', 'Log and track municipal faults in one place', 'app', 'City of Johannesburg central application',
    '[{"label": "Android", "url": "https://bit.ly/4ucfYc4"}, {"label": "iPhone", "url": "https://bit.ly/42WsUH4"}]', 9);

INSERT INTO public.service_categories (slug, name, description, municipal_entity_id, map_color, emergency_warning, sort_order)
SELECT c.slug, c.name, c.description, e.id, c.color, c.warn, c.ord
FROM (VALUES
  ('water', 'Water and Sanitation', 'Water supply, leaks, pressure and sewer problems.', 'joburg-water', '#2563EB', false, 1),
  ('electricity', 'Electricity', 'Outages, streetlights and electrical infrastructure.', 'city-power', '#EAB308', false, 2),
  ('roads', 'Roads and Stormwater', 'Potholes, road damage, kerbs, drains, signs and traffic signals.', 'jra', '#EA580C', false, 3),
  ('parks', 'Parks and Public Spaces', 'Grass, trees, parks and public facilities.', 'city-parks', '#16A34A', false, 4),
  ('waste', 'Waste Management', 'Refuse collection, illegal dumping and public bins.', 'pikitup', '#9333EA', false, 5),
  ('law-enforcement', 'Municipal Law Enforcement', 'Non-emergency parking, traffic and by-law enforcement.', 'jmpd', '#475569', true, 6),
  ('billing', 'Revenue and Billing', 'Municipal accounts, billing and meter readings.', 'coj-revenue', '#008C95', false, 7),
  ('general', 'General Municipal Services', 'Municipal issues that do not fit another category.', 'e-joburg', '#64748B', false, 8)
) AS c(slug, name, description, entity, color, warn, ord)
JOIN public.municipal_entities e ON e.slug = c.entity;

INSERT INTO public.issue_types (category_id, name, suggests_urgent, sort_order)
SELECT sc.id, t.name, t.urgent, t.ord
FROM (VALUES
  ('water', 'Water outage', false, 1), ('water', 'Burst water pipe', true, 2), ('water', 'Water leak', false, 3),
  ('water', 'Low water pressure', false, 4), ('water', 'Sewer blockage', false, 5), ('water', 'Sewer overflow', true, 6),
  ('water', 'Water quality complaint', true, 7), ('water', 'Other', false, 99),
  ('electricity', 'Power outage', false, 1), ('electricity', 'Faulty streetlight', false, 2),
  ('electricity', 'Damaged electricity infrastructure', true, 3), ('electricity', 'Exposed electrical cables', true, 4),
  ('electricity', 'Transformer fault', true, 5), ('electricity', 'Repeated power interruptions', false, 6),
  ('electricity', 'Other', false, 99),
  ('roads', 'Potholes', false, 1), ('roads', 'Road damage', false, 2), ('roads', 'Damaged kerbs', false, 3),
  ('roads', 'Blocked stormwater drains', false, 4), ('roads', 'Damaged road signs', false, 5),
  ('roads', 'Traffic signal faults', true, 6), ('roads', 'Other', false, 99),
  ('parks', 'Overgrown grass', false, 1), ('parks', 'Fallen trees', true, 2), ('parks', 'Tree maintenance', false, 3),
  ('parks', 'Damaged public facilities', false, 4), ('parks', 'Park maintenance', false, 5), ('parks', 'Other', false, 99),
  ('waste', 'Missed refuse collection', false, 1), ('waste', 'Illegal dumping', false, 2),
  ('waste', 'Overflowing public bins', false, 3), ('waste', 'Waste collection complaints', false, 4), ('waste', 'Other', false, 99),
  ('law-enforcement', 'Illegal parking', false, 1), ('law-enforcement', 'Traffic enforcement', false, 2),
  ('law-enforcement', 'By-law enforcement', false, 3), ('law-enforcement', 'Other non-emergency enforcement issue', false, 99),
  ('billing', 'Incorrect municipal bill', false, 1), ('billing', 'Account dispute', false, 2),
  ('billing', 'Meter reading dispute', false, 3), ('billing', 'Billing adjustment', false, 4), ('billing', 'Other', false, 99),
  ('general', 'General municipal query', false, 1), ('general', 'Other', false, 99)
) AS t(category, name, urgent, ord)
JOIN public.service_categories sc ON sc.slug = t.category;

-- Turnaround periods are deliberately not configured: staff set verified values in Settings.
INSERT INTO public.escalation_rules (category_id, turnaround_days, follow_up_days, notes)
SELECT id, NULL, 7, 'Turnaround period not yet configured. Escalation opens immediately and is reviewed by the ward office.'
FROM public.service_categories;

INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('limits.complaints_per_hour', '10', 'Maximum complaints a resident can submit per hour.', false),
  ('limits.evidence_files_per_complaint', '5', 'Maximum evidence files per complaint.', true),
  ('limits.evidence_max_mb', '10', 'Maximum size per evidence file (MB).', true),
  ('public.min_aggregate', '5', 'Public statistics below this count are hidden to protect privacy.', true),
  ('privacy.notice_version', '"2026-11"', 'Current privacy notice version residents consent to.', true),
  ('retention.closed_complaint_months', '36', 'Months to keep closed complaints before anonymisation review.', false),
  ('reports.include_demo_data', 'false', 'Demo data is never included in production reports.', false),
  ('ward.office_email', 'null', 'Public contact email for the ward office (set before launch).', true),
  ('ward.office_phone', 'null', 'Public contact number for the ward office (set before launch).', true),
  ('notifications.sms_enabled', 'false', 'True only once a real SMS provider is configured.', false),
  ('notifications.whatsapp_enabled', 'false', 'True only once an authorised WhatsApp Business integration is configured.', false);

INSERT INTO public.notification_templates (event, subject, body) VALUES
  ('complaint_submitted', 'Complaint {{tracking_id}} registered',
   'Dear {{resident_name}}, your Ward 109 complaint {{tracking_id}} has been registered. Log in to track its progress.'),
  ('status_updated', 'Complaint {{tracking_id}} updated',
   'Dear {{resident_name}}, your Ward 109 complaint {{tracking_id}} has been updated to {{status}}. {{note}} Log in to view the latest information.'),
  ('complaint_escalated', 'Complaint {{tracking_id}} escalated to the Councillor',
   'Dear {{resident_name}}, your Ward 109 complaint {{tracking_id}} has been escalated to the Ward Councillor. Log in to view the latest information.'),
  ('resolution_reported', 'Resolution reported for {{tracking_id}}',
   'Dear {{resident_name}}, a resolution has been reported for complaint {{tracking_id}}. Please log in to confirm the fault is resolved, or reopen it if it is not.'),
  ('complaint_closed', 'Complaint {{tracking_id}} closed',
   'Dear {{resident_name}}, your Ward 109 complaint {{tracking_id}} has been closed. If the fault returns you can reopen it.'),
  ('complaint_assigned', 'Complaint {{tracking_id}} assigned to you',
   'Complaint {{tracking_id}} has been assigned to you on Ward 109 Resolved.'),
  ('info_requested', 'More information needed for {{tracking_id}}',
   'Dear {{resident_name}}, the ward office needs more information about complaint {{tracking_id}}. {{note}} Please log in to respond.'),
  ('municipal_feedback', 'Municipal feedback on {{tracking_id}}',
   'Dear {{resident_name}}, municipal feedback has been recorded on complaint {{tracking_id}}. Log in to view it.'),
  ('follow_up_overdue', 'Follow-up overdue: {{tracking_id}}',
   'A follow-up on complaint {{tracking_id}} is overdue.');

-- Ward Councillor access via verified email.
INSERT INTO public.role_email_grants (email, role, ward_id)
SELECT 'charlenemccord109@gmail.com', 'councillor', id FROM public.wards WHERE ward_number = 109;
