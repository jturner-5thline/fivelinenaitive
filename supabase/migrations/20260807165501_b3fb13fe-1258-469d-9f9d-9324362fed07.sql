-- 1. email_priority_signal_log: scope INSERT to deals the caller can access
DROP POLICY IF EXISTS "Authenticated users can record priority signals" ON public.email_priority_signal_log;
CREATE POLICY "Users can record priority signals on accessible deals"
ON public.email_priority_signal_log
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (detected_by IS NULL OR detected_by = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = email_priority_signal_log.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.company_id IS NOT NULL AND public.is_company_member(auth.uid(), d.company_id))
      )
  )
);

-- 2. naitive_pipeline_audit: only 5th Line internal members may write audit rows
DROP POLICY IF EXISTS "Authenticated users can insert audit entries" ON public.naitive_pipeline_audit;
CREATE POLICY "Internal members can insert audit entries"
ON public.naitive_pipeline_audit
FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.is_company_member(auth.uid(), '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid)
);

-- 3. waitlist: DB-layer abuse throttle + dedupe for anonymous signups
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_uniq ON public.waitlist (lower(email));
CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON public.waitlist (created_at DESC);

CREATE OR REPLACE FUNCTION public.waitlist_throttle_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.waitlist
  WHERE created_at > now() - interval '1 minute';

  IF recent_count >= 20 THEN
    RAISE EXCEPTION 'Too many waitlist signups right now, please try again shortly'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS waitlist_throttle_inserts_trg ON public.waitlist;
CREATE TRIGGER waitlist_throttle_inserts_trg
BEFORE INSERT ON public.waitlist
FOR EACH ROW EXECUTE FUNCTION public.waitlist_throttle_inserts();