
ALTER TABLE public.claap_recordings
  ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS next_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_claap_recordings_sync_due
  ON public.claap_recordings (next_sync_at)
  WHERE summary IS NULL OR claap_summary_synced_at IS NULL;

CREATE TABLE IF NOT EXISTS public.claap_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id uuid REFERENCES public.claap_recordings(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.claap_meetings(id) ON DELETE SET NULL,
  recording_external_id text,
  org_company_id uuid,
  error_code text NOT NULL,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.claap_sync_errors TO authenticated;
GRANT ALL ON public.claap_sync_errors TO service_role;

ALTER TABLE public.claap_sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read claap_sync_errors in their org"
  ON public.claap_sync_errors
  FOR SELECT
  TO authenticated
  USING (
    org_company_id IS NULL
    OR org_company_id = ANY (public.get_user_company_ids(auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_claap_sync_errors_recording
  ON public.claap_sync_errors (recording_id, created_at DESC);
