
-- =============================================================
-- Deal Summary Email Preferences: Org defaults + User overrides
-- =============================================================

-- 1. Org-level notification defaults
-- Relates to the existing 'companies' table via company_id
CREATE TABLE public.org_notification_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  daily_deal_summary_enabled boolean NOT NULL DEFAULT false,
  daily_deal_summary_weekdays_only boolean NOT NULL DEFAULT true,
  daily_deal_summary_time_et time WITHOUT TIME ZONE,          -- e.g. '18:00'
  weekly_deal_summary_enabled boolean NOT NULL DEFAULT false,
  weekly_deal_summary_day_et text CHECK (weekly_deal_summary_day_et IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  weekly_deal_summary_time_et time WITHOUT TIME ZONE,          -- e.g. '08:00'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.org_notification_defaults ENABLE ROW LEVEL SECURITY;

-- Admins/owners of the company can read and write
CREATE POLICY "Company admins can manage org notification defaults"
  ON public.org_notification_defaults
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = org_notification_defaults.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = org_notification_defaults.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'owner')
    )
  );

-- All company members can read (to resolve effective preferences)
CREATE POLICY "Company members can read org notification defaults"
  ON public.org_notification_defaults
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = org_notification_defaults.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- 2. User-level deal summary overrides
-- Separate from the existing user_notification_preferences table (which uses trigger_key pattern)
CREATE TABLE public.user_deal_summary_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_deal_summary_enabled boolean,   -- null = inherit from org
  daily_deal_summary_time_et time WITHOUT TIME ZONE,   -- null = inherit from org
  weekly_deal_summary_enabled boolean,  -- null = inherit from org
  weekly_deal_summary_day_et text CHECK (weekly_deal_summary_day_et IS NULL OR weekly_deal_summary_day_et IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
  weekly_deal_summary_time_et time WITHOUT TIME ZONE,  -- null = inherit from org
  last_daily_deal_summary_sent_at timestamptz,
  last_weekly_deal_summary_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_deal_summary_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can manage own deal summary preferences"
  ON public.user_deal_summary_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role needs access for the cron edge function (bypasses RLS)

-- 3. Indexes for efficient cron queries
CREATE INDEX idx_user_deal_summary_prefs_user_id ON public.user_deal_summary_preferences(user_id);
CREATE INDEX idx_org_notification_defaults_company_id ON public.org_notification_defaults(company_id);

-- 4. Seed 5th Line org defaults
-- The 5th Line company is identified by the is_5thline_user() function which checks
-- for @5thline.co email domain. We find the company via company_members joined with auth.users.
-- We use a direct insert by looking up the company_id from a known 5thline user's membership.
INSERT INTO public.org_notification_defaults (
  company_id,
  daily_deal_summary_enabled,
  daily_deal_summary_weekdays_only,
  daily_deal_summary_time_et,
  weekly_deal_summary_enabled,
  weekly_deal_summary_day_et,
  weekly_deal_summary_time_et
)
SELECT DISTINCT cm.company_id,
  true,   -- daily enabled
  true,   -- weekdays only
  '18:00'::time, -- 6pm ET
  true,   -- weekly enabled
  'saturday',
  '08:00'::time  -- 8am ET
FROM public.company_members cm
JOIN auth.users u ON u.id = cm.user_id
WHERE u.email LIKE '%@5thline.co'
LIMIT 1
ON CONFLICT (company_id) DO UPDATE SET
  daily_deal_summary_enabled = true,
  daily_deal_summary_weekdays_only = true,
  daily_deal_summary_time_et = '18:00'::time,
  weekly_deal_summary_enabled = true,
  weekly_deal_summary_day_et = 'saturday',
  weekly_deal_summary_time_et = '08:00'::time,
  updated_at = now();
