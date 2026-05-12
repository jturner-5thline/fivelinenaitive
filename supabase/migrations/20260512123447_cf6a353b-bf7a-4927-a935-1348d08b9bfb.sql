CREATE TABLE public.weekly_rundown_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_rundown_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "5thline users can view recipients"
ON public.weekly_rundown_recipients FOR SELECT
TO authenticated
USING ((auth.jwt() ->> 'email') LIKE '%@5thline.co');

CREATE POLICY "5thline users can manage recipients"
ON public.weekly_rundown_recipients FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'email') LIKE '%@5thline.co')
WITH CHECK ((auth.jwt() ->> 'email') LIKE '%@5thline.co');

CREATE TRIGGER update_weekly_rundown_recipients_updated_at
BEFORE UPDATE ON public.weekly_rundown_recipients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.weekly_rundown_recipients (email, name) VALUES
  ('jturner@5thline.co', 'J. Turner'),
  ('jmoffitt@5thline.co', 'J. Moffitt'),
  ('swilliams@5thline.co', 'S. Williams'),
  ('mclark@5thline.co', 'M. Clark')
ON CONFLICT (email) DO NOTHING;