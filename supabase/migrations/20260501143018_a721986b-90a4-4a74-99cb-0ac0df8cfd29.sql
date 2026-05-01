-- Private bucket for backfill files
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-imports', 'report-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: only managers/admins of a company can manage files under <company_id>/...
CREATE POLICY "managers upload report-imports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-imports'
  AND public.is_manager_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "managers read report-imports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-imports'
  AND public.is_manager_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "managers delete report-imports"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'report-imports'
  AND public.is_manager_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- Job tracking table
CREATE TYPE public.report_import_status AS ENUM ('pending','processing','completed','failed');

CREATE TABLE public.report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  created_by uuid NOT NULL,
  storage_path text,                 -- nullable when source_url is set
  source_url text,                   -- alternative: paste an external link
  source_label text,                 -- original filename or url label
  period_start date,
  period_end date,
  status public.report_import_status NOT NULL DEFAULT 'pending',
  name_email_map jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name, email}]
  inserted_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers view report imports"
ON public.report_imports FOR SELECT TO authenticated
USING (public.is_manager_of(auth.uid(), company_id));

CREATE POLICY "managers create report imports"
ON public.report_imports FOR INSERT TO authenticated
WITH CHECK (
  company_id = public.get_user_company(auth.uid())
  AND public.is_manager_of(auth.uid(), company_id)
  AND created_by = auth.uid()
);

CREATE POLICY "managers update report imports"
ON public.report_imports FOR UPDATE TO authenticated
USING (public.is_manager_of(auth.uid(), company_id))
WITH CHECK (public.is_manager_of(auth.uid(), company_id));

CREATE POLICY "managers delete report imports"
ON public.report_imports FOR DELETE TO authenticated
USING (public.is_manager_of(auth.uid(), company_id));

-- Prevent duplicate daily reports per user per date (also lets us upsert safely)
CREATE UNIQUE INDEX IF NOT EXISTS daily_reports_user_date_uq
  ON public.daily_reports (user_id, report_date);

-- Helper: insert one historical daily report for a user, used by n8n callback.
-- Skips if a report already exists for that user+date. Returns 'inserted' or 'skipped'.
CREATE OR REPLACE FUNCTION public.import_daily_report_row(
  _company_id uuid,
  _user_id uuid,
  _report_date date,
  _notes text,
  _tasks jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
  v_user_company uuid;
  v_task jsonb;
BEGIN
  IF _user_id IS NULL OR _report_date IS NULL OR _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id, user_id and report_date are required';
  END IF;

  SELECT company_id INTO v_user_company FROM public.profiles WHERE id = _user_id;
  IF v_user_company IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'User does not belong to the specified company';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_reports
    WHERE user_id = _user_id AND report_date = _report_date
  ) THEN
    RETURN 'skipped';
  END IF;

  INSERT INTO public.daily_reports (company_id, user_id, report_date, notes)
  VALUES (_company_id, _user_id, _report_date, _notes)
  RETURNING id INTO v_report_id;

  IF jsonb_typeof(_tasks) = 'array' THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(_tasks) LOOP
      INSERT INTO public.report_tasks (report_id, task_name, quantity)
      VALUES (
        v_report_id,
        COALESCE(v_task->>'task_name', ''),
        NULLIF(v_task->>'quantity','')::int
      );
    END LOOP;
  END IF;

  RETURN 'inserted';
END;
$$;