CREATE TABLE public.harvest_sync_state (
 company_id uuid PRIMARY KEY REFERENCES public.companies(id),
 account_id text NOT NULL DEFAULT '1772323',
 active_run uuid,
 pending_run uuid,
 next_page integer NOT NULL DEFAULT 1,
 sync_through date,
 last_synced_at timestamptz,
 total_entries integer NOT NULL DEFAULT 0,
 last_error text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.harvest_sync_state TO authenticated;
GRANT ALL ON public.harvest_sync_state TO service_role;
ALTER TABLE public.harvest_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_state_members ON public.harvest_sync_state FOR SELECT TO authenticated USING (company_id='44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=harvest_sync_state.company_id AND m.user_id=(SELECT auth.uid())));
CREATE TABLE public.harvest_time_entries (
 company_id uuid NOT NULL REFERENCES public.companies(id),
 sync_run uuid NOT NULL,
 harvest_id bigint NOT NULL,
 spent_date date NOT NULL,
 hours numeric NOT NULL,
 billable boolean NOT NULL,
 billable_rate numeric,
 currency text,
 client_id bigint,
 client_name text,
 project_id bigint,
 project_name text,
 task_name text,
 user_id bigint,
 user_name text,
 notes text,
 PRIMARY KEY(company_id,sync_run,harvest_id)
);
GRANT SELECT ON public.harvest_time_entries TO authenticated;
GRANT ALL ON public.harvest_time_entries TO service_role;
ALTER TABLE public.harvest_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY harvest_entries_members ON public.harvest_time_entries FOR SELECT TO authenticated USING (company_id='44556c46-9127-4b12-b14e-d6fee784afcf'::uuid AND EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=harvest_time_entries.company_id AND m.user_id=(SELECT auth.uid())));
CREATE INDEX harvest_entries_dates ON public.harvest_time_entries(company_id,sync_run,spent_date);