-- Fix 1: claap_meeting_participants - scope SELECT to user's company
DROP POLICY IF EXISTS "Users can view meeting participants" ON public.claap_meeting_participants;

CREATE POLICY "Users can view meeting participants in their company"
ON public.claap_meeting_participants
FOR SELECT
TO authenticated
USING (
  meeting_id IN (
    SELECT cm.id FROM public.claap_meetings cm
    WHERE cm.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  )
);

-- Fix 2: vdr-files storage bucket - add path-based ownership checks
-- The path format is: {deal_id}/...
-- We verify the user is a member of the company that owns the deal

DROP POLICY IF EXISTS "Authenticated users can read VDR files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload VDR files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update VDR files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete VDR files" ON storage.objects;

-- Also try alternate naming patterns
DROP POLICY IF EXISTS "Allow authenticated read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;

-- VDR files SELECT: user must be member of the deal's company
CREATE POLICY "VDR files read - company members only"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vdr-files'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = (string_to_array(name, '/'))[1]::uuid
      AND cm.user_id = auth.uid()
  )
);

-- VDR files INSERT: user must be member of the deal's company
CREATE POLICY "VDR files upload - company members only"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vdr-files'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = (string_to_array(name, '/'))[1]::uuid
      AND cm.user_id = auth.uid()
  )
);

-- VDR files UPDATE: user must be member of the deal's company
CREATE POLICY "VDR files update - company members only"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'vdr-files'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = (string_to_array(name, '/'))[1]::uuid
      AND cm.user_id = auth.uid()
  )
);

-- VDR files DELETE: user must be member of the deal's company
CREATE POLICY "VDR files delete - company members only"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'vdr-files'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = (string_to_array(name, '/'))[1]::uuid
      AND cm.user_id = auth.uid()
  )
);