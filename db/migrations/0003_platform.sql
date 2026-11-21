-- Ward 109 Resolved: verified-email role provisioning, evidence storage, public statistics,
-- duplicate detection, announcements, POPIA requests, report exports.

-- Verified-email role provisioning ----------------------------------------------------------
-- A role is granted only once the matching account's email is confirmed. Managed by super admins
-- (or the SQL editor for the very first super admin).
CREATE TABLE public.role_email_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role NOT NULL CHECK (role <> 'resident'),
  ward_id uuid REFERENCES public.wards(id) ON DELETE CASCADE,
  municipal_entity_id uuid REFERENCES public.municipal_entities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'municipal_liaison') = (municipal_entity_id IS NOT NULL)),
  CHECK (role = 'super_admin' OR ward_id IS NOT NULL)
);
CREATE UNIQUE INDEX role_email_grants_unique ON public.role_email_grants
  (email, role, coalesce(ward_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(municipal_entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE FUNCTION public.apply_role_email_grants(_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  u record;
BEGIN
  SELECT id, lower(email) AS email, email_confirmed_at INTO u FROM auth.users WHERE id = _user;
  -- Drop email-provisioned roles that no longer match (email changed, grant removed, unconfirmed).
  DELETE FROM public.user_roles r
  WHERE r.user_id = _user AND r.granted_by IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.role_email_grants g
      WHERE u.email_confirmed_at IS NOT NULL AND g.email = u.email AND g.role = r.role
        AND g.ward_id IS NOT DISTINCT FROM r.ward_id
        AND g.municipal_entity_id IS NOT DISTINCT FROM r.municipal_entity_id
    );
  IF u.email_confirmed_at IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_roles (user_id, role, ward_id, municipal_entity_id, granted_by)
  SELECT _user, g.role, g.ward_id, g.municipal_entity_id, NULL
  FROM public.role_email_grants g WHERE g.email = u.email
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.on_auth_user_roles_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.apply_role_email_grants(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_roles_insert AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_roles_sync();
CREATE TRIGGER on_auth_user_roles_update AFTER UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_roles_sync();

CREATE FUNCTION public.on_role_email_grant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target uuid;
BEGIN
  FOR target IN
    SELECT u.id FROM auth.users u
    WHERE lower(u.email) IN (
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.email END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.email END)
  LOOP
    PERFORM public.apply_role_email_grants(target);
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER role_email_grants_sync AFTER INSERT OR UPDATE OR DELETE ON public.role_email_grants
  FOR EACH ROW EXECUTE FUNCTION public.on_role_email_grant_change();
CREATE TRIGGER audit_role_email_grants AFTER INSERT OR UPDATE OR DELETE ON public.role_email_grants
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

ALTER TABLE public.role_email_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_email_grants FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.role_email_grants TO authenticated;
CREATE POLICY "Super admins manage role grants" ON public.role_email_grants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin() AND created_by = (SELECT auth.uid()));

-- Evidence storage (private) -------------------------------------------------------------------
-- Object path: <complaint id>/<random>.<ext>; access follows the complaint.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('complaint-evidence', 'complaint-evidence', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE FUNCTION public.storage_complaint_id(_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF split_part(_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND split_part(_name, '/', 2) ~ '^[a-z0-9-]{8,64}\.(jpg|jpeg|png|webp|pdf)$'
     AND split_part(_name, '/', 3) = '' THEN
    RETURN split_part(_name, '/', 1)::uuid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE POLICY "Upload evidence for permitted complaints" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'complaint-evidence'
    AND public.storage_complaint_id(name) IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = public.storage_complaint_id(name)
              AND c.resident_id = (SELECT auth.uid()) AND c.status <> 'closed')
      OR public.is_complaint_staff(public.storage_complaint_id(name))
      OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = public.storage_complaint_id(name)
                 AND c.status <> 'draft' AND c.municipal_entity_id IN (SELECT public.liaison_entity_ids()))
    )
  );
-- Reading requires a matching attachment row the viewer may see (signed URLs are issued after this check).
CREATE POLICY "Read permitted evidence" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'complaint-evidence'
    AND EXISTS (SELECT 1 FROM public.complaint_attachments a WHERE a.storage_path = name)
    AND public.can_view_complaint(public.storage_complaint_id(name))
  );
CREATE POLICY "Delete own draft evidence or as staff" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'complaint-evidence'
    AND (
      public.is_complaint_staff(public.storage_complaint_id(name))
      OR EXISTS (SELECT 1 FROM public.complaints c WHERE c.id = public.storage_complaint_id(name)
                 AND c.resident_id = (SELECT auth.uid()) AND c.status = 'draft')
    )
  );

-- Public, privacy-safe statistics --------------------------------------------------------------------
-- Excludes drafts and demo data; any count below the threshold is returned as NULL ("fewer than N").
CREATE FUNCTION public.public_ward_stats(_ward_number integer DEFAULT 109)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  w uuid;
  k integer := public.setting_int('public.min_aggregate', 5);
  result jsonb;
BEGIN
  SELECT id INTO w FROM public.wards WHERE ward_number = _ward_number AND is_active;
  IF w IS NULL THEN RETURN NULL; END IF;

  WITH real AS (
    SELECT c.* FROM public.complaints c
    WHERE c.ward_id = w AND c.status <> 'draft' AND NOT c.is_demo
  ),
  totals AS (
    SELECT count(*) AS total,
      count(*) FILTER (WHERE status IN ('resolved', 'closed')) AS resolved,
      count(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) AS outstanding,
      count(*) FILTER (WHERE status IN ('in_progress', 'under_review', 'awaiting_municipal_feedback', 'reopened')) AS in_progress,
      count(*) FILTER (WHERE status IN ('escalation_requested', 'escalated_to_councillor')) AS escalated
    FROM real
  ),
  by_category AS (
    SELECT sc.name, count(*) AS n FROM real r JOIN public.service_categories sc ON sc.id = r.category_id
    GROUP BY sc.name HAVING count(*) >= k ORDER BY n DESC LIMIT 8
  ),
  by_month AS (
    SELECT to_char(date_trunc('month', r.submitted_at AT TIME ZONE 'Africa/Johannesburg'), 'YYYY-MM') AS month,
      count(*) AS submitted,
      count(*) FILTER (WHERE r.status IN ('resolved', 'closed')) AS resolved
    FROM real r WHERE r.submitted_at > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'min_aggregate', k,
    'total', CASE WHEN t.total >= k THEN t.total END,
    'resolved', CASE WHEN t.resolved >= k THEN t.resolved END,
    'outstanding', CASE WHEN t.outstanding >= k THEN t.outstanding END,
    'in_progress', CASE WHEN t.in_progress >= k THEN t.in_progress END,
    'escalated', CASE WHEN t.escalated >= k THEN t.escalated END,
    'by_category', coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'count', n)) FROM by_category), '[]'::jsonb),
    'by_month', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'month', month,
        'submitted', CASE WHEN submitted >= k THEN submitted END,
        'resolved', CASE WHEN resolved >= k THEN resolved END)) FROM by_month), '[]'::jsonb),
    'generated_at', now()
  ) INTO result FROM totals t;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.public_ward_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_ward_stats(integer) TO anon, authenticated;

-- Duplicate detection: similar open complaints nearby, without any personal data.
CREATE FUNCTION public.find_similar_complaints(
  _category uuid, _suburb uuid, _street_name text DEFAULT NULL,
  _lat double precision DEFAULT NULL, _lng double precision DEFAULT NULL
)
RETURNS TABLE (tracking_number text, issue_type text, status public.complaint_status,
               submitted_on date, distance_m integer, same_street boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.tracking_number, it.name, c.status,
    (c.submitted_at AT TIME ZONE 'Africa/Johannesburg')::date,
    CASE WHEN _lat IS NOT NULL AND c.latitude IS NOT NULL THEN
      round(6371000 * 2 * asin(sqrt(
        power(sin(radians(c.latitude - _lat) / 2), 2)
        + cos(radians(_lat)) * cos(radians(c.latitude)) * power(sin(radians(c.longitude - _lng) / 2), 2))))::integer
    END AS distance_m,
    (_street_name IS NOT NULL AND lower(btrim(c.street_name)) = lower(btrim(_street_name))) AS same_street
  FROM public.complaints c
  JOIN public.issue_types it ON it.id = c.issue_type_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND c.category_id = _category AND c.suburb_id = _suburb
    AND c.status NOT IN ('draft', 'resolved', 'closed')
    AND c.submitted_at > now() - interval '90 days'
    AND c.resident_id <> (SELECT auth.uid())
    AND NOT c.is_demo
  ORDER BY same_street DESC, distance_m NULLS LAST, c.submitted_at DESC
  LIMIT 5;
$$;
REVOKE ALL ON FUNCTION public.find_similar_complaints(uuid, uuid, text, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_similar_complaints(uuid, uuid, text, double precision, double precision) TO authenticated;

-- Announcements ---------------------------------------------------------------------------------------
CREATE TYPE public.announcement_kind AS ENUM (
  'water_interruption', 'electricity_maintenance', 'road_closure', 'community_meeting', 'service_update', 'general'
);
-- 'official_verified' = confirmed notice from a municipal entity; 'ward_update' = ward administration update.
CREATE TYPE public.announcement_source AS ENUM ('official_verified', 'ward_update');

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  kind public.announcement_kind NOT NULL DEFAULT 'general',
  source public.announcement_source NOT NULL DEFAULT 'ward_update',
  source_reference text,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 6000),
  starts_at timestamptz,
  ends_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source = 'ward_update' OR source_reference IS NOT NULL)
);
CREATE INDEX announcements_published_idx ON public.announcements (ward_id, is_published, published_at DESC);
CREATE TRIGGER announcements_touch BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE FUNCTION public.set_announcement_published_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.is_published AND (TG_OP = 'INSERT' OR NOT OLD.is_published) THEN NEW.published_at := now(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER announcements_published BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_announcement_published_at();
CREATE TRIGGER audit_announcements AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM anon, authenticated;
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
CREATE POLICY "Published announcements are public" ON public.announcements FOR SELECT
  USING (is_published OR public.is_ward_staff(ward_id));
CREATE POLICY "Ward staff manage announcements" ON public.announcements FOR ALL TO authenticated
  USING (public.is_ward_staff(ward_id))
  WITH CHECK (public.is_ward_staff(ward_id) AND created_by IS NOT NULL);

-- POPIA requests --------------------------------------------------------------------------------------
CREATE TYPE public.privacy_request_kind AS ENUM ('access', 'correction', 'deletion');
CREATE TYPE public.privacy_request_status AS ENUM ('received', 'in_progress', 'completed', 'declined');

CREATE TABLE public.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.privacy_request_kind NOT NULL,
  details text CHECK (details IS NULL OR char_length(details) <= 2000),
  status public.privacy_request_status NOT NULL DEFAULT 'received',
  response text,
  handled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX privacy_requests_status_idx ON public.privacy_requests (status, created_at);
CREATE TRIGGER audit_privacy_requests AFTER INSERT OR UPDATE OR DELETE ON public.privacy_requests
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.privacy_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.privacy_requests TO authenticated;
GRANT UPDATE (status, response, handled_by, resolved_at) ON public.privacy_requests TO authenticated;
CREATE POLICY "Own privacy requests" ON public.privacy_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_super_admin());
CREATE POLICY "File own privacy requests" ON public.privacy_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'received');
CREATE POLICY "Super admins handle privacy requests" ON public.privacy_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Report exports log -------------------------------------------------------------------------------------
CREATE TABLE public.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type ~ '^[a-z_]+$'),
  format text NOT NULL CHECK (format IN ('pdf', 'xlsx', 'csv')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_exports FROM anon, authenticated;
GRANT SELECT, INSERT ON public.report_exports TO authenticated;
CREATE POLICY "Staff read exports" ON public.report_exports FOR SELECT TO authenticated
  USING (public.is_ward_staff(ward_id));
CREATE POLICY "Staff log exports" ON public.report_exports FOR INSERT TO authenticated
  WITH CHECK (public.is_ward_staff(ward_id) AND requested_by = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION public.apply_role_email_grants(uuid), public.on_auth_user_roles_sync(),
  public.on_role_email_grant_change(), public.set_announcement_published_at() FROM PUBLIC, anon, authenticated;
