
ALTER TABLE public.claap_recordings
  ADD COLUMN IF NOT EXISTS workspace_id text,
  ADD COLUMN IF NOT EXISTS workspace_name text;

ALTER TABLE public.claap_sync_errors
  ADD COLUMN IF NOT EXISTS workspace_id text;

CREATE INDEX IF NOT EXISTS idx_claap_recordings_workspace_id
  ON public.claap_recordings(workspace_id);

-- Backfill workspace_id from asset thumbnail URL pattern: /pub/w/<id>/
UPDATE public.claap_recordings
SET workspace_id = substring(source_payload->>'thumbnailUrl' from '/pub/w/([^/]+)/')
WHERE workspace_id IS NULL
  AND source_payload->>'thumbnailUrl' ~ '/pub/w/[^/]+/';

CREATE TABLE IF NOT EXISTS public.claap_sync_scope_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  token_workspace_id text,
  workspace_id text,
  workspace_name text,
  external_id text,
  in_scope boolean NOT NULL DEFAULT true,
  note text
);

GRANT SELECT ON public.claap_sync_scope_log TO authenticated;
GRANT ALL ON public.claap_sync_scope_log TO service_role;

ALTER TABLE public.claap_sync_scope_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated members read claap sync scope log"
  ON public.claap_sync_scope_log FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_claap_sync_scope_log_run_at
  ON public.claap_sync_scope_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_claap_sync_scope_log_workspace
  ON public.claap_sync_scope_log(workspace_id);
