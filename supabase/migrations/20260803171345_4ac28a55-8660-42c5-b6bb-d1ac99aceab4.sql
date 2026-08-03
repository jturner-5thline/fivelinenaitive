-- Topic-scope the realtime.messages policies so a user can only join / write
-- channels belonging to one of their companies (or to themselves).
--
-- Naming convention enforced going forward:
--   company:<company_id>:<entity>:<id>
--   user:<auth_uid>:<entity>
--
-- Nothing in the app breaks today: no channel is created with { private: true },
-- and Realtime only consults these policies for private channels.

DROP POLICY IF EXISTS "Company members can broadcast realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Company members can subscribe to realtime" ON realtime.messages;

CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      -- Own-user topics: user:<auth_uid>:...
      _topic LIKE 'user:' || auth.uid()::text || ':%'
      -- Workspace topics: company:<company_id>:...
      OR EXISTS (
        SELECT 1
        FROM public.company_members cm
        WHERE cm.user_id = auth.uid()
          AND _topic LIKE 'company:' || cm.company_id::text || ':%'
      )
    )
$$;

CREATE POLICY "Members can subscribe to their own scoped topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_topic_allowed(realtime.topic()));

CREATE POLICY "Members can broadcast to their own scoped topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.realtime_topic_allowed(realtime.topic()));