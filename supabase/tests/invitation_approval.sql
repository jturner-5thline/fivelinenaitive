-- Run ONLY against a disposable local database:
-- psql -X -v ON_ERROR_STOP=1 <local-connection> -f supabase/tests/invitation_approval.sql
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id', true), '')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, approved_at timestamptz, approved_by uuid, suspended_at timestamptz);
CREATE TABLE public.companies (id uuid PRIMARY KEY, suspended_at timestamptz, archived_at timestamptz);
CREATE TABLE public.company_members (company_id uuid, user_id uuid, role text, UNIQUE(company_id,user_id));
CREATE TABLE public.company_invitations (id uuid PRIMARY KEY, token uuid UNIQUE, company_id uuid, email text, role text, invited_by uuid, expires_at timestamptz, accepted_at timestamptz);
CREATE TABLE public.admin_audit_logs (target_id uuid, action_type text);
CREATE FUNCTION public.is_user_approved(_user_id uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id=_user_id AND approved_at IS NOT NULL) $$;
\ir ../../drizzle/migrations/0039_trusted_company_invitation_acceptance.sql

CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %', label; END $$;
CREATE FUNCTION public.test_denied(token uuid, expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean := false;
BEGIN
  BEGIN PERFORM public.accept_company_invitation(token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE; END IF;
    denied := true;
  END;
  PERFORM test_assert(denied, expected);
END $$;

DO $$
#variable_conflict use_variable
DECLARE
  inviter uuid := '00000000-0000-0000-0000-000000000001';
  invitee uuid := '00000000-0000-0000-0000-000000000002';
  stranger uuid := '00000000-0000-0000-0000-000000000003';
  company uuid := '00000000-0000-0000-0000-000000000010';
  other_company uuid := '00000000-0000-0000-0000-000000000011';
  token uuid := '00000000-0000-0000-0000-000000000100';
BEGIN
  INSERT INTO auth.users VALUES (inviter,'inviter@example.org',now()),(invitee,'invitee@example.org',now()),(stranger,'stranger@example.org',now());
  INSERT INTO profiles VALUES (inviter,now(),NULL,NULL),(invitee,NULL,NULL,NULL),(stranger,NULL,NULL,NULL);
  INSERT INTO companies(id) VALUES(company),(other_company);
  INSERT INTO company_members VALUES(company,inviter,'owner');
  INSERT INTO company_invitations VALUES(token,token,company,'INVITEE@example.org','member',inviter,now()+interval '1 day',NULL);
  PERFORM test_assert(NOT is_user_approved(invitee),'self-signup remains unapproved');
  PERFORM set_config('test.user_id','',false);
  PERFORM test_denied(token,'Sign in');
  PERFORM set_config('test.user_id',stranger::text,false);
  PERFORM test_denied(token,'email address');
  PERFORM set_config('test.user_id',invitee::text,false);
  PERFORM test_denied('00000000-0000-0000-0000-000000000999','Invalid invitation');
  UPDATE auth.users SET email_confirmed_at=NULL WHERE id=invitee;
  PERFORM test_denied(token,'Verify your email');
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=invitee;
  UPDATE company_invitations SET expires_at=now()-interval '1 day';
  PERFORM test_denied(token,'expired');
  UPDATE company_invitations SET expires_at=now()+interval '1 day',company_id=other_company;
  PERFORM test_denied(token,'no longer authorized');
  UPDATE company_invitations SET company_id=company;
  UPDATE profiles SET approved_at=NULL WHERE user_id=inviter;
  PERFORM test_denied(token,'no longer authorized');
  UPDATE profiles SET approved_at=now() WHERE user_id=inviter;
  UPDATE companies SET suspended_at=now() WHERE id=company;
  PERFORM test_denied(token,'no longer authorized');
  UPDATE companies SET suspended_at=NULL WHERE id=company;
  INSERT INTO admin_audit_logs VALUES(invitee,'user_approval_revoked');
  PERFORM test_denied(token,'Administrator approval');
  DELETE FROM admin_audit_logs WHERE target_id=invitee;
  PERFORM test_assert(NOT EXISTS(SELECT 1 FROM company_members WHERE user_id=invitee),'denials never create membership');
  PERFORM test_assert(NOT is_user_approved(invitee),'denials never grant approval');
  -- Repair a membership inserted by the old partial-success path, retaining its role.
  INSERT INTO company_members VALUES(company,invitee,'admin');
  PERFORM accept_company_invitation(token);
  PERFORM test_assert(is_user_approved(invitee),'invited teammate approved');
  PERFORM test_assert((SELECT approved_by=inviter FROM profiles WHERE user_id=invitee),'approval attributed to inviter');
  PERFORM test_assert((SELECT role='admin' FROM company_members WHERE user_id=invitee),'existing role retained');
  PERFORM test_assert((SELECT accepted_by=invitee AND accepted_at IS NOT NULL FROM company_invitations WHERE id=token),'invitation consumed by recipient');
  PERFORM accept_company_invitation(token);
  PERFORM test_assert((SELECT count(*)=1 FROM company_members WHERE user_id=invitee),'repeat acceptance is idempotent');
  PERFORM set_config('test.user_id',stranger::text,false);
  PERFORM test_denied(token,'already been accepted');
  -- Link invitations remain token-based and cannot be reused by another account.
  UPDATE company_invitations SET accepted_at=NULL, accepted_by=NULL, email='link-invite-example@placeholder.local';
  PERFORM accept_company_invitation(token);
  PERFORM test_assert(is_user_approved(stranger),'valid token link invite approved');
  PERFORM set_config('test.user_id',invitee::text,false);
  PERFORM test_denied(token,'already been accepted');
  UPDATE profiles SET approved_at=NULL WHERE user_id=invitee;
  INSERT INTO admin_audit_logs VALUES(invitee,'user_approval_revoked');
  PERFORM test_denied(token,'Administrator approval');
  PERFORM test_assert(NOT is_user_approved(invitee),'revocation is preserved');
  PERFORM test_assert(NOT has_function_privilege('anon','accept_company_invitation(uuid)','EXECUTE'),'anonymous cannot execute acceptance');
  PERFORM test_assert(has_function_privilege('authenticated','accept_company_invitation(uuid)','EXECUTE'),'authenticated can execute acceptance');
END $$;