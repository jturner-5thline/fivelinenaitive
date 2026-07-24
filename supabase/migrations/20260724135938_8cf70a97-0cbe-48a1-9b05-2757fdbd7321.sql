
CREATE TABLE public.partner_tier_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  from_tier smallint,
  to_tier smallint NOT NULL,
  source text NOT NULL CHECK (source IN ('auto','manual_override','override_cleared')),
  reason text,
  thresholds jsonb,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.partner_tier_history TO authenticated;
GRANT ALL ON public.partner_tier_history TO service_role;

ALTER TABLE public.partner_tier_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read partner tier history"
  ON public.partner_tier_history
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "members insert partner tier history"
  ON public.partner_tier_history
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE INDEX partner_tier_history_partner_created_idx
  ON public.partner_tier_history(partner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_partner_tier(
  _partner_id uuid,
  _to_tier smallint,
  _source text,
  _reason text,
  _thresholds jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _last_tier smallint;
  _row_id uuid;
  _email text;
BEGIN
  IF _source NOT IN ('auto','manual_override','override_cleared') THEN
    RAISE EXCEPTION 'Invalid source: %', _source;
  END IF;

  SELECT company_id INTO _company_id FROM public.partners WHERE id = _partner_id;
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Partner not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = auth.uid() AND company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  SELECT to_tier INTO _last_tier
  FROM public.partner_tier_history
  WHERE partner_id = _partner_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF _source = 'auto' AND _last_tier IS NOT DISTINCT FROM _to_tier THEN
    RETURN NULL;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.partner_tier_history (
    company_id, partner_id, from_tier, to_tier, source, reason, thresholds, changed_by, changed_by_email
  ) VALUES (
    _company_id, _partner_id, _last_tier, _to_tier, _source, _reason, _thresholds, auth.uid(), _email
  ) RETURNING id INTO _row_id;

  RETURN _row_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_partner_tier(uuid, smallint, text, text, jsonb) TO authenticated;
