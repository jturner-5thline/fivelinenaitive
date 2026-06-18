
-- Make the AI Approval Queue shared across 5th Line members so every
-- internal user sees the same items (jturner and nheikali should have
-- parity). Inserts remain self-owned; reads / edits / dismisses span
-- the org. Non–5th Line users are unaffected (still self-only via the
-- can_use_approval_queue gate, which returns false for them).

DROP POLICY IF EXISTS "Queue: select gated" ON public.ai_action_queue;
DROP POLICY IF EXISTS "Queue: update gated" ON public.ai_action_queue;
DROP POLICY IF EXISTS "Queue: delete gated" ON public.ai_action_queue;

CREATE POLICY "Queue: select gated"
  ON public.ai_action_queue FOR SELECT
  USING (
    public.can_use_approval_queue(auth.uid())
    AND (
      auth.uid() = user_id
      OR public.can_use_approval_queue(user_id)
    )
  );

CREATE POLICY "Queue: update gated"
  ON public.ai_action_queue FOR UPDATE
  USING (
    public.can_use_approval_queue(auth.uid())
    AND (
      auth.uid() = user_id
      OR public.can_use_approval_queue(user_id)
    )
  );

CREATE POLICY "Queue: delete gated"
  ON public.ai_action_queue FOR DELETE
  USING (
    public.can_use_approval_queue(auth.uid())
    AND (
      auth.uid() = user_id
      OR public.can_use_approval_queue(user_id)
    )
  );
