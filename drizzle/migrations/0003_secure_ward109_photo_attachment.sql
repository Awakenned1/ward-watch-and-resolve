DROP POLICY "Residents can submit reports for themselves in Ward 109" ON public.ward109_fault_reports;
CREATE POLICY "Residents can submit reports for themselves in Ward 109"
  ON public.ward109_fault_reports FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND ward_number = 109
    AND status = 'new'
    AND photo_path IS NULL
  );

REVOKE UPDATE ON public.ward109_fault_reports FROM authenticated;
GRANT UPDATE (photo_path, status) ON public.ward109_fault_reports TO authenticated;
CREATE POLICY "Residents can attach photos to their own reports"
  ON public.ward109_fault_reports FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()) AND ward_number = 109);

CREATE OR REPLACE FUNCTION public.guard_ward109_report_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.photo_path IS NOT NULL
    AND NEW.photo_path NOT LIKE (NEW.owner_id::text || '/' || NEW.id::text || '/%')
  THEN
    RAISE EXCEPTION 'Photo must belong to this Ward 109 report';
  END IF;

  IF NOT public.is_ward109_staff() AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only Ward 109 staff can change report status';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER ward109_guard_report_update
  BEFORE UPDATE ON public.ward109_fault_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_ward109_report_update();

DROP POLICY "Residents can upload photos to their own Ward 109 reports" ON storage.objects;
CREATE POLICY "Residents can upload photos to their own Ward 109 reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ward-109-fault-photos'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND lower(split_part(name, '/', 2)) ~ '^[0-9a-f-]{36}$'
    AND lower(split_part(name, '/', 3)) ~ '^[a-z0-9_-]+\\.(jpg|jpeg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = split_part(name, '/', 2)
        AND report.owner_id = (SELECT auth.uid())
    )
  );