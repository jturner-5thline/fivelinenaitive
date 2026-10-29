CREATE TABLE IF NOT EXISTS public.internal_function_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.internal_function_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.internal_function_secrets TO service_role;
ALTER TABLE public.internal_function_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.internal_function_secrets(name, secret)
VALUES ('internal_cron', encode(extensions.gen_random_bytes(32),'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.internal_function_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT secret FROM public.internal_function_secrets WHERE name='internal_cron'
$$;
REVOKE ALL ON FUNCTION public.internal_function_secret() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_internal_function_secret(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_secret IS NOT NULL AND length(p_secret) > 0 AND p_secret = public.internal_function_secret()
$$;
REVOKE ALL ON FUNCTION public.verify_internal_function_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_function_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public._inject_internal_header(src text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE out text := ''; rest text := src; h int; b int; seg text; c int; expr text;
BEGIN
  LOOP
    h := regexp_instr(rest, '\mheaders\s*:=', 1, 1, 1);
    EXIT WHEN h = 0;
    b := regexp_instr(rest, '\mbody\s*:=', h);
    EXIT WHEN b = 0;
    seg := substr(rest, h, b - h);
    c := length(seg) - strpos(reverse(seg), ',') + 1;
    expr := substr(seg, 1, c - 1);
    out := out || substr(rest, 1, h - 1) || ' (' || expr || ') || jsonb_build_object(''x-internal-cron-secret'', public.internal_function_secret())' || substr(seg, c);
    rest := substr(rest, b);
  END LOOP;
  RETURN out || rest;
END $$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT jobid, command FROM cron.job WHERE command LIKE '%functions/v1/%' AND command NOT LIKE '%internal_function_secret%' LOOP
    PERFORM cron.alter_job(r.jobid, command := public._inject_internal_header(r.command));
  END LOOP;
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosrc LIKE '%functions/v1/%' AND p.prosrc NOT LIKE '%internal_function_secret%' AND p.proname <> '_inject_internal_header' LOOP
    EXECUTE public._inject_internal_header(pg_get_functiondef(r.oid));
  END LOOP;
END $$;

DROP FUNCTION public._inject_internal_header(text);