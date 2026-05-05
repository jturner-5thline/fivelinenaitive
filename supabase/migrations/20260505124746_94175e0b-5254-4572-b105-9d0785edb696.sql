-- Drop the overly broad SELECT policy on claap_meeting_participants that
-- exposed all participants (incl. names/emails) to any authenticated user.
-- The company-scoped policy "Users can view meeting participants in their company"
-- remains and continues to grant correct access.
DROP POLICY IF EXISTS "Users can view participants of accessible meetings" ON public.claap_meeting_participants;