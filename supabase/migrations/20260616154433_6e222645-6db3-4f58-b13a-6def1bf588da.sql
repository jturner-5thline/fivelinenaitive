
-- 1) Seed feature flag (idempotent)
INSERT INTO public.feature_flags (name, description, status, is_beta)
VALUES (
  'approval_queue_enabled',
  'Master toggle for the Approval Queue. When deployed, only 5th Line users can access the queue, related UI, and backing tables.',
  'disabled',
  false
)
ON CONFLICT (name) DO NOTHING;

-- 2) Helper: who may use the Approval Queue?
CREATE OR REPLACE FUNCTION public.can_use_approval_queue(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.feature_flags
      WHERE name = 'approval_queue_enabled'
        AND status = 'deployed'
    )
    AND EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = _user_id
        AND lower(u.email) LIKE '%@5thline.co'
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_use_approval_queue(uuid) TO authenticated, service_role;

-- 3) Replace ai_action_queue policies with feature-gated equivalents
DROP POLICY IF EXISTS "Users can view their own queued actions" ON public.ai_action_queue;
DROP POLICY IF EXISTS "Users can insert their own queued actions" ON public.ai_action_queue;
DROP POLICY IF EXISTS "Users can update their own queued actions" ON public.ai_action_queue;
DROP POLICY IF EXISTS "Users can delete their own queued actions" ON public.ai_action_queue;

CREATE POLICY "Queue: select gated"
  ON public.ai_action_queue FOR SELECT
  USING (auth.uid() = user_id AND public.can_use_approval_queue(auth.uid()));

CREATE POLICY "Queue: insert gated"
  ON public.ai_action_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.can_use_approval_queue(auth.uid()));

CREATE POLICY "Queue: update gated"
  ON public.ai_action_queue FOR UPDATE
  USING (auth.uid() = user_id AND public.can_use_approval_queue(auth.uid()));

CREATE POLICY "Queue: delete gated"
  ON public.ai_action_queue FOR DELETE
  USING (auth.uid() = user_id AND public.can_use_approval_queue(auth.uid()));

-- 4) Gate deal_access_requests behind the same flag (surface lives in the Approval Queue)
DROP POLICY IF EXISTS "Authenticated can create access requests" ON public.deal_access_requests;
DROP POLICY IF EXISTS "View access requests" ON public.deal_access_requests;
DROP POLICY IF EXISTS "Update access requests" ON public.deal_access_requests;

CREATE POLICY "Access requests: insert gated"
  ON public.deal_access_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_use_approval_queue(auth.uid())
    AND requester_user_id = auth.uid()
  );

CREATE POLICY "Access requests: select gated"
  ON public.deal_access_requests FOR SELECT
  TO authenticated
  USING (
    public.can_use_approval_queue(auth.uid())
    AND (
      requester_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.deals d
        WHERE d.id = deal_access_requests.deal_id
      )
    )
  );

CREATE POLICY "Access requests: update gated"
  ON public.deal_access_requests FOR UPDATE
  TO authenticated
  USING (
    public.can_use_approval_queue(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_access_requests.deal_id
    )
  );
