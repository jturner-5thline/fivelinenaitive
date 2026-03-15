CREATE TABLE IF NOT EXISTS public.sync_schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qb_enabled boolean NOT NULL DEFAULT false,
  hs_enabled boolean NOT NULL DEFAULT false,
  interval_hours integer NOT NULL DEFAULT 6,
  last_qb_sync timestamptz,
  last_hs_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.sync_schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sync settings"
  ON public.sync_schedule_settings
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());