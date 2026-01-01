-- Update handle_new_user function with input validation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  clean_name TEXT;
BEGIN
  -- Validate and sanitize display_name: trim, limit to 100 chars
  clean_name := COALESCE(
    SUBSTRING(TRIM(new.raw_user_meta_data ->> 'display_name'), 1, 100),
    SPLIT_PART(new.email, '@', 1)
  );
  
  -- Ensure name is not empty or just whitespace
  IF clean_name = '' OR clean_name IS NULL THEN
    clean_name := SPLIT_PART(new.email, '@', 1);
  END IF;
  
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, clean_name);
  RETURN new;
END;
$$;

-- Add CHECK constraint on profiles.display_name for defense in depth
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'display_name_length'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT display_name_length CHECK (LENGTH(display_name) <= 100);
  END IF;
END $$;