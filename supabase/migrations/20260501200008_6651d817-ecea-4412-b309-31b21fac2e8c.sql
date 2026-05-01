ALTER TABLE public.vdr_documents
  ADD COLUMN IF NOT EXISTS dataroom_folder_path TEXT;

COMMENT ON COLUMN public.vdr_documents.dataroom_folder_path IS
  'Optional Data Room folder location for a file shared to the Data Room. When NULL and shared_to_dataroom=true, the Data Room view falls back to folder_path. Tracked separately so Internal and Data Room can be reorganized independently after a file has been shared (copy/share semantics — Internal location is never affected by Data Room reorganization).';