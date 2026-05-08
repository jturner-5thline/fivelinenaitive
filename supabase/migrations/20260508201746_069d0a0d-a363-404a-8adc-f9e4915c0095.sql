ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;

UPDATE public.profiles
SET full_name = NULLIF(BTRIM(CONCAT_WS(' ', first_name, last_name)), '')
WHERE full_name IS NULL
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

UPDATE public.profiles
SET full_name = display_name
WHERE full_name IS NULL
  AND display_name IS NOT NULL;