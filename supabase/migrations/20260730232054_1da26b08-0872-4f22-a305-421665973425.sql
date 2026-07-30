-- 1. Drop unassigned duplicates, keeping the most recently updated row per recording
DELETE FROM public.claap_recordings a
USING public.claap_recordings b
WHERE a.org_company_id IS NULL
  AND b.org_company_id IS NULL
  AND a.external_id = b.external_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

-- 2. Drop unassigned rows that already exist under the 5th Line workspace
DELETE FROM public.claap_recordings a
WHERE a.org_company_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.claap_recordings b
    WHERE b.org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
      AND b.external_id = a.external_id
  );

-- 3. Assign the remaining orphans to the 5th Line workspace
UPDATE public.claap_recordings
SET org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
WHERE org_company_id IS NULL
  AND lower(split_part(organizer_email, '@', 2)) = '5thline.co';