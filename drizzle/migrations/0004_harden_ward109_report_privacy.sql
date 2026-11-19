CREATE OR REPLACE FUNCTION public.assign_ward109_tracking_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.tracking_code := 'W109-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  RETURN NEW;
END;
$$;

DROP POLICY "Residents and ward staff can read report photos" ON storage.objects;
CREATE POLICY "Residents and ward staff can read report photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND lower(split_part(name, '/', 3)) ~ '^[a-z0-9_-]+\\.(jpg|jpeg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = split_part(name, '/', 2)
        AND (
          (report.owner_id = (SELECT auth.uid()) AND split_part(name, '/', 1) = (SELECT auth.uid())::text)
          OR (SELECT public.is_ward109_staff())
        )
    )
  );

DROP POLICY "Residents and ward staff can replace report photos" ON storage.objects;
CREATE POLICY "Residents and ward staff can replace report photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = split_part(name, '/', 2)
        AND report.owner_id = (SELECT auth.uid())
        AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    bucket_id = 'ward-109-fault-photos'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = split_part(name, '/', 2)
        AND report.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY "Residents and ward staff can remove report photos" ON storage.objects;
CREATE POLICY "Residents and ward staff can remove report photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ward-109-fault-photos'
    AND EXISTS (
      SELECT 1 FROM public.ward109_fault_reports report
      WHERE report.id::text = split_part(name, '/', 2)
        AND (
          (report.owner_id = (SELECT auth.uid()) AND split_part(name, '/', 1) = (SELECT auth.uid())::text)
          OR (SELECT public.is_ward109_staff())
        )
    )
  );