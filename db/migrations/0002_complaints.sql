-- Ward 109 Resolved: complaints, lifecycle, escalation, notes, tasks, notifications.

CREATE TYPE public.complaint_status AS ENUM (
  'draft', 'submitted', 'under_review', 'awaiting_municipal_feedback', 'escalation_requested',
  'escalated_to_councillor', 'in_progress', 'resolution_reported', 'resolved', 'closed', 'reopened'
);
CREATE TYPE public.complaint_priority AS ENUM ('routine', 'urgent', 'critical');
CREATE TYPE public.boundary_check AS ENUM ('not_required', 'pending', 'inside', 'outside');
CREATE TYPE public.location_source AS ENUM ('address', 'gps', 'map_pin');
CREATE TYPE public.escalation_stage AS ENUM (
  'requested', 'admin_review', 'with_councillor', 'with_liaison', 'response_received', 'closed', 'declined'
);
CREATE TYPE public.attachment_kind AS ENUM ('evidence', 'staff_document', 'liaison_document');
CREATE TYPE public.response_channel AS ENUM ('email', 'phone', 'portal', 'meeting', 'liaison_portal', 'other');
CREATE TYPE public.task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE public.notification_channel AS ENUM ('in_app', 'email', 'sms', 'whatsapp');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- Escalation rules: turnaround periods are configured, never assumed (NULL = not configured).
CREATE TABLE public.escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL UNIQUE REFERENCES public.service_categories(id) ON DELETE CASCADE,
  turnaround_days integer CHECK (turnaround_days IS NULL OR turnaround_days BETWEEN 1 AND 365),
  follow_up_days integer NOT NULL DEFAULT 7 CHECK (follow_up_days BETWEEN 1 AND 90),
  notes text,
  verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER escalation_rules_touch BEFORE UPDATE ON public.escalation_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tracking numbers: <prefix>-<year>-<6 digits>, gap-free per ward and year.
CREATE TABLE public.tracking_counters (
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ward_id, year)
);

CREATE FUNCTION public.next_tracking_number(_ward uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  yr integer := extract(year FROM now() AT TIME ZONE 'Africa/Johannesburg')::integer;
  n integer;
  prefix text;
BEGIN
  SELECT tracking_prefix INTO prefix FROM public.wards WHERE id = _ward;
  INSERT INTO public.tracking_counters (ward_id, year, last_value) VALUES (_ward, yr, 1)
  ON CONFLICT (ward_id, year) DO UPDATE SET last_value = public.tracking_counters.last_value + 1
  RETURNING last_value INTO n;
  RETURN prefix || '-' || yr || '-' || lpad(n::text, 6, '0');
END;
$$;

-- Ray-casting point-in-polygon over GeoJSON ([lng, lat]); first ring is outer, others are holes.
CREATE FUNCTION public.point_in_geojson(_geo jsonb, _lat double precision, _lng double precision)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  polygons jsonb;
  poly jsonb;
  ring jsonb;
  ring_idx integer;
  inside boolean;
  i integer;
  j integer;
  n integer;
  xi double precision; yi double precision; xj double precision; yj double precision;
BEGIN
  polygons := CASE _geo->>'type'
    WHEN 'Polygon' THEN jsonb_build_array(_geo->'coordinates')
    WHEN 'MultiPolygon' THEN _geo->'coordinates'
  END;
  IF polygons IS NULL THEN RETURN NULL; END IF;

  FOR poly IN SELECT value FROM jsonb_array_elements(polygons) LOOP
    ring_idx := 0;
    FOR ring IN SELECT value FROM jsonb_array_elements(poly) LOOP
      inside := false;
      n := jsonb_array_length(ring);
      j := n - 1;
      FOR i IN 0 .. n - 1 LOOP
        xi := (ring->i->>0)::double precision; yi := (ring->i->>1)::double precision;
        xj := (ring->j->>0)::double precision; yj := (ring->j->>1)::double precision;
        IF ((yi > _lat) <> (yj > _lat)) AND (_lng < (xj - xi) * (_lat - yi) / (yj - yi) + xi) THEN
          inside := NOT inside;
        END IF;
        j := i;
      END LOOP;
      IF ring_idx = 0 AND NOT inside THEN EXIT; END IF;      -- outside outer ring
      IF ring_idx > 0 AND inside THEN inside := false; EXIT; END IF; -- inside a hole
      inside := true;
      ring_idx := ring_idx + 1;
    END LOOP;
    IF ring_idx > 0 AND inside THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- Complaints ---------------------------------------------------------------------------
CREATE TABLE public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number text UNIQUE,
  resident_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.wards(id),
  municipal_entity_id uuid REFERENCES public.municipal_entities(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.service_categories(id),
  issue_type_id uuid REFERENCES public.issue_types(id),
  description text CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 10 AND 4000),

  contact_name text CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 1 AND 100),
  contact_mobile text CHECK (contact_mobile IS NULL OR contact_mobile ~ '^\+?[0-9 ()-]{7,20}$'),
  contact_email text CHECK (contact_email IS NULL OR contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_contact public.contact_method NOT NULL DEFAULT 'email',

  suburb_id uuid REFERENCES public.suburbs(id),
  street_address text CHECK (street_address IS NULL OR char_length(btrim(street_address)) BETWEEN 3 AND 200),
  street_name text CHECK (street_name IS NULL OR char_length(btrim(street_name)) BETWEEN 2 AND 120),
  landmark text CHECK (landmark IS NULL OR char_length(btrim(landmark)) <= 200),
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  location_source public.location_source NOT NULL DEFAULT 'address',
  boundary_check public.boundary_check NOT NULL DEFAULT 'pending',

  issue_started_on date,
  priority public.complaint_priority NOT NULL DEFAULT 'routine',
  municipal_reported boolean NOT NULL DEFAULT false,
  municipal_reference_number text CHECK (municipal_reference_number IS NULL OR char_length(btrim(municipal_reference_number)) BETWEEN 2 AND 80),
  municipal_logged_at timestamptz,
  reference_verified_at timestamptz,
  reference_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  consent_at timestamptz,
  consent_version text,
  status public.complaint_status NOT NULL DEFAULT 'draft',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  next_follow_up_at timestamptz,
  submitted_at timestamptz,
  resolution_reported_at timestamptz,
  resolution_verified boolean NOT NULL DEFAULT false,
  resident_confirmed_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_count integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CHECK (municipal_logged_at IS NULL OR municipal_logged_at <= now() + interval '10 minutes'),
  -- Anything past draft must be complete and carry a real municipal reference.
  CHECK (
    status = 'draft' OR (
      tracking_number IS NOT NULL AND submitted_at IS NOT NULL AND consent_at IS NOT NULL
      AND contact_name IS NOT NULL AND contact_mobile IS NOT NULL
      AND suburb_id IS NOT NULL AND street_address IS NOT NULL
      AND category_id IS NOT NULL AND issue_type_id IS NOT NULL AND description IS NOT NULL
      AND municipal_reported AND municipal_reference_number IS NOT NULL AND municipal_logged_at IS NOT NULL
    )
  )
);
CREATE INDEX complaints_resident_idx ON public.complaints (resident_id, created_at DESC);
CREATE INDEX complaints_ward_status_idx ON public.complaints (ward_id, status, created_at DESC);
CREATE INDEX complaints_ward_created_idx ON public.complaints (ward_id, created_at DESC);
CREATE INDEX complaints_entity_idx ON public.complaints (municipal_entity_id, status);
CREATE INDEX complaints_category_suburb_idx ON public.complaints (category_id, suburb_id, created_at DESC);
CREATE INDEX complaints_assigned_idx ON public.complaints (assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;
CREATE INDEX complaints_follow_up_idx ON public.complaints (next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

-- Who may see a complaint: its resident, ward staff, or a liaison for its municipal entity.
CREATE FUNCTION public.can_view_complaint(_complaint uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.id = _complaint
      AND (
        c.resident_id = (SELECT auth.uid())
        OR public.is_ward_staff(c.ward_id)
        OR (c.status <> 'draft' AND c.municipal_entity_id IN (SELECT public.liaison_entity_ids()))
      )
  );
$$;

CREATE FUNCTION public.is_complaint_staff(_complaint uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaints c WHERE c.id = _complaint AND public.is_ward_staff(c.ward_id)
  );
$$;

-- Direct API requests run as anon/authenticated; vetted RPCs run as the definer.
CREATE FUNCTION public.is_api_request()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT current_user IN ('anon', 'authenticated');
$$;

CREATE FUNCTION public.prepare_complaint()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff boolean := public.is_ward_staff(NEW.ward_id);
  coverage public.suburb_coverage;
  boundary jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Demo residents always produce demo complaints, so they never reach real reports.
    NEW.is_demo := NEW.is_demo OR coalesce((SELECT p.is_demo FROM public.profiles p WHERE p.id = NEW.resident_id), false);
  END IF;

  -- Entity follows the category unless staff reassign it.
  IF NEW.category_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
     AND (NOT staff OR NEW.municipal_entity_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.municipal_entity_id IS NOT DISTINCT FROM OLD.municipal_entity_id)) THEN
    NEW.municipal_entity_id := (SELECT sc.municipal_entity_id FROM public.service_categories sc WHERE sc.id = NEW.category_id);
  END IF;

  IF NEW.issue_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.issue_types it WHERE it.id = NEW.issue_type_id AND it.category_id = NEW.category_id
  ) THEN
    RAISE EXCEPTION 'Issue type does not belong to the selected category';
  END IF;
  IF NEW.suburb_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suburbs s WHERE s.id = NEW.suburb_id AND s.ward_id = NEW.ward_id
  ) THEN
    RAISE EXCEPTION 'Suburb is not part of this ward';
  END IF;

  -- Boundary verification: any map pin is tested against the active official boundary. Without a
  -- pin, full-coverage suburbs need no check and partial ones stay pending for staff to verify.
  IF TG_OP = 'INSERT' OR NEW.suburb_id IS DISTINCT FROM OLD.suburb_id
     OR NEW.latitude IS DISTINCT FROM OLD.latitude OR NEW.longitude IS DISTINCT FROM OLD.longitude THEN
    SELECT s.coverage INTO coverage FROM public.suburbs s WHERE s.id = NEW.suburb_id;
    SELECT b.geojson INTO boundary FROM public.ward_boundaries b WHERE b.ward_id = NEW.ward_id AND b.is_active;
    IF boundary IS NOT NULL AND NEW.latitude IS NOT NULL THEN
      NEW.boundary_check := CASE WHEN public.point_in_geojson(boundary, NEW.latitude, NEW.longitude)
                                 THEN 'inside' ELSE 'outside' END;
    ELSIF coverage = 'full' THEN
      NEW.boundary_check := 'not_required';
    ELSIF NOT (staff AND TG_OP = 'UPDATE' AND NEW.boundary_check IS DISTINCT FROM OLD.boundary_check) THEN
      NEW.boundary_check := 'pending';
    END IF;
  END IF;

  -- Leaving draft: issue the tracking number.
  IF NEW.status <> 'draft' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.tracking_number := public.next_tracking_number(NEW.ward_id);
    NEW.submitted_at := now();
    NEW.status := 'submitted';
  END IF;

  -- Lifecycle timestamps.
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'resolution_reported' THEN NEW.resolution_reported_at := now();
      WHEN 'resolved' THEN NEW.resolved_at := coalesce(NEW.resolved_at, now());
      WHEN 'closed' THEN
        NEW.closed_at := now();
        NEW.resolved_at := coalesce(NEW.resolved_at, CASE WHEN OLD.status IN ('resolution_reported', 'resolved') THEN now() END);
      WHEN 'reopened' THEN
        NEW.resolved_at := NULL; NEW.closed_at := NULL; NEW.resident_confirmed_at := NULL;
        NEW.resolution_reported_at := NULL; NEW.resolution_verified := false;
        NEW.reopened_count := OLD.reopened_count + 1;
      ELSE NULL;
    END CASE;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.last_updated_at := now();
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Residents edit only their drafts; everything after submission goes through staff or RPCs.
-- Runs as the caller (not SECURITY DEFINER) so it can tell app requests from trusted code.
CREATE FUNCTION public.guard_complaint_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND public.is_api_request()
     AND (SELECT count(*) FROM public.complaints c
          WHERE c.resident_id = NEW.resident_id AND c.created_at > now() - interval '1 hour')
         >= public.setting_int('limits.complaints_per_hour', 10) THEN
    RAISE EXCEPTION 'Too many complaints in the last hour. Please try again later.';
  END IF;

  IF NOT public.is_api_request() OR public.is_ward_staff(NEW.ward_id) THEN
    IF NEW.is_demo IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_demo ELSE NEW.is_demo END)
       AND public.is_api_request() AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only a super administrator can change the demo flag';
    END IF;
    IF TG_OP = 'UPDATE' AND public.is_api_request() AND NEW.status = 'draft' AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A submitted complaint cannot return to draft';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_admin_id IS NOT NULL OR NEW.reference_verified_at IS NOT NULL
       OR NEW.priority = 'critical' OR NEW.is_demo OR NEW.next_follow_up_at IS NOT NULL THEN
      RAISE EXCEPTION 'Residents cannot set staff-only fields';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id
     OR NEW.reference_verified_at IS DISTINCT FROM OLD.reference_verified_at
     OR NEW.next_follow_up_at IS DISTINCT FROM OLD.next_follow_up_at
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo
     OR NEW.resident_id IS DISTINCT FROM OLD.resident_id
     OR NEW.ward_id IS DISTINCT FROM OLD.ward_id
     OR (NEW.priority = 'critical' AND OLD.priority <> 'critical') THEN
    RAISE EXCEPTION 'Residents cannot change staff-only fields';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER complaints_guard BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.guard_complaint_write();
CREATE TRIGGER complaints_prepare BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.prepare_complaint();

-- Status history (written only by trigger) -------------------------------------------------
CREATE TABLE public.complaint_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  from_status public.complaint_status,
  to_status public.complaint_status NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  is_public boolean NOT NULL DEFAULT true,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX complaint_status_history_complaint_idx ON public.complaint_status_history (complaint_id, created_at);

CREATE FUNCTION public.record_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'draft' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.complaint_status_history (complaint_id, from_status, to_status, note, is_public, changed_by)
    VALUES (
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN OLD.status END,
      NEW.status,
      nullif(current_setting('app.status_note', true), ''),
      coalesce(nullif(current_setting('app.status_note_public', true), '')::boolean, true),
      (SELECT auth.uid())
    );
    PERFORM set_config('app.status_note', '', true);
    PERFORM set_config('app.status_note_public', '', true);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER complaints_status_history AFTER INSERT OR UPDATE OF status ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.record_status_change();

CREATE TRIGGER audit_complaints AFTER INSERT OR UPDATE OR DELETE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- Attachments --------------------------------------------------------------------------------
CREATE TABLE public.complaint_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.attachment_kind NOT NULL DEFAULT 'evidence',
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  resident_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (storage_path LIKE complaint_id::text || '/%')
);
CREATE INDEX complaint_attachments_complaint_idx ON public.complaint_attachments (complaint_id);

CREATE FUNCTION public.guard_attachment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  max_files integer := public.setting_int('limits.evidence_files_per_complaint', 5);
BEGIN
  IF NEW.kind = 'evidence' AND (
    SELECT count(*) FROM public.complaint_attachments a
    WHERE a.complaint_id = NEW.complaint_id AND a.kind = 'evidence'
  ) >= max_files THEN
    RAISE EXCEPTION 'A complaint can have at most % evidence files', max_files;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_attachments_guard BEFORE INSERT ON public.complaint_attachments
  FOR EACH ROW EXECUTE FUNCTION public.guard_attachment();

-- Assignments, escalations, responses, notes, tasks --------------------------------------------
CREATE TABLE public.complaint_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX complaint_assignments_complaint_idx ON public.complaint_assignments (complaint_id, created_at DESC);

CREATE TABLE public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  additional_info text CHECK (additional_info IS NULL OR char_length(additional_info) <= 4000),
  is_urgent_safety boolean NOT NULL DEFAULT false,
  stage public.escalation_stage NOT NULL DEFAULT 'requested',
  assigned_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  follow_up_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX escalations_one_open ON public.escalations (complaint_id)
  WHERE stage NOT IN ('closed', 'declined');
CREATE INDEX escalations_stage_idx ON public.escalations (stage, created_at);
CREATE TRIGGER escalations_touch BEFORE UPDATE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_escalations AFTER INSERT OR UPDATE OR DELETE ON public.escalations
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TABLE public.municipal_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL,
  municipal_entity_id uuid REFERENCES public.municipal_entities(id) ON DELETE SET NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel public.response_channel NOT NULL,
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 3 AND 4000),
  responded_at timestamptz NOT NULL DEFAULT now(),
  -- true only when entered by an authorised liaison or confirmed by staff with the entity.
  is_verified boolean NOT NULL DEFAULT false,
  needs_more_info boolean NOT NULL DEFAULT false,
  visible_to_resident boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX municipal_responses_complaint_idx ON public.municipal_responses (complaint_id, responded_at);

CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  escalation_id uuid REFERENCES public.escalations(id) ON DELETE SET NULL,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX internal_notes_complaint_idx ON public.internal_notes (complaint_id, created_at);
CREATE TRIGGER audit_internal_notes AFTER INSERT OR UPDATE OR DELETE ON public.internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

CREATE TABLE public.follow_up_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at timestamptz,
  priority public.complaint_priority NOT NULL DEFAULT 'routine',
  status public.task_status NOT NULL DEFAULT 'open',
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX follow_up_tasks_due_idx ON public.follow_up_tasks (status, due_at);
CREATE INDEX follow_up_tasks_assignee_idx ON public.follow_up_tasks (assigned_to, status);
CREATE TRIGGER follow_up_tasks_touch BEFORE UPDATE ON public.follow_up_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Notifications -----------------------------------------------------------------------------
CREATE TABLE public.notification_templates (
  event text PRIMARY KEY CHECK (event ~ '^[a-z_]+$'),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 2000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER notification_templates_touch BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE CASCADE,
  event text NOT NULL,
  channel public.notification_channel NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  delivery public.delivery_status NOT NULL DEFAULT 'pending',
  delivery_error text,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_outbox_idx ON public.notifications (channel, delivery) WHERE delivery = 'pending';

-- Fill a template with {{placeholders}} and queue in-app plus each channel the user opted into.
CREATE FUNCTION public.queue_notification(_user uuid, _complaint uuid, _event text, _vars jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  tpl record;
  prefs record;
  subj text;
  msg text;
  k text;
  v text;
BEGIN
  SELECT * INTO tpl FROM public.notification_templates WHERE event = _event;
  IF NOT FOUND THEN RETURN; END IF;
  subj := tpl.subject; msg := tpl.body;
  FOR k, v IN SELECT key, value FROM jsonb_each_text(_vars) LOOP
    subj := replace(subj, '{{' || k || '}}', coalesce(v, ''));
    msg := replace(msg, '{{' || k || '}}', coalesce(v, ''));
  END LOOP;

  SELECT * INTO prefs FROM public.notification_preferences WHERE user_id = _user;
  IF coalesce(prefs.in_app, true) THEN
    INSERT INTO public.notifications (user_id, complaint_id, event, channel, title, body, delivery, sent_at)
    VALUES (_user, _complaint, _event, 'in_app', subj, msg, 'sent', now());
  END IF;
  IF coalesce(prefs.email, true) THEN
    INSERT INTO public.notifications (user_id, complaint_id, event, channel, title, body)
    VALUES (_user, _complaint, _event, 'email', subj, msg);
  END IF;
  -- SMS/WhatsApp are queued only if opted in; a sender marks them skipped until a provider exists.
  IF coalesce(prefs.sms, false) THEN
    INSERT INTO public.notifications (user_id, complaint_id, event, channel, title, body)
    VALUES (_user, _complaint, _event, 'sms', subj, msg);
  END IF;
  IF coalesce(prefs.whatsapp, false) THEN
    INSERT INTO public.notifications (user_id, complaint_id, event, channel, title, body)
    VALUES (_user, _complaint, _event, 'whatsapp', subj, msg);
  END IF;
END;
$$;

CREATE FUNCTION public.status_label(_s public.complaint_status)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE _s
    WHEN 'draft' THEN 'Draft' WHEN 'submitted' THEN 'Submitted' WHEN 'under_review' THEN 'Under Review'
    WHEN 'awaiting_municipal_feedback' THEN 'Awaiting Municipal Feedback'
    WHEN 'escalation_requested' THEN 'Escalation Requested'
    WHEN 'escalated_to_councillor' THEN 'Escalated to Councillor' WHEN 'in_progress' THEN 'In Progress'
    WHEN 'resolution_reported' THEN 'Resolution Reported' WHEN 'resolved' THEN 'Resolved'
    WHEN 'closed' THEN 'Closed' WHEN 'reopened' THEN 'Reopened' END;
$$;

CREATE FUNCTION public.notify_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
BEGIN
  IF NOT NEW.is_public THEN RETURN NEW; END IF;
  SELECT cp.resident_id, cp.tracking_number, cp.contact_name INTO c
  FROM public.complaints cp WHERE cp.id = NEW.complaint_id;
  -- Residents are not notified about changes they made themselves.
  IF NEW.changed_by IS NOT DISTINCT FROM c.resident_id THEN
    IF NEW.to_status = 'submitted' THEN
      PERFORM public.queue_notification(c.resident_id, NEW.complaint_id, 'complaint_submitted',
        jsonb_build_object('resident_name', c.contact_name, 'tracking_id', c.tracking_number));
    END IF;
    RETURN NEW;
  END IF;
  PERFORM public.queue_notification(c.resident_id, NEW.complaint_id,
    CASE NEW.to_status
      WHEN 'submitted' THEN 'complaint_submitted'
      WHEN 'escalated_to_councillor' THEN 'complaint_escalated'
      WHEN 'resolution_reported' THEN 'resolution_reported'
      WHEN 'closed' THEN 'complaint_closed'
      ELSE 'status_updated'
    END,
    jsonb_build_object('resident_name', c.contact_name, 'tracking_id', c.tracking_number,
                       'status', public.status_label(NEW.to_status), 'note', coalesce(NEW.note, '')));
  RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_status_history_notify AFTER INSERT ON public.complaint_status_history
  FOR EACH ROW EXECUTE FUNCTION public.notify_status_change();

-- Resident actions (validated RPCs) ---------------------------------------------------------------
CREATE FUNCTION public.set_status_note(_note text, _public boolean)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  SELECT set_config('app.status_note', coalesce(_note, ''), true),
         set_config('app.status_note_public', _public::text, true);
$$;

CREATE FUNCTION public.request_escalation(
  _complaint uuid, _reason text, _additional_info text DEFAULT NULL, _urgent_safety boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
  rule public.escalation_rules;
  eligible_at timestamptz;
  esc_id uuid;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR c.resident_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;
  IF c.status IN ('draft', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'This complaint cannot be escalated in its current status';
  END IF;
  IF c.municipal_reference_number IS NULL THEN
    RAISE EXCEPTION 'A municipal reference number is required before escalation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.escalations e WHERE e.complaint_id = _complaint AND e.stage NOT IN ('closed', 'declined')) THEN
    RAISE EXCEPTION 'An escalation is already open for this complaint';
  END IF;

  SELECT * INTO rule FROM public.escalation_rules WHERE category_id = c.category_id;
  IF NOT _urgent_safety AND rule.turnaround_days IS NOT NULL THEN
    eligible_at := c.municipal_logged_at + make_interval(days => rule.turnaround_days);
    IF eligible_at > now() THEN
      RAISE EXCEPTION 'Escalation is available from % (municipal turnaround period)',
        to_char(eligible_at AT TIME ZONE 'Africa/Johannesburg', 'DD Mon YYYY');
    END IF;
  END IF;

  INSERT INTO public.escalations (complaint_id, requested_by, reason, additional_info, is_urgent_safety)
  VALUES (_complaint, (SELECT auth.uid()), btrim(_reason), nullif(btrim(_additional_info), ''), _urgent_safety)
  RETURNING id INTO esc_id;

  PERFORM public.set_status_note(
    CASE WHEN _urgent_safety THEN 'Urgent safety review requested by resident.' ELSE 'Escalation requested by resident.' END,
    true);
  UPDATE public.complaints
  SET status = 'escalation_requested',
      priority = CASE WHEN _urgent_safety AND priority = 'routine' THEN 'urgent' ELSE priority END
  WHERE id = _complaint;
  RETURN esc_id;
END;
$$;

CREATE FUNCTION public.confirm_resolution(_complaint uuid, _comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR c.resident_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;
  IF c.status NOT IN ('resolution_reported', 'resolved') THEN
    RAISE EXCEPTION 'Only a reported resolution can be confirmed';
  END IF;
  PERFORM public.set_status_note(coalesce(nullif(btrim(_comment), ''), 'Resident confirmed the fault is resolved.'), true);
  UPDATE public.complaints SET status = 'closed', resident_confirmed_at = now() WHERE id = _complaint;
  UPDATE public.escalations SET stage = 'closed', closed_at = now()
  WHERE complaint_id = _complaint AND stage NOT IN ('closed', 'declined');
END;
$$;

CREATE FUNCTION public.reopen_complaint(_complaint uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
BEGIN
  IF char_length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Please explain why the fault is not resolved (at least 10 characters)';
  END IF;
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR (c.resident_id <> (SELECT auth.uid()) AND NOT public.is_ward_staff(c.ward_id)) THEN
    RAISE EXCEPTION 'Complaint not found';
  END IF;
  IF c.status NOT IN ('resolution_reported', 'resolved', 'closed') THEN
    RAISE EXCEPTION 'Only resolved or closed complaints can be reopened';
  END IF;
  PERFORM public.set_status_note('Reopened: ' || btrim(_reason), true);
  UPDATE public.complaints SET status = 'reopened' WHERE id = _complaint;
END;
$$;

-- Staff actions -------------------------------------------------------------------------------------
CREATE FUNCTION public.change_complaint_status(
  _complaint uuid, _status public.complaint_status, _note text DEFAULT NULL, _public boolean DEFAULT true
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR NOT public.is_ward_staff(c.ward_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _status = 'draft' OR c.status = 'draft' THEN
    RAISE EXCEPTION 'Drafts are managed by the resident';
  END IF;
  IF _status = c.status THEN
    RAISE EXCEPTION 'Complaint is already %', public.status_label(_status);
  END IF;
  PERFORM public.set_status_note(nullif(btrim(_note), ''), _public);
  UPDATE public.complaints SET status = _status WHERE id = _complaint;
END;
$$;

CREATE FUNCTION public.assign_complaint(_complaint uuid, _admin uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR NOT public.is_ward_staff(c.ward_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _admin IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _admin AND (r.role = 'super_admin' OR (r.role IN ('ward_admin', 'councillor') AND r.ward_id = c.ward_id))
  ) THEN
    RAISE EXCEPTION 'Complaints can only be assigned to ward staff';
  END IF;
  UPDATE public.complaint_assignments SET ended_at = now() WHERE complaint_id = _complaint AND ended_at IS NULL;
  IF _admin IS NOT NULL THEN
    INSERT INTO public.complaint_assignments (complaint_id, assigned_to, assigned_by)
    VALUES (_complaint, _admin, (SELECT auth.uid()));
  END IF;
  UPDATE public.complaints SET assigned_admin_id = _admin WHERE id = _complaint;
  IF _admin IS NOT NULL AND _admin <> (SELECT auth.uid()) THEN
    PERFORM public.queue_notification(_admin, _complaint, 'complaint_assigned',
      jsonb_build_object('tracking_id', c.tracking_number));
  END IF;
END;
$$;

-- Moves an escalation along Resident → Administrator → Councillor → Liaison and mirrors it on the complaint.
CREATE FUNCTION public.advance_escalation(_escalation uuid, _stage public.escalation_stage, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  e public.escalations;
  c public.complaints;
  new_status public.complaint_status;
BEGIN
  SELECT * INTO e FROM public.escalations WHERE id = _escalation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escalation not found'; END IF;
  SELECT * INTO c FROM public.complaints WHERE id = e.complaint_id FOR UPDATE;
  IF NOT public.is_ward_staff(c.ward_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF e.stage IN ('closed', 'declined') THEN RAISE EXCEPTION 'This escalation is already closed'; END IF;
  IF _stage = 'with_councillor' AND NOT (public.has_role('councillor', c.ward_id) OR public.has_role('ward_admin', c.ward_id) OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.escalations
  SET stage = _stage,
      assigned_admin_id = coalesce(assigned_admin_id, (SELECT auth.uid())),
      closed_at = CASE WHEN _stage IN ('closed', 'declined') THEN now() END
  WHERE id = _escalation;

  IF nullif(btrim(_note), '') IS NOT NULL THEN
    INSERT INTO public.internal_notes (complaint_id, escalation_id, author_id, body)
    VALUES (e.complaint_id, _escalation, (SELECT auth.uid()), btrim(_note));
  END IF;

  new_status := CASE _stage
    WHEN 'admin_review' THEN 'under_review'
    WHEN 'with_councillor' THEN 'escalated_to_councillor'
    WHEN 'with_liaison' THEN 'awaiting_municipal_feedback'
    WHEN 'declined' THEN 'under_review'
  END;
  IF new_status IS NOT NULL AND new_status <> c.status THEN
    PERFORM public.set_status_note(CASE _stage
      WHEN 'with_councillor' THEN 'Your complaint has been escalated to the Ward Councillor.'
      WHEN 'with_liaison' THEN 'The ward office has referred your complaint to the municipal liaison.'
      WHEN 'declined' THEN 'Escalation reviewed by the ward office; further follow-up will continue.'
      ELSE 'Your escalation is being reviewed by the ward office.' END, true);
    UPDATE public.complaints SET status = new_status WHERE id = e.complaint_id;
  END IF;
END;
$$;

-- Municipal liaison: record a response and optionally report progress or resolution.
CREATE FUNCTION public.record_liaison_response(
  _complaint uuid, _summary text, _status public.complaint_status DEFAULT NULL,
  _needs_more_info boolean DEFAULT false, _visible_to_resident boolean DEFAULT true
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c public.complaints;
  resp_id uuid;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint FOR UPDATE;
  IF NOT FOUND OR c.status = 'draft' OR NOT (c.municipal_entity_id IN (SELECT public.liaison_entity_ids())) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('in_progress', 'resolution_reported') THEN
    RAISE EXCEPTION 'Liaisons can only report progress or a resolution';
  END IF;

  INSERT INTO public.municipal_responses (complaint_id, escalation_id, municipal_entity_id, recorded_by, channel,
    summary, is_verified, needs_more_info, visible_to_resident)
  VALUES (_complaint,
    (SELECT e.id FROM public.escalations e WHERE e.complaint_id = _complaint AND e.stage NOT IN ('closed', 'declined')),
    c.municipal_entity_id, (SELECT auth.uid()), 'liaison_portal', btrim(_summary), true,
    _needs_more_info, _visible_to_resident)
  RETURNING id INTO resp_id;

  UPDATE public.escalations SET stage = 'response_received'
  WHERE complaint_id = _complaint AND stage = 'with_liaison';

  IF _status IS NOT NULL AND _status <> c.status THEN
    PERFORM public.set_status_note(CASE WHEN _visible_to_resident THEN btrim(_summary) END, true);
    UPDATE public.complaints
    SET status = _status, resolution_verified = (_status = 'resolution_reported')
    WHERE id = _complaint;
  END IF;
  RETURN resp_id;
END;
$$;

-- Row-level security -------------------------------------------------------------------------------
ALTER TABLE public.escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.escalation_rules, public.tracking_counters, public.complaints,
  public.complaint_status_history, public.complaint_attachments, public.complaint_assignments,
  public.escalations, public.municipal_responses, public.internal_notes, public.follow_up_tasks,
  public.notification_templates, public.notifications FROM anon, authenticated;

-- Turnaround rules are shown to residents so they know when escalation opens.
GRANT SELECT ON public.escalation_rules TO authenticated;
GRANT INSERT, UPDATE ON public.escalation_rules TO authenticated;
CREATE POLICY "Signed-in users read escalation rules" ON public.escalation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage escalation rules" ON public.escalation_rules FOR ALL TO authenticated
  USING (public.is_ward_staff()) WITH CHECK (public.is_ward_staff());

GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
CREATE POLICY "View authorised complaints" ON public.complaints FOR SELECT TO authenticated
  USING (
    resident_id = (SELECT auth.uid())
    OR public.is_ward_staff(ward_id)
    OR (status <> 'draft' AND municipal_entity_id IN (SELECT public.liaison_entity_ids()))
  );
CREATE POLICY "Residents create their own complaints" ON public.complaints FOR INSERT TO authenticated
  WITH CHECK (resident_id = (SELECT auth.uid()) AND status IN ('draft', 'submitted'));
CREATE POLICY "Residents edit their drafts" ON public.complaints FOR UPDATE TO authenticated
  USING (resident_id = (SELECT auth.uid()) AND status = 'draft')
  WITH CHECK (resident_id = (SELECT auth.uid()) AND status IN ('draft', 'submitted'));
CREATE POLICY "Ward staff update complaints" ON public.complaints FOR UPDATE TO authenticated
  USING (public.is_ward_staff(ward_id)) WITH CHECK (public.is_ward_staff(ward_id));

-- Residents may discard drafts only.
GRANT DELETE ON public.complaints TO authenticated;
CREATE POLICY "Residents delete their drafts" ON public.complaints FOR DELETE TO authenticated
  USING (resident_id = (SELECT auth.uid()) AND status = 'draft');

GRANT SELECT ON public.complaint_status_history TO authenticated;
CREATE POLICY "View status history" ON public.complaint_status_history FOR SELECT TO authenticated
  USING (public.can_view_complaint(complaint_id) AND (is_public OR public.is_complaint_staff(complaint_id)
         OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.municipal_entity_id IN (SELECT public.liaison_entity_ids()))));

GRANT SELECT, INSERT, DELETE ON public.complaint_attachments TO authenticated;
CREATE POLICY "View attachments" ON public.complaint_attachments FOR SELECT TO authenticated
  USING (public.can_view_complaint(complaint_id)
         AND (resident_visible OR uploaded_by = (SELECT auth.uid()) OR public.is_complaint_staff(complaint_id)
              OR kind = 'liaison_document'));
CREATE POLICY "Add attachments" ON public.complaint_attachments FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = (SELECT auth.uid())
    AND (
      (kind = 'evidence' AND EXISTS (
        SELECT 1 FROM public.complaints c WHERE c.id = complaint_id
          AND c.resident_id = (SELECT auth.uid()) AND c.status NOT IN ('closed')))
      OR (kind = 'staff_document' AND public.is_complaint_staff(complaint_id))
      OR (kind = 'liaison_document' AND EXISTS (
        SELECT 1 FROM public.complaints c WHERE c.id = complaint_id
          AND c.municipal_entity_id IN (SELECT public.liaison_entity_ids())))
    )
  );
-- Uploaders may also remove their own just-created row (e.g. when the file upload then fails).
CREATE POLICY "Remove own draft evidence or as staff" ON public.complaint_attachments FOR DELETE TO authenticated
  USING (
    public.is_complaint_staff(complaint_id)
    OR (uploaded_by = (SELECT auth.uid()) AND (
      created_at > now() - interval '15 minutes'
      OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.status = 'draft')))
  );

GRANT SELECT ON public.complaint_assignments TO authenticated;
CREATE POLICY "Staff view assignments" ON public.complaint_assignments FOR SELECT TO authenticated
  USING (public.is_complaint_staff(complaint_id));

GRANT SELECT, UPDATE ON public.escalations TO authenticated;
CREATE POLICY "View escalations" ON public.escalations FOR SELECT TO authenticated
  USING (public.can_view_complaint(complaint_id));
CREATE POLICY "Staff update escalations" ON public.escalations FOR UPDATE TO authenticated
  USING (public.is_complaint_staff(complaint_id)) WITH CHECK (public.is_complaint_staff(complaint_id));

GRANT SELECT, INSERT ON public.municipal_responses TO authenticated;
CREATE POLICY "View municipal responses" ON public.municipal_responses FOR SELECT TO authenticated
  USING (
    public.is_complaint_staff(complaint_id)
    OR municipal_entity_id IN (SELECT public.liaison_entity_ids())
    OR (visible_to_resident AND EXISTS (
      SELECT 1 FROM public.complaints c WHERE c.id = complaint_id AND c.resident_id = (SELECT auth.uid())))
  );
CREATE POLICY "Staff record municipal responses" ON public.municipal_responses FOR INSERT TO authenticated
  WITH CHECK (public.is_complaint_staff(complaint_id) AND recorded_by = (SELECT auth.uid()));

-- Internal notes: ward staff only. Never residents or liaisons.
GRANT SELECT, INSERT ON public.internal_notes TO authenticated;
CREATE POLICY "Staff read internal notes" ON public.internal_notes FOR SELECT TO authenticated
  USING (public.is_complaint_staff(complaint_id));
CREATE POLICY "Staff write internal notes" ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_complaint_staff(complaint_id) AND author_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_tasks TO authenticated;
CREATE POLICY "Staff manage tasks" ON public.follow_up_tasks FOR ALL TO authenticated
  USING (public.is_ward_staff() AND (complaint_id IS NULL OR public.is_complaint_staff(complaint_id)))
  WITH CHECK (public.is_ward_staff() AND created_by IS NOT NULL
              AND (complaint_id IS NULL OR public.is_complaint_staff(complaint_id)));

GRANT SELECT, UPDATE ON public.notification_templates TO authenticated;
CREATE POLICY "Staff read templates" ON public.notification_templates FOR SELECT TO authenticated
  USING (public.is_ward_staff());
CREATE POLICY "Staff edit templates" ON public.notification_templates FOR UPDATE TO authenticated
  USING (public.is_ward_staff()) WITH CHECK (public.is_ward_staff());

GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;
CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Mark own notifications read" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

-- Function privileges.
REVOKE ALL ON FUNCTION public.next_tracking_number(uuid), public.prepare_complaint(), public.guard_complaint_write(),
  public.record_status_change(), public.guard_attachment(), public.queue_notification(uuid, uuid, text, jsonb),
  public.notify_status_change(), public.set_status_note(text, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_complaint(uuid), public.is_complaint_staff(uuid),
  public.request_escalation(uuid, text, text, boolean), public.confirm_resolution(uuid, text),
  public.reopen_complaint(uuid, text), public.change_complaint_status(uuid, public.complaint_status, text, boolean),
  public.assign_complaint(uuid, uuid), public.advance_escalation(uuid, public.escalation_stage, text),
  public.record_liaison_response(uuid, text, public.complaint_status, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_complaint(uuid), public.is_complaint_staff(uuid),
  public.request_escalation(uuid, text, text, boolean), public.confirm_resolution(uuid, text),
  public.reopen_complaint(uuid, text), public.change_complaint_status(uuid, public.complaint_status, text, boolean),
  public.assign_complaint(uuid, uuid), public.advance_escalation(uuid, public.escalation_stage, text),
  public.record_liaison_response(uuid, text, public.complaint_status, boolean, boolean)
  TO authenticated;
