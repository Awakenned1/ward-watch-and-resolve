ALTER TABLE public.ward109_fault_reports
  ADD COLUMN logged_at timestamptz NOT NULL DEFAULT now();