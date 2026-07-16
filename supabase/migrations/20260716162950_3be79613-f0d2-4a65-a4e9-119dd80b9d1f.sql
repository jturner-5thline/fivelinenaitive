CREATE OR REPLACE FUNCTION public.can_view_company_insights(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- Always-allow bypass for specific 5th Line users
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) IN ('mclark@5thline.co', 'swilliams@5thline.co')
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = _company_id
        AND cm.user_id = auth.uid()
        AND (
          cm.can_see_insights = true
          OR EXISTS (
            SELECT 1
            FROM public.page_access_allowlist pa
            JOIN auth.users u ON lower(u.email) = lower(pa.email)
            WHERE u.id = auth.uid()
              AND pa.page_key = 'insights'
          )
        )
    );
$function$;