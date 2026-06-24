
-- Extend last_contact_at tracking to include email_cache (real Gmail sync table)
CREATE OR REPLACE FUNCTION public.trg_bump_contact_from_email_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.bump_contact_last_contact(
    ARRAY[NEW.from_email] || COALESCE(NEW.to_emails, ARRAY[]::text[]) || COALESCE(NEW.cc_emails, ARRAY[]::text[]),
    COALESCE(NEW.received_at, NEW.created_at));
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS bump_contact_email_cache ON public.email_cache;
CREATE TRIGGER bump_contact_email_cache
AFTER INSERT ON public.email_cache
FOR EACH ROW EXECUTE FUNCTION public.trg_bump_contact_from_email_cache();

-- Backfill last_contact_at from email_cache
WITH activity AS (
  SELECT lower(email) AS email, MAX(ts) AS ts FROM (
    SELECT unnest(ARRAY[from_email] || COALESCE(to_emails, ARRAY[]::text[]) || COALESCE(cc_emails, ARRAY[]::text[])) AS email,
           COALESCE(received_at, created_at) AS ts
    FROM public.email_cache
  ) x WHERE email IS NOT NULL AND email <> '' GROUP BY lower(email)
)
UPDATE public.contacts c
SET last_contact_at = GREATEST(COALESCE(c.last_contact_at, 'epoch'::timestamptz), a.ts)
FROM activity a
WHERE lower(c.email) = a.email
  AND (c.last_contact_at IS NULL OR a.ts > c.last_contact_at);
