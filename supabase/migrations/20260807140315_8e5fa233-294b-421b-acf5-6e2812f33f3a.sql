CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON public.contacts (lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_additional_emails_gin ON public.contacts USING gin (additional_emails);

CREATE OR REPLACE FUNCTION public.bump_contact_last_contact(_emails text[], _at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lowered text[];
BEGIN
  IF _at IS NULL OR _emails IS NULL OR array_length(_emails, 1) IS NULL THEN RETURN; END IF;
  SELECT array_agg(DISTINCT lower(e)) INTO lowered
  FROM unnest(_emails) AS e WHERE e IS NOT NULL AND length(trim(e)) > 0;
  IF lowered IS NULL THEN RETURN; END IF;

  UPDATE public.contacts c
  SET last_contact_at = _at
  WHERE c.id IN (
      SELECT c1.id FROM public.contacts c1 WHERE lower(c1.email) = ANY(lowered)
      UNION
      SELECT c2.id FROM public.contacts c2 WHERE c2.additional_emails && lowered
      UNION
      SELECT c3.id FROM public.contacts c3 WHERE c3.additional_emails && _emails
    )
    AND (c.last_contact_at IS NULL OR c.last_contact_at < _at);
END;
$$;