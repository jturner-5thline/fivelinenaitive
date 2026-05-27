CREATE TABLE IF NOT EXISTS public._deals_finserv_backup_20260527 AS
SELECT * FROM public.deals
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND pipeline_id IS NULL
  AND stage LIKE 'fs-%';

GRANT ALL ON public._deals_finserv_backup_20260527 TO service_role;
ALTER TABLE public._deals_finserv_backup_20260527 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access" ON public._deals_finserv_backup_20260527 FOR SELECT USING (false);