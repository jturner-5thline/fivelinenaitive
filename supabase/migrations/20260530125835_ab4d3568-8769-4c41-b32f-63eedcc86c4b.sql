ALTER TABLE public.claap_recordings
  ADD COLUMN IF NOT EXISTS transcript_url text,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS chapters jsonb DEFAULT '[]'::jsonb;