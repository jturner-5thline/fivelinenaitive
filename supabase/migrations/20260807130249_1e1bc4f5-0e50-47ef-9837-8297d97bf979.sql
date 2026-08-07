ALTER TABLE public.claap_recording_links
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.claap_recording_links DROP CONSTRAINT IF EXISTS claap_recording_links_review_status_check;
ALTER TABLE public.claap_recording_links ADD CONSTRAINT claap_recording_links_review_status_check
  CHECK (review_status = ANY (ARRAY['pending','confirmed','rejected']));

UPDATE public.claap_recording_links
   SET review_status = 'confirmed'
 WHERE source <> 'auto' AND review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_claap_links_review
  ON public.claap_recording_links (link_role, review_status);

DROP POLICY IF EXISTS "Members review links in their org" ON public.claap_recording_links;
CREATE POLICY "Members review links in their org"
ON public.claap_recording_links
FOR UPDATE
TO authenticated
USING (recording_id IN (
  SELECT r.id FROM claap_recordings r
  WHERE r.org_company_id IN (
    SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid()
  )
))
WITH CHECK (recording_id IN (
  SELECT r.id FROM claap_recordings r
  WHERE r.org_company_id IN (
    SELECT cm.company_id FROM company_members cm WHERE cm.user_id = auth.uid()
  )
));

GRANT UPDATE ON public.claap_recording_links TO authenticated;