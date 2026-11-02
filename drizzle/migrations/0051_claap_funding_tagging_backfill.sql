ALTER TABLE public.claap_recordings ADD COLUMN IF NOT EXISTS transcript_text text;
CREATE TABLE public.claap_funding_backfill_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, created_by uuid,
 window_start timestamptz NOT NULL DEFAULT (now() - interval '4 years'), window_end timestamptz NOT NULL DEFAULT now(),
 phase text NOT NULL DEFAULT 'discovery', status text NOT NULL DEFAULT 'paused', cursor text,
 scanned integer NOT NULL DEFAULT 0, imported integer NOT NULL DEFAULT 0, hydrated integer NOT NULL DEFAULT 0,
 linked integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 next_run_at timestamptz, lease_until timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id)
);
GRANT SELECT ON public.claap_funding_backfill_jobs TO authenticated;
GRANT ALL ON public.claap_funding_backfill_jobs TO service_role;
ALTER TABLE public.claap_funding_backfill_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_read ON public.claap_funding_backfill_jobs FOR SELECT TO authenticated USING (EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=claap_funding_backfill_jobs.company_id AND m.user_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.claap_funding_attendee_emails(p_id uuid)
RETURNS TABLE(email text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT DISTINCT lower(trim(p->>'email')) FROM public.claap_recordings r,
 LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.participants)='array' THEN r.participants ELSE '[]'::jsonb END) p
 WHERE r.id=p_id AND coalesce(p->>'email','') LIKE '%@%'
 UNION
 SELECT lower(trim(mp.email)) FROM public.claap_recordings r
 JOIN public.claap_recording_links l ON l.recording_id=r.id AND l.entity_type='meeting' AND l.review_status <> 'rejected'
 JOIN public.claap_meetings m ON m.id=l.entity_id AND m.company_id=r.org_company_id
 JOIN public.claap_meeting_participants mp ON mp.meeting_id=m.id WHERE r.id=p_id AND coalesce(mp.email,'') LIKE '%@%'
 UNION
 SELECT lower(trim(a)) FROM public.claap_recordings r JOIN public.calendar_events e
 ON NOT e.is_cancelled AND abs(extract(epoch FROM (e.start_time-r.started_at))) <= 900
 AND public.claap_norm_org_name(e.title)=public.claap_norm_org_name(r.title)
 AND EXISTS(SELECT 1 FROM public.company_members cm WHERE cm.user_id=e.user_id AND cm.company_id=r.org_company_id),
 LATERAL unnest(e.attendees) a WHERE r.id=p_id AND a LIKE '%@%'
$$;
REVOKE ALL ON FUNCTION public.claap_funding_attendee_emails(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claap_funding_attendee_emails(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claap_link_recording_contacts(p_recording_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 WITH rec AS (SELECT id,org_company_id FROM public.claap_recordings WHERE (p_recording_id IS NULL OR id=p_recording_id)
 AND (auth.role()='service_role' OR auth.uid() IS NULL OR EXISTS(SELECT 1 FROM public.company_members m WHERE m.user_id=auth.uid() AND m.company_id=org_company_id))),
 matches AS (SELECT r.id,c.id AS contact_id FROM rec r CROSS JOIN LATERAL public.claap_funding_attendee_emails(r.id) e
 JOIN public.contacts c ON lower(trim(c.email))=e.email AND coalesce(c.org_company_id,c.company_id)=r.org_company_id),
 ins AS (INSERT INTO public.claap_recording_links(recording_id,entity_type,entity_id,link_role,source,confidence,review_status)
 SELECT DISTINCT id,'contact',contact_id,'attendee_contact','auto',1,'confirmed' FROM matches
 ON CONFLICT(recording_id,link_role,entity_id) DO NOTHING RETURNING 1) SELECT count(*) INTO n FROM ins;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.claap_link_recording_funding_sources(p_recording_id uuid DEFAULT NULL,p_limit integer DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 WITH rec AS (SELECT id,org_company_id,title FROM public.claap_recordings WHERE (p_recording_id IS NULL OR id=p_recording_id)
 AND (auth.role()='service_role' OR auth.uid() IS NULL OR EXISTS(SELECT 1 FROM public.company_members m WHERE m.user_id=auth.uid() AND m.company_id=org_company_id)) ORDER BY started_at DESC NULLS LAST LIMIT least(coalesce(p_limit,1000),1000)),
 emails AS (SELECT r.id,r.org_company_id,e.email FROM rec r CROSS JOIN LATERAL public.claap_funding_attendee_emails(r.id) e),
 exact_matches AS (SELECT DISTINCT e.id,l.id AS lender_id,1::numeric AS confidence FROM emails e JOIN public.lender_contacts lc ON lower(trim(lc.email))=e.email
 JOIN public.master_lenders l ON l.id=lc.lender_id AND l.company_id=e.org_company_id
 UNION SELECT DISTINCT e.id,l.id,1::numeric FROM emails e JOIN public.master_lenders l ON lower(trim(l.email))=e.email AND l.company_id=e.org_company_id),
 domains AS (SELECT l.id,l.company_id,lower(split_part(trim(l.email),'@',2)) AS domain FROM public.master_lenders l
 UNION SELECT l.id,l.company_id,split_part(regexp_replace(lower(trim(l.website)),'^https?://(www\.)?|^www\.','','i'),'/',1) FROM public.master_lenders l
 UNION SELECT l.id,l.company_id,lower(split_part(trim(lc.email),'@',2)) FROM public.master_lenders l JOIN public.lender_contacts lc ON lc.lender_id=l.id),
 domain_matches AS (SELECT DISTINCT e.id,d.id AS lender_id,0.95::numeric AS confidence FROM emails e JOIN domains d ON d.company_id=e.org_company_id AND d.domain=split_part(e.email,'@',2)
 WHERE d.domain LIKE '%.%' AND d.domain NOT IN ('gmail.com','gmai.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','me.com','msn.com','live.com','protonmail.com','proton.me','gmx.com','comcast.net')
 AND NOT EXISTS(SELECT 1 FROM public.claap_integration_config cfg,LATERAL unnest(cfg.internal_domains) dom WHERE cfg.company_id=e.org_company_id AND lower(dom)=d.domain)),
 names AS (SELECT r.id,l.id AS lender_id,0.7::numeric AS confidence FROM rec r JOIN public.master_lenders l ON l.company_id=r.org_company_id
 AND length(public.claap_norm_org_name(l.name))>=5 AND strpos(' '||public.claap_norm_org_name(r.title)||' ',' '||public.claap_norm_org_name(l.name)||' ')>0),
 all_matches AS (SELECT id,lender_id,max(confidence) AS confidence FROM (SELECT * FROM exact_matches UNION ALL SELECT * FROM domain_matches UNION ALL SELECT * FROM names) x GROUP BY id,lender_id),
 ins AS (INSERT INTO public.claap_recording_links(recording_id,entity_type,entity_id,link_role,confidence,source,review_status)
 SELECT id,'lender',lender_id,'funding_source',confidence,'auto',CASE WHEN confidence=1 THEN 'confirmed' ELSE 'pending' END FROM all_matches
 ON CONFLICT(recording_id,link_role,entity_id) DO NOTHING RETURNING 1) SELECT count(*) INTO n FROM ins;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.claap_link_recording_contacts(uuid),public.claap_link_recording_funding_sources(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claap_link_recording_contacts(uuid),public.claap_link_recording_funding_sources(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.trg_claap_link_recording_contacts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
 IF TG_TABLE_NAME='claap_recordings' THEN rid:=NEW.id;
 ELSIF TG_TABLE_NAME='claap_recording_links' THEN rid:=NEW.recording_id;
 ELSE
 FOR rid IN SELECT l.recording_id FROM public.claap_recording_links l JOIN public.claap_recordings r ON r.id=l.recording_id JOIN public.claap_meetings m ON m.id=l.entity_id AND m.company_id=r.org_company_id WHERE l.entity_type='meeting' AND l.entity_id=NEW.meeting_id AND l.review_status <> 'rejected' LOOP
 PERFORM public.claap_link_recording_contacts(rid); PERFORM public.claap_link_recording_funding_sources(rid,1);
 END LOOP; RETURN NEW;
 END IF;
 PERFORM public.claap_link_recording_contacts(rid);
 IF TG_TABLE_NAME <> 'claap_recordings' THEN PERFORM public.claap_link_recording_funding_sources(rid,1); END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.claap_funding_calendar_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
 FOR rid IN SELECT r.id FROM public.claap_recordings r WHERE NOT NEW.is_cancelled AND abs(extract(epoch FROM (NEW.start_time-r.started_at)))<=900 AND public.claap_norm_org_name(NEW.title)=public.claap_norm_org_name(r.title) AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.user_id=NEW.user_id AND m.company_id=r.org_company_id) LOOP
 PERFORM public.claap_link_recording_contacts(rid); PERFORM public.claap_link_recording_funding_sources(rid,1);
 END LOOP; RETURN NEW;
END $$;
CREATE TRIGGER claap_funding_calendar_link AFTER INSERT OR UPDATE OF attendees,title,start_time ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.claap_funding_calendar_changed();
CREATE INDEX IF NOT EXISTS claap_recordings_org_started_idx ON public.claap_recordings(org_company_id,started_at);
CREATE INDEX IF NOT EXISTS lender_contacts_email_lower_idx ON public.lender_contacts(lower(trim(email)));
