CREATE OR REPLACE FUNCTION public.claap_assert_recording_link_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_user IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF auth.role()='authenticated' AND NOT EXISTS(SELECT 1 FROM public.claap_recordings r JOIN public.company_members m ON m.company_id=r.org_company_id WHERE r.id=NEW.recording_id AND m.user_id=auth.uid()) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER claap_assert_recording_link_access BEFORE INSERT ON public.claap_recording_links FOR EACH ROW EXECUTE FUNCTION public.claap_assert_recording_link_access();