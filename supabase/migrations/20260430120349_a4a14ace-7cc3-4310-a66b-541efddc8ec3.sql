-- Private table to hold the cron shared secret value (only service role can read)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated. Only service_role bypasses RLS.

-- Helper to fetch the cron secret. SECURITY DEFINER + locked down EXECUTE.
CREATE OR REPLACE FUNCTION public._get_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT value FROM public.app_settings WHERE key = 'cron_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._get_cron_secret() FROM PUBLIC, anon, authenticated;

-- Reschedule the three cron jobs to include the x-cron-secret header
SELECT cron.unschedule('daily-report-reminder');
SELECT cron.unschedule('manager-missing-alert');
SELECT cron.unschedule('n8n-monthly-trigger');

SELECT cron.schedule(
  'daily-report-reminder',
  '40 16 * * 1-6',
  $job$
  SELECT net.http_post(
    url := 'https://sycwraeamscnwhwjrhlw.supabase.co/functions/v1/daily-report-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3dyYWVhbXNjbndod2pyaGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzU4MDQsImV4cCI6MjA5MjUxMTgwNH0.trfZS4-dsnfOEav2dqslIs6BVu6TOqYoQs68KzFstes',
      'x-cron-secret', coalesce(public._get_cron_secret(), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'manager-missing-alert',
  '0 17 * * 5',
  $job$
  SELECT net.http_post(
    url := 'https://sycwraeamscnwhwjrhlw.supabase.co/functions/v1/manager-missing-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3dyYWVhbXNjbndod2pyaGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzU4MDQsImV4cCI6MjA5MjUxMTgwNH0.trfZS4-dsnfOEav2dqslIs6BVu6TOqYoQs68KzFstes',
      'x-cron-secret', coalesce(public._get_cron_secret(), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);

SELECT cron.schedule(
  'n8n-monthly-trigger',
  '0 2 1 * *',
  $job$
  SELECT net.http_post(
    url := 'https://sycwraeamscnwhwjrhlw.supabase.co/functions/v1/n8n-monthly-trigger',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3dyYWVhbXNjbndod2pyaGx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzU4MDQsImV4cCI6MjA5MjUxMTgwNH0.trfZS4-dsnfOEav2dqslIs6BVu6TOqYoQs68KzFstes',
      'x-cron-secret', coalesce(public._get_cron_secret(), '')
    ),
    body := '{}'::jsonb
  );
  $job$
);
