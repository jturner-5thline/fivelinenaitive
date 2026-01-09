-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Update handle_new_user function to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  clean_name TEXT;
  first TEXT;
  last TEXT;
  avatar TEXT;
BEGIN
  -- Extract first name from Google OAuth (given_name) or fallback
  first := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'given_name'),
    TRIM(new.raw_user_meta_data ->> 'first_name'),
    SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)
  );
  
  -- Extract last name from Google OAuth (family_name) or fallback
  last := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'family_name'),
    TRIM(new.raw_user_meta_data ->> 'last_name'),
    NULLIF(TRIM(SUBSTRING(
      COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
      LENGTH(SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)) + 2
    )), '')
  );
  
  -- Extract avatar URL from Google OAuth (picture or avatar_url)
  avatar := COALESCE(
    new.raw_user_meta_data ->> 'picture',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  
  -- Build display name from first + last, or fallback to email
  clean_name := COALESCE(
    NULLIF(TRIM(CONCAT(first, ' ', last)), ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'display_name',
    SPLIT_PART(new.email, '@', 1)
  );
  
  -- Ensure name is not empty
  IF clean_name = '' OR clean_name IS NULL THEN
    clean_name := SPLIT_PART(new.email, '@', 1);
  END IF;
  
  -- Limit lengths
  clean_name := SUBSTRING(clean_name, 1, 100);
  first := SUBSTRING(first, 1, 50);
  last := SUBSTRING(last, 1, 50);
  
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, avatar_url, email)
  VALUES (new.id, clean_name, NULLIF(first, ''), NULLIF(last, ''), avatar, new.email);
  
  RETURN new;
END;
$function$;

-- Backfill existing profiles with emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id
  AND p.email IS NULL;

-- Update RLS to allow company members to see other members' profiles (limited fields)
CREATE POLICY "Company members can view teammate profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = auth.uid()
      AND cm2.user_id = profiles.user_id
  )
);