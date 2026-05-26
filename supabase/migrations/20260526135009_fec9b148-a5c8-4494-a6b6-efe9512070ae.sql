
CREATE OR REPLACE FUNCTION public.reset_demo_ai_chats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
  caller_id uuid;
  removed integer := 0;
  rc integer;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT lower(email) INTO caller_email FROM auth.users WHERE id = caller_id;

  IF caller_email IS DISTINCT FROM 'demo@5thline.co' THEN
    -- No-op for any non-demo user. Do not raise — keeps client call safe.
    RETURN 0;
  END IF;

  -- Deal-space conversations + cascading messages
  WITH del AS (
    DELETE FROM public.deal_space_conversations
    WHERE user_id = caller_id
    RETURNING 1
  )
  SELECT count(*) INTO rc FROM del;
  removed := removed + COALESCE(rc, 0);

  -- Orphaned deal-space messages tied to the demo user's prior conversations
  -- (cascade above should cover, but belt-and-suspenders).
  WITH del AS (
    DELETE FROM public.deal_space_messages m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.deal_space_conversations c WHERE c.id = m.conversation_id
    )
    RETURNING 1
  )
  SELECT count(*) INTO rc FROM del;
  removed := removed + COALESCE(rc, 0);

  -- Dashboard / Ask-anything chats
  WITH del AS (
    DELETE FROM public.chat_conversations
    WHERE user_id = caller_id
    RETURNING 1
  )
  SELECT count(*) INTO rc FROM del;
  removed := removed + COALESCE(rc, 0);

  -- Copilot conversations (messages stored as JSON column on the row)
  WITH del AS (
    DELETE FROM public.copilot_conversations
    WHERE user_id = caller_id
    RETURNING 1
  )
  SELECT count(*) INTO rc FROM del;
  removed := removed + COALESCE(rc, 0);

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_demo_ai_chats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_demo_ai_chats() TO authenticated;
