-- Add first_name and last_name columns to profiles if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Update the handle_new_user function to extract Google OAuth data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, avatar_url)
  VALUES (new.id, clean_name, NULLIF(first, ''), NULLIF(last, ''), avatar);
  
  RETURN new;
END;
$$;