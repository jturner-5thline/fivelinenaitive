
-- Weekly time entries: one row per (deal, user, week)
CREATE TABLE public.weekly_time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 168),
  source TEXT NOT NULL DEFAULT 'manual_entry',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, user_id, week_start_date)
);

-- Index for fast lookups
CREATE INDEX idx_weekly_time_entries_user_week ON public.weekly_time_entries(user_id, week_start_date);
CREATE INDEX idx_weekly_time_entries_deal ON public.weekly_time_entries(deal_id);

-- Enable RLS
ALTER TABLE public.weekly_time_entries ENABLE ROW LEVEL SECURITY;

-- Users can view entries for deals in their company
CREATE POLICY "Users can view time entries for their company deals"
  ON public.weekly_time_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_id AND cm.user_id = auth.uid()
    )
  );

-- Users can insert their own entries
CREATE POLICY "Users can insert their own time entries"
  ON public.weekly_time_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own entries
CREATE POLICY "Users can update their own time entries"
  ON public.weekly_time_entries FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own entries
CREATE POLICY "Users can delete their own time entries"
  ON public.weekly_time_entries FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_weekly_time_entries_updated_at
  BEFORE UPDATE ON public.weekly_time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Weekly hours tasks: track submission status per user per week
CREATE TABLE public.weekly_hours_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed')),
  total_deals INTEGER NOT NULL DEFAULT 0,
  deals_submitted INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start_date)
);

CREATE INDEX idx_weekly_hours_tasks_user ON public.weekly_hours_tasks(user_id, status);

ALTER TABLE public.weekly_hours_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own weekly hours tasks"
  ON public.weekly_hours_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own weekly hours tasks"
  ON public.weekly_hours_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert weekly hours tasks"
  ON public.weekly_hours_tasks FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER update_weekly_hours_tasks_updated_at
  BEFORE UPDATE ON public.weekly_hours_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
