
-- Table to store @mentions in task comments and descriptions
CREATE TABLE public.task_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,
  mentioned_by UUID NOT NULL,
  mentioned_user_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'comment' CHECK (source IN ('comment', 'description')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick lookup of unread mentions for a user
CREATE INDEX idx_task_mentions_user ON public.task_mentions(mentioned_user_id, is_read, created_at DESC);
CREATE INDEX idx_task_mentions_task ON public.task_mentions(task_id);

-- Enable RLS
ALTER TABLE public.task_mentions ENABLE ROW LEVEL SECURITY;

-- Users can read mentions where they are the mentioned user or the mentioner
CREATE POLICY "Users can read their own mentions"
  ON public.task_mentions FOR SELECT
  USING (mentioned_user_id = auth.uid() OR mentioned_by = auth.uid());

-- Users can create mentions (when commenting/editing)
CREATE POLICY "Users can create mentions"
  ON public.task_mentions FOR INSERT
  WITH CHECK (mentioned_by = auth.uid());

-- Users can mark their own mentions as read
CREATE POLICY "Users can update their own mentions"
  ON public.task_mentions FOR UPDATE
  USING (mentioned_user_id = auth.uid());

-- Enable realtime for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_mentions;
