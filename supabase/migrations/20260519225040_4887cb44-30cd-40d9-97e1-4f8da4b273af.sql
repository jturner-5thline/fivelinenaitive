
DO $$ BEGIN
  CREATE TYPE public.deal_access_request_status AS ENUM ('pending', 'approved', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.deal_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_email text NOT NULL,
  requester_name text,
  message text,
  status public.deal_access_request_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_access_requests_deal ON public.deal_access_requests(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_access_requests_status ON public.deal_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_deal_access_requests_requester ON public.deal_access_requests(requester_user_id);

ALTER TABLE public.deal_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can create access requests" ON public.deal_access_requests;
CREATE POLICY "Authenticated can create access requests"
ON public.deal_access_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "View access requests" ON public.deal_access_requests;
CREATE POLICY "View access requests"
ON public.deal_access_requests
FOR SELECT
TO authenticated
USING (
  requester_user_id = auth.uid()
  OR is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_access_requests.deal_id
      AND (
        CASE
          WHEN get_user_company_id(auth.uid()) IS NOT NULL
            THEN (d.company_id = get_user_company_id(auth.uid()) OR is_same_company_as_user(auth.uid(), d.user_id))
          ELSE d.user_id = auth.uid()
        END
      )
  )
);

DROP POLICY IF EXISTS "Update access requests" ON public.deal_access_requests;
CREATE POLICY "Update access requests"
ON public.deal_access_requests
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_access_requests.deal_id
      AND (
        CASE
          WHEN get_user_company_id(auth.uid()) IS NOT NULL
            THEN (d.company_id = get_user_company_id(auth.uid()) OR is_same_company_as_user(auth.uid(), d.user_id))
          ELSE d.user_id = auth.uid()
        END
      )
  )
);

DROP TRIGGER IF EXISTS trg_deal_access_requests_updated_at ON public.deal_access_requests;
CREATE TRIGGER trg_deal_access_requests_updated_at
BEFORE UPDATE ON public.deal_access_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
