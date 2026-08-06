CREATE TABLE public.claap_call_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_kind text NOT NULL CHECK (draft_kind IN ('qa','client_summary')),
  meeting_id text,
  recording_id text,
  call_key text NOT NULL,
  to_addr text NOT NULL DEFAULT '',
  cc_addr text NOT NULL DEFAULT '',
  bcc_addr text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, call_key, draft_kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claap_call_email_drafts TO authenticated;
GRANT ALL ON public.claap_call_email_drafts TO service_role;

ALTER TABLE public.claap_call_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own call email drafts"
ON public.claap_call_email_drafts FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER claap_call_email_drafts_updated_at
BEFORE UPDATE ON public.claap_call_email_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();