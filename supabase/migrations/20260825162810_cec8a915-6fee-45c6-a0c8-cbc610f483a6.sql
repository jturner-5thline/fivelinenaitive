CREATE TABLE public.referral_meeting_exclusions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meeting_id uuid not null,
  reason text,
  excluded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, meeting_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_meeting_exclusions TO authenticated;
GRANT ALL ON public.referral_meeting_exclusions TO service_role;

ALTER TABLE public.referral_meeting_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their workspace meeting exclusions"
ON public.referral_meeting_exclusions FOR SELECT TO authenticated
USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "Members can add meeting exclusions"
ON public.referral_meeting_exclusions FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "Members can update meeting exclusions"
ON public.referral_meeting_exclusions FOR UPDATE TO authenticated
USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE POLICY "Members can undo meeting exclusions"
ON public.referral_meeting_exclusions FOR DELETE TO authenticated
USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE TRIGGER update_referral_meeting_exclusions_updated_at
BEFORE UPDATE ON public.referral_meeting_exclusions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();