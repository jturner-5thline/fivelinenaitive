
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS rating int CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS company_id uuid;

DROP POLICY IF EXISTS "5thline users can insert feedback" ON public.feedback;
CREATE POLICY "Authenticated users can insert their feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update feedback" ON public.feedback;
CREATE POLICY "Admins can update feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  feature_area text NOT NULL,
  prompt_text text NOT NULL,
  description text,
  token_avg int NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ai prompts"
  ON public.ai_prompts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_ai_prompts_updated_at
  BEFORE UPDATE ON public.ai_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ai_prompts (name, feature_area, prompt_text, description) VALUES
  ('Email Draft Reply', 'Email Draft', 'You are a debt advisory assistant. Draft a concise reply to the email below considering deal context and recent activity.', 'Generates context-aware email replies'),
  ('Lender Match Suggestions', 'Lender Match', 'Given the deal profile, suggest the top 5 lenders ranked by fit. Consider sector, ticket size, and structure.', 'Ranks lenders for a given deal'),
  ('Deal Space Summary', 'Deal Space', 'Summarize the latest activity, blockers, and next steps for the deal. Keep it under 5 bullets.', 'Daily deal summary'),
  ('AI Chat Default', 'AI Chat', 'You are naitive, an AI copilot for debt advisory professionals. Be concise and cite source documents when possible.', 'Default system prompt for chat')
ON CONFLICT DO NOTHING;
