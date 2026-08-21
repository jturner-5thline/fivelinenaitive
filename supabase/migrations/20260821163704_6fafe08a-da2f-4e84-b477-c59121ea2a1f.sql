CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
GRANT USAGE ON SCHEMA archive TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_deals_finserv_backup_20260527') THEN
    EXECUTE 'DROP POLICY IF EXISTS "no client access" ON public._deals_finserv_backup_20260527';
    EXECUTE 'ALTER TABLE public._deals_finserv_backup_20260527 SET SCHEMA archive';
    EXECUTE 'REVOKE ALL ON archive._deals_finserv_backup_20260527 FROM anon, authenticated, PUBLIC';
    EXECUTE 'GRANT ALL ON archive._deals_finserv_backup_20260527 TO service_role';
  END IF;
END $$;