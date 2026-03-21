-- Update handle_new_user to fire seed-sample-deal edge function on every new signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  clean_name TEXT;
  first TEXT;
  last TEXT;
  avatar TEXT;
BEGIN
  first := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'given_name'),
    TRIM(new.raw_user_meta_data ->> 'first_name'),
    SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)
  );
  
  last := COALESCE(
    TRIM(new.raw_user_meta_data ->> 'family_name'),
    TRIM(new.raw_user_meta_data ->> 'last_name'),
    NULLIF(TRIM(SUBSTRING(
      COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
      LENGTH(SPLIT_PART(COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)) + 2
    )), '')
  );
  
  avatar := COALESCE(
    new.raw_user_meta_data ->> 'picture',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  
  clean_name := COALESCE(
    NULLIF(TRIM(CONCAT(first, ' ', last)), ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'display_name',
    SPLIT_PART(new.email, '@', 1)
  );
  
  IF clean_name = '' OR clean_name IS NULL THEN
    clean_name := SPLIT_PART(new.email, '@', 1);
  END IF;
  
  clean_name := SUBSTRING(clean_name, 1, 100);
  first := SUBSTRING(first, 1, 50);
  last := SUBSTRING(last, 1, 50);
  
  INSERT INTO public.profiles (user_id, display_name, first_name, last_name, avatar_url, email)
  VALUES (new.id, clean_name, NULLIF(first, ''), NULLIF(last, ''), avatar, new.email);

  -- Fire edge function to seed sample deal for every new user (async)
  PERFORM net.http_post(
    url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/seed-sample-deal',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('user_id', new.id)
  );
  
  RETURN new;
END;
$$;