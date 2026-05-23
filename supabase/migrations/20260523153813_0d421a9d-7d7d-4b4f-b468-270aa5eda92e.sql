ALTER TABLE public.user_email_ai_preferences
  ADD COLUMN IF NOT EXISTS calendar_tz text,
  ADD COLUMN IF NOT EXISTS working_hours jsonb NOT NULL DEFAULT '{"mon":{"start":"09:00","end":"18:00"},"tue":{"start":"09:00","end":"18:00"},"wed":{"start":"09:00","end":"18:00"},"thu":{"start":"09:00","end":"18:00"},"fri":{"start":"09:00","end":"18:00"},"sat":null,"sun":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS recent_tz text[] NOT NULL DEFAULT ARRAY[]::text[];