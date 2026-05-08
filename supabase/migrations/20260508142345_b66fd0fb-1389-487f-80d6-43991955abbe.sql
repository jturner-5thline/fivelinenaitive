
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.master_lenders ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.deal_lenders ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_seeding boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notifications_opted_in boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notifications_consent_shown boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_company_seeding(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_seeding FROM public.companies WHERE id = _company_id), false)
$$;

CREATE OR REPLACE FUNCTION public.is_deal_notification_suppressed(_deal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.deals d
    LEFT JOIN public.companies c ON c.id = d.company_id
    WHERE d.id = _deal_id
      AND (
        COALESCE(c.is_seeding, false)
        OR d.status IN ('archived', 'on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
        OR d.stage  IN ('on-hold', 'on_hold', 'closed-won', 'closed_won', 'closed-lost', 'closed_lost')
        OR d.pipeline_id IN (
          SELECT dp.id FROM public.deal_pipelines dp
          WHERE lower(dp.name) LIKE '%in development%'
        )
      )
  )
$$;
