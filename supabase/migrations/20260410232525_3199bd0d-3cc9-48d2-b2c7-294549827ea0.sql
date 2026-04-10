
-- Add capability columns to user_permissions
ALTER TABLE public.user_permissions
ADD COLUMN IF NOT EXISTS can_build_writeup boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_push_flex boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_ai_sync boolean NOT NULL DEFAULT true;

-- Create a security definer function to check capabilities
CREATE OR REPLACE FUNCTION public.get_user_capability(_user_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
      CASE _capability
        WHEN 'can_build_writeup' THEN can_build_writeup
        WHEN 'can_push_flex' THEN can_push_flex
        WHEN 'can_ai_sync' THEN can_ai_sync
        ELSE true
      END
    FROM public.user_permissions
    WHERE user_id = _user_id
    LIMIT 1),
    true
  )
$$;

-- Create a function to check if user is a demo account
CREATE OR REPLACE FUNCTION public.is_demo_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _user_id
      AND email IN ('demo@example.com', 'demo@5thline.co')
  )
$$;
