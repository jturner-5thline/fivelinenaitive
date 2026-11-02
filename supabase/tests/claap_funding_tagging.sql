-- Disposable database only; run with psql -v ON_ERROR_STOP=1.
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true) $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE company_members(company_id uuid,user_id uuid);
CREATE TABLE contacts(id uuid,org_company_id uuid,company_id uuid,email text);
CREATE TABLE master_lenders(id uuid,company_id uuid,email text,website text,name text);
CREATE TABLE lender_contacts(lender_id uuid,email text);
CREATE TABLE claap_recordings(id uuid PRIMARY KEY,org_company_id uuid,title text,participants jsonb,started_at timestamptz);
CREATE TABLE claap_recording_links(recording_id uuid,entity_type text,entity_id uuid,link_role text,source text,confidence numeric,review_status text,UNIQUE(recording_id,link_role,entity_id));
CREATE TABLE claap_meetings(id uuid,company_id uuid);
CREATE TABLE claap_meeting_participants(meeting_id uuid,email text);
CREATE TABLE calendar_events(user_id uuid,title text,start_time timestamptz,attendees text[],is_cancelled boolean);
CREATE TABLE claap_integration_config(company_id uuid,internal_domains text[]);
CREATE FUNCTION claap_norm_org_name(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(coalesce($1,'')) $$;
\ir ../../drizzle/migrations/0051_claap_funding_tagging_backfill.sql
SET test.role='service_role';
INSERT INTO company_members VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
INSERT INTO master_lenders VALUES
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','lender@firm.co',null,'Firm Lender'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','lender@firm.co',null,'Firm Lender'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','other@firm.co',null,'Other Lender'),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','nobody@gmail.com',null,'Personal Lender');
INSERT INTO contacts VALUES ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',null,'lender@firm.co'),('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',null,'lender@firm.co');
INSERT INTO claap_recordings VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Call','[{"email":"lender@firm.co"},{"email":"someone@gmail.com"}]',now());
SELECT claap_link_recording_contacts('30000000-0000-0000-0000-000000000001');
SELECT claap_link_recording_funding_sources('30000000-0000-0000-0000-000000000001',1);
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM claap_recording_links WHERE link_role='attendee_contact'), 'contact links must be tenant scoped';
 ASSERT (SELECT count(*)=1 FROM claap_recording_links WHERE link_role='funding_source' AND review_status='confirmed'), 'exact email confirms funding source';
 ASSERT (SELECT count(*)=1 FROM claap_recording_links WHERE review_status='pending'), 'domain-only match requires review';
 ASSERT NOT EXISTS(SELECT 1 FROM claap_recording_links WHERE entity_id IN ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004')), 'other tenant and free-email domain excluded';
END $$;
UPDATE claap_recording_links SET source='manual',review_status='rejected' WHERE entity_id='10000000-0000-0000-0000-000000000001';
SELECT claap_link_recording_funding_sources('30000000-0000-0000-0000-000000000001',1);
DO $$ BEGIN
 ASSERT (SELECT count(*)=3 FROM claap_recording_links), 'repeat matching is idempotent';
 ASSERT EXISTS(SELECT 1 FROM claap_recording_links WHERE source='manual' AND review_status='rejected'), 'manual rejection preserved';
END $$;
SET test.role='authenticated'; SET test.user_id='00000000-0000-0000-0000-000000000002';
TRUNCATE claap_recording_links;
SELECT claap_link_recording_contacts('30000000-0000-0000-0000-000000000001');
SELECT claap_link_recording_funding_sources('30000000-0000-0000-0000-000000000001',1);
DO $$ BEGIN ASSERT (SELECT count(*)=0 FROM claap_recording_links), 'nonmember cannot link another tenant'; END $$;
SELECT 'Claap funding tagging: 7 assertions passed' AS result;