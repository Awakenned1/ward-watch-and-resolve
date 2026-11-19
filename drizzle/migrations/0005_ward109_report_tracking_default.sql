ALTER TABLE public.ward109_fault_reports
  ALTER COLUMN tracking_code SET DEFAULT (
    'W109-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  );