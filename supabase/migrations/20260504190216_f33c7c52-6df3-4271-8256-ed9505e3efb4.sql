
-- Tasks: main query is (assigned_to, archived_at IS NULL, parent_task_id IS NULL) ordered by position
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_active
  ON public.tasks (assigned_to, position, created_at DESC)
  WHERE archived_at IS NULL AND parent_task_id IS NULL;

-- Company-scoped 'all/others' listing
CREATE INDEX IF NOT EXISTS idx_tasks_company_active
  ON public.tasks (company_id, position, created_at DESC)
  WHERE archived_at IS NULL AND parent_task_id IS NULL;

-- Filter helpers
CREATE INDEX IF NOT EXISTS idx_tasks_deal_active
  ON public.tasks (deal_id)
  WHERE archived_at IS NULL AND deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date_active
  ON public.tasks (due_date)
  WHERE archived_at IS NULL AND due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status_active
  ON public.tasks (status)
  WHERE archived_at IS NULL;

-- Subtask lookup by parent
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Email cache: thread grouping query in loadEnrichedEmails
CREATE INDEX IF NOT EXISTS idx_email_cache_user_thread
  ON public.email_cache (user_id, thread_id)
  WHERE thread_id IS NOT NULL;
