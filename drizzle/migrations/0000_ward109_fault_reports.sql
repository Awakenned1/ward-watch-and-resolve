CREATE TYPE public.ward109_case_status AS ENUM ('new', 'logged_with_city', 'in_progress', 'escalated', 'resolved');
CREATE TYPE public.ward109_staff_role AS ENUM ('ward_staff');

CREATE TABLE public.ward109_staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.ward109_staff_role NOT NULL DEFAULT 'ward_staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.ward109_staff_roles TO authenticated;
GRANT ALL ON public.ward109_staff_roles TO service_role;
ALTER TABLE public.ward109_staff_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ward staff can read their own assignments"
  ON public.ward109_staff_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.is_ward109_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ward109_staff_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'ward_staff'::public.ward109_staff_role
  );
$$;
REVOKE ALL ON FUNCTION public.is_ward109_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ward109_staff() TO authenticated;

CREATE TABLE public.ward109_fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  ward_number integer NOT NULL DEFAULT 109 CHECK (ward_number = 109),
  tracking_code text NOT NULL UNIQUE,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 100),
  contact_number text NOT NULL CHECK (char_length(btrim(contact_number)) BETWEEN 7 AND 30),
  address text NOT NULL CHECK (char_length(btrim(address)) BETWEEN 5 AND 300),
  category text NOT NULL CHECK (category IN ('water', 'electricity', 'roads', 'parks', 'refuse', 'safety', 'billing', 'other')),
  city_reference_number text NOT NULL CHECK (char_length(btrim(city_reference_number)) BETWEEN 1 AND 80),
  details text NOT NULL CHECK (char_length(btrim(details)) BETWEEN 10 AND 3000),
  status public.ward109_case_status NOT NULL DEFAULT 'new',
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ward109_fault_reports TO authenticated;
GRANT ALL ON public.ward109_fault_reports TO service_role;
ALTER TABLE public.ward109_fault_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Residents and ward staff can read authorized reports"
  ON public.ward109_fault_reports FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR (SELECT public.is_ward109_staff()));
CREATE POLICY "Residents can submit reports for themselves in Ward 109"
  ON public.ward109_fault_reports FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()) AND ward_number = 109 AND status = 'new');
CREATE POLICY "Ward staff can update reports"
  ON public.ward109_fault_reports FOR UPDATE TO authenticated
  USING ((SELECT public.is_ward109_staff()))
  WITH CHECK (ward_number = 109);

CREATE FUNCTION public.assign_ward109_tracking_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tracking_code IS NULL OR btrim(NEW.tracking_code) = '' THEN
    NEW.tracking_code := 'W109-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ward109_fault_tracking_code
  BEFORE INSERT ON public.ward109_fault_reports
  FOR EACH ROW EXECUTE FUNCTION public.assign_ward109_tracking_code();

CREATE FUNCTION public.set_ward109_fault_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER ward109_fault_updated_at
  BEFORE UPDATE ON public.ward109_fault_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_ward109_fault_updated_at();

CREATE TABLE public.ward109_fault_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_id uuid NOT NULL REFERENCES public.ward109_fault_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  status public.ward109_case_status NOT NULL,
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ward109_fault_updates TO authenticated;
GRANT ALL ON public.ward109_fault_updates TO service_role;
ALTER TABLE public.ward109_fault_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Residents and staff can read authorized report updates"
  ON public.ward109_fault_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id = fault_id
        AND (report.owner_id = (SELECT auth.uid()) OR (SELECT public.is_ward109_staff()))
    )
  );
CREATE POLICY "Ward staff can add report updates"
  ON public.ward109_fault_updates FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (SELECT public.is_ward109_staff())
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report WHERE report.id = fault_id
    )
  );
CREATE INDEX ward109_fault_reports_owner_created_idx ON public.ward109_fault_reports (owner_id, created_at DESC);
CREATE INDEX ward109_fault_reports_status_created_idx ON public.ward109_fault_reports (status, created_at DESC);
CREATE INDEX ward109_fault_updates_fault_created_idx ON public.ward109_fault_updates (fault_id, created_at ASC);

CREATE POLICY "Residents can upload photos to their own Ward 109 reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ward-109-fault-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = (storage.foldername(name))[2]
        AND report.owner_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Residents and ward staff can read report photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_ward109_staff())
    )
  );
CREATE POLICY "Residents and ward staff can replace report photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_ward109_staff())
    )
  )
  WITH CHECK (
    bucket_id = 'ward-109-fault-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_ward109_staff())
    )
  );
CREATE POLICY "Residents and ward staff can remove report photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (SELECT public.is_ward109_staff())
    )
  );