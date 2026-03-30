-- Create exec_sql function for dynamic DDL from edge functions (service role only)
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- Revoke from public/anon, only service_role can call
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;

-- Read-only version for introspection
CREATE OR REPLACE FUNCTION public.exec_sql_readonly(sql text)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY EXECUTE sql;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql_readonly(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql_readonly(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql_readonly(text) FROM authenticated;