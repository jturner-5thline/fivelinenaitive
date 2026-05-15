
CREATE TABLE IF NOT EXISTS public.business_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.business_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view business holidays"
ON public.business_holidays FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage business holidays"
ON public.business_holidays FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_business_holidays_updated_at
BEFORE UPDATE ON public.business_holidays
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_daily_rundown_notice_at TIMESTAMPTZ;

INSERT INTO public.business_holidays (holiday_date, name) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-07-03', 'July 4th (observed)'),
  ('2026-09-07', 'Labor Day'),
  ('2026-11-26', 'Thanksgiving'),
  ('2026-11-27', 'Day after Thanksgiving'),
  ('2026-12-24', 'Christmas Eve'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-31', 'New Year''s Eve'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-05-31', 'Memorial Day'),
  ('2027-07-05', 'July 4th (observed)'),
  ('2027-09-06', 'Labor Day'),
  ('2027-11-25', 'Thanksgiving'),
  ('2027-11-26', 'Day after Thanksgiving'),
  ('2027-12-24', 'Christmas Eve'),
  ('2027-12-31', 'New Year''s Eve')
ON CONFLICT (holiday_date) DO NOTHING;
