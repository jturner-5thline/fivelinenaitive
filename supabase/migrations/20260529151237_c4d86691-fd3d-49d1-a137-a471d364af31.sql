-- Add referral_source_contact_id FK on deals -> contacts(id), plus index and backfill.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS referral_source_contact_id uuid
  REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_referral_source_contact_id
  ON public.deals (referral_source_contact_id);

-- Idempotent backfill: for each deal with legacy referred_by text and no
-- referral_source_contact_id yet, match a contact within the same tenant by
-- normalized full name, or create one if none exists. Deals sharing the same
-- referral source name within a tenant map to the same contact.
DO $$
DECLARE
  rec RECORD;
  matched_id uuid;
  new_contact_id uuid;
  norm_name text;
  first_n text;
  last_n text;
  space_pos int;
BEGIN
  FOR rec IN
    SELECT DISTINCT d.company_id, btrim(d.referred_by) AS referred_by
    FROM public.deals d
    WHERE d.referred_by IS NOT NULL
      AND btrim(d.referred_by) <> ''
      AND d.referral_source_contact_id IS NULL
      AND d.company_id IS NOT NULL
  LOOP
    norm_name := lower(regexp_replace(rec.referred_by, '\s+', ' ', 'g'));

    -- Try to match an existing contact in the same tenant by normalized full name.
    SELECT c.id INTO matched_id
    FROM public.contacts c
    WHERE c.org_company_id = rec.company_id
      AND lower(regexp_replace(coalesce(c.full_name, ''), '\s+', ' ', 'g')) = norm_name
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF matched_id IS NULL THEN
      space_pos := position(' ' IN rec.referred_by);
      IF space_pos > 0 THEN
        first_n := btrim(substr(rec.referred_by, 1, space_pos - 1));
        last_n  := btrim(substr(rec.referred_by, space_pos + 1));
      ELSE
        first_n := rec.referred_by;
        last_n  := NULL;
      END IF;

      INSERT INTO public.contacts (org_company_id, first_name, last_name, lifecycle_stage, status, source_system)
      VALUES (rec.company_id, first_n, last_n, 'lead', 'new', 'referral_backfill')
      RETURNING id INTO new_contact_id;

      matched_id := new_contact_id;
    END IF;

    UPDATE public.deals
       SET referral_source_contact_id = matched_id
     WHERE company_id = rec.company_id
       AND btrim(referred_by) = rec.referred_by
       AND referral_source_contact_id IS NULL;
  END LOOP;
END $$;