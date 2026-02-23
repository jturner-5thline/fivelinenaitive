
-- Fix the overly permissive insert policy on weekly_hours_tasks
DROP POLICY "System can insert weekly hours tasks" ON public.weekly_hours_tasks;

-- Allow users to insert their own tasks (the edge function uses service role key)
CREATE POLICY "Users can insert their own weekly hours tasks"
  ON public.weekly_hours_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);
