-- Add full_name column to profiles for compatibility with code paths that
-- expect a single full_name field (alongside the existing display_name,
-- first_name, last_name). Backfill from existing fields. Idempotent.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text;

UPDATE public.profiles
SET full_name = COALESCE(
  NULLIF(full_name, ''),
  NULLIF(display_name, ''),
  NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''),
  email
)
WHERE full_name IS NULL OR full_name = '';