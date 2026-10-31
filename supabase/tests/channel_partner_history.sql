-- Run only in a disposable PostgreSQL database. Minimal application/auth fixture.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
CREATE FUNCTION public.get_user_company_ids(uuid) RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY[$1] $$;
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.channel_partners(id uuid PRIMARY KEY, company_id uuid REFERENCES public.companies(id), stage text, created_at timestamptz, created_by uuid, owner_user_id uuid);
GRANT SELECT ON public.channel_partners TO authenticated;
INSERT INTO public.companies VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO public.channel_partners VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','nurturing','2026-10-31T13:00:00Z',null,null);
\ir ../../drizzle/migrations/0045_channel_partner_activity_history.sql
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.channel_partner_history WHERE event_type = 'added' AND occurred_at = '2026-10-31T13:00:00Z' AND to_stage IS NULL), 'backfill must preserve only known creation date';
END $$;
INSERT INTO public.channel_partners VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','prospect',now(),null,null);
UPDATE public.channel_partners SET stage = 'trial' WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE public.channel_partners SET stage = 'trial' WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE public.channel_partners SET owner_user_id = '00000000-0000-0000-0000-000000000002' WHERE id = '10000000-0000-0000-0000-000000000002';
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.channel_partner_history WHERE event_type = 'added' AND to_stage = 'prospect'), 'insert must record starting stage';
  ASSERT (SELECT count(*) = 1 FROM public.channel_partner_history WHERE event_type = 'stage_changed' AND from_stage = 'prospect' AND to_stage = 'trial'), 'move must record exactly one transition';
  ASSERT (SELECT count(*) = 3 FROM public.channel_partner_history), 'no-op and owner changes must not add stage events';
END $$;
SET ROLE authenticated;
SET test.user_id = '00000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.channel_partner_history), 'member cannot read another team history';
  BEGIN
    INSERT INTO public.channel_partner_history(channel_partner_id,company_id,event_type) VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','added');
    RAISE EXCEPTION 'client forged history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.channel_partner_history SET to_stage = 'engaged';
    RAISE EXCEPTION 'client edited history';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET test.user_id = '00000000-0000-0000-0000-000000000003';
DO $$ BEGIN ASSERT (SELECT count(*) = 0 FROM public.channel_partner_history), 'nonmember cannot read history'; END $$;
RESET ROLE;
DO $$ BEGIN ASSERT NOT has_table_privilege('anon','public.channel_partner_history','SELECT'), 'anonymous cannot read history'; END $$;
SELECT 'Channel partner history: 9 assertions passed' AS result;