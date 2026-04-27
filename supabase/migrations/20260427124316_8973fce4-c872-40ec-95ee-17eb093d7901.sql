-- Helpers
CREATE OR REPLACE FUNCTION public.is_manager_of(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and company_id = _company_id
      and role in ('manager'::app_role,'admin'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role_in_company(_user_id uuid, _company_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and company_id = _company_id and role = _role
  );
$$;

-- Task templates
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view task templates" ON public.task_templates FOR SELECT TO authenticated
  USING (company_id = public.get_user_company(auth.uid()));
CREATE POLICY "admins manage task templates" ON public.task_templates FOR ALL TO authenticated
  USING (public.is_admin_of(auth.uid(), company_id))
  WITH CHECK (public.is_admin_of(auth.uid(), company_id));

-- Daily reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  report_date date NOT NULL,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  edited_by uuid,
  edited_at timestamptz,
  UNIQUE (user_id, report_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON public.daily_reports (user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_reports_company_date ON public.daily_reports (company_id, report_date DESC);
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own reports" ON public.daily_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_manager_of(auth.uid(), company_id));
CREATE POLICY "users insert own reports" ON public.daily_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id = public.get_user_company(auth.uid()));
CREATE POLICY "managers update reports" ON public.daily_reports FOR UPDATE TO authenticated
  USING (public.is_manager_of(auth.uid(), company_id))
  WITH CHECK (public.is_manager_of(auth.uid(), company_id));
CREATE POLICY "managers delete reports" ON public.daily_reports FOR DELETE TO authenticated
  USING (public.is_manager_of(auth.uid(), company_id));

-- Report tasks
CREATE TABLE IF NOT EXISTS public.report_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.task_templates(id) ON DELETE SET NULL,
  task_name text NOT NULL,
  quantity integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_tasks_report ON public.report_tasks (report_id);
ALTER TABLE public.report_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view report tasks" ON public.report_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_tasks.report_id
    AND (r.user_id = auth.uid() OR public.is_manager_of(auth.uid(), r.company_id))));
CREATE POLICY "insert report tasks" ON public.report_tasks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_tasks.report_id
    AND (r.user_id = auth.uid() OR public.is_manager_of(auth.uid(), r.company_id))));
CREATE POLICY "managers update report tasks" ON public.report_tasks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_tasks.report_id
    AND public.is_manager_of(auth.uid(), r.company_id)));
CREATE POLICY "delete own report tasks" ON public.report_tasks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = report_tasks.report_id
    AND (r.user_id = auth.uid() OR public.is_manager_of(auth.uid(), r.company_id))));

-- Leave requests
DO $$ BEGIN
  CREATE TYPE public.leave_type AS ENUM ('annual','off_day','sick');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type public.leave_type NOT NULL,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reason text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON public.leave_requests (user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_company_status ON public.leave_requests (company_id, status);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view leaves" ON public.leave_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_manager_of(auth.uid(), company_id));
CREATE POLICY "insert leave" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid())
    AND (user_id = auth.uid() OR public.is_manager_of(auth.uid(), company_id)));
CREATE POLICY "update leaves" ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.is_manager_of(auth.uid(), company_id) OR (user_id = auth.uid() AND status = 'pending'))
  WITH CHECK (public.is_manager_of(auth.uid(), company_id) OR (user_id = auth.uid() AND status = 'pending'));
CREATE POLICY "delete leaves" ON public.leave_requests FOR DELETE TO authenticated
  USING (public.is_manager_of(auth.uid(), company_id) OR (user_id = auth.uid() AND status = 'pending'));

-- Working-day helpers
CREATE OR REPLACE FUNCTION public.previous_working_day(_user_id uuid, _from date DEFAULT current_date)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE d date := _from - 1; guard int := 0;
BEGIN
  WHILE guard < 30 LOOP
    IF EXTRACT(dow FROM d) <> 0 THEN
      IF NOT EXISTS (SELECT 1 FROM public.leave_requests
        WHERE user_id = _user_id AND status = 'approved'
          AND d BETWEEN start_date AND end_date) THEN
        RETURN d;
      END IF;
    END IF;
    d := d - 1; guard := guard + 1;
  END LOOP;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.should_submit_report_for_date(_user_id uuid, _date date)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXTRACT(dow FROM _date) = 0 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.leave_requests
    WHERE user_id = _user_id AND status = 'approved'
      AND _date BETWEEN start_date AND end_date) THEN RETURN false; END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.missing_report_users_for_date(_company_id uuid, _date date)
RETURNS TABLE (user_id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.company_id = _company_id
    AND public.has_role_in_company(p.id, _company_id, 'staff'::app_role)
    AND public.should_submit_report_for_date(p.id, _date)
    AND NOT EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.user_id = p.id AND r.report_date = _date);
$$;

-- System reports
DO $$ BEGIN
  CREATE TYPE public.system_report_type AS ENUM ('monthly','quarterly','biannual','annual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.system_report_status AS ENUM ('pending','ready','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.system_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  report_type public.system_report_type NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status public.system_report_status NOT NULL DEFAULT 'pending',
  file_url text,
  title text,
  metadata jsonb,
  generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_reports_company ON public.system_reports (company_id, period_start DESC);
ALTER TABLE public.system_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers view system reports" ON public.system_reports FOR SELECT TO authenticated
  USING (public.is_manager_of(auth.uid(), company_id));
CREATE POLICY "admins manage system reports" ON public.system_reports FOR ALL TO authenticated
  USING (public.is_admin_of(auth.uid(), company_id))
  WITH CHECK (public.is_admin_of(auth.uid(), company_id));

-- Notifications
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.system_notifications (user_id, is_read, created_at DESC);
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own notifications" ON public.system_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.system_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "managers create notifications" ON public.system_notifications FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company(auth.uid()) AND public.is_manager_of(auth.uid(), company_id));
CREATE POLICY "users delete own notifications" ON public.system_notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- RPC: submit daily report with tasks
CREATE OR REPLACE FUNCTION public.submit_daily_report(
  _report_date date, _notes text, _tasks jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_report_id uuid;
  v_task jsonb;
BEGIN
  v_company := public.get_user_company(v_user);
  IF v_company IS NULL THEN RAISE EXCEPTION 'Not part of a company'; END IF;
  IF _report_date IS NULL THEN RAISE EXCEPTION 'Date required'; END IF;
  IF jsonb_typeof(_tasks) <> 'array' OR jsonb_array_length(_tasks) = 0 THEN
    RAISE EXCEPTION 'At least one task is required';
  END IF;

  INSERT INTO public.daily_reports (company_id, user_id, report_date, notes)
  VALUES (v_company, v_user, _report_date, _notes)
  ON CONFLICT (user_id, report_date)
  DO UPDATE SET notes = EXCLUDED.notes, submitted_at = now()
  RETURNING id INTO v_report_id;

  DELETE FROM public.report_tasks WHERE report_id = v_report_id;

  FOR v_task IN SELECT * FROM jsonb_array_elements(_tasks) LOOP
    INSERT INTO public.report_tasks (report_id, template_id, task_name, quantity)
    VALUES (
      v_report_id,
      NULLIF(v_task->>'template_id','')::uuid,
      COALESCE(v_task->>'task_name',''),
      NULLIF(v_task->>'quantity','')::int
    );
  END LOOP;

  RETURN v_report_id;
END; $$;

-- RPC: managers approve/reject leave
CREATE OR REPLACE FUNCTION public.decide_leave_request(_request_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid(); v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.leave_requests WHERE id = _request_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_manager_of(v_caller, v_company) THEN
    RAISE EXCEPTION 'Only managers can decide leave requests';
  END IF;
  UPDATE public.leave_requests
  SET status = CASE WHEN _approve THEN 'approved'::leave_status ELSE 'rejected'::leave_status END,
      decided_by = v_caller, decided_at = now()
  WHERE id = _request_id;
END; $$;