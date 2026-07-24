ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_types;
ALTER TABLE public.contacts REPLICA IDENTITY FULL;
ALTER TABLE public.contact_types REPLICA IDENTITY FULL;
ALTER TABLE public.company_settings REPLICA IDENTITY FULL;