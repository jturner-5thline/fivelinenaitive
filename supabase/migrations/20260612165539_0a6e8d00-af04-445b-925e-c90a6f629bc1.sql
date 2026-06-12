
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_demo_user boolean NOT NULL DEFAULT false;

-- Backfill from auth.users metadata so historical demo accounts inherit the flag.
UPDATE public.profiles p
SET is_demo_user = true,
    onboarding_completed = true,
    is_active = true,
    approved_at = COALESCE(p.approved_at, now())
FROM auth.users u
WHERE u.id = p.user_id
  AND (
    COALESCE(u.raw_user_meta_data->>'demo_access','') = 'true'
    OR COALESCE(u.raw_user_meta_data->>'invited_via','') = 'demo-access'
  );

CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.user_id = _user_id
      AND (
        u.email LIKE '%@5thline.co'
        OR p.approved_at IS NOT NULL
        OR p.is_demo_user = true
      )
  )
$function$;
