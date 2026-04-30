-- 1) Add caller authorization guard to missing_report_users_for_date
CREATE OR REPLACE FUNCTION public.missing_report_users_for_date(_company_id uuid, _date date)
 RETURNS TABLE(user_id uuid, full_name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service-role calls (auth.uid() is null from edge functions) through.
  -- Block any signed-in user that is not a manager/admin of the target company.
  IF auth.uid() IS NOT NULL AND NOT public.is_manager_of(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  WHERE p.company_id = _company_id
    AND public.has_role_in_company(p.id, _company_id, 'staff'::app_role)
    AND public.should_submit_report_for_date(p.id, _date)
    AND NOT EXISTS (
      SELECT 1 FROM public.daily_reports r
      WHERE r.user_id = p.id AND r.report_date = _date
    );
END;
$function$;

-- 2) Tighten component-images storage policies
-- Drop overly permissive policies on this bucket if they exist
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname LIKE 'component-images%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Public read is fine for displaying component images (bucket is public).
CREATE POLICY "component-images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'component-images');

-- Only authenticated members of a company may upload.
CREATE POLICY "component-images authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'component-images'
  AND public.get_user_company(auth.uid()) IS NOT NULL
);

-- Only authenticated members of a company may update objects (their own uploads).
CREATE POLICY "component-images owner update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'component-images'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'component-images'
  AND owner = auth.uid()
);

-- Only the original uploader (or an admin of their company) may delete.
CREATE POLICY "component-images owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'component-images'
  AND (
    owner = auth.uid()
    OR public.is_admin_of(auth.uid(), public.get_user_company(auth.uid()))
  )
);
