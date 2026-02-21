
-- Workbooks table for cloud persistence
CREATE TABLE public.spreadsheet_workbooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Workbook',
  data JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Version history
CREATE TABLE public.spreadsheet_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workbook_id UUID NOT NULL REFERENCES public.spreadsheet_workbooks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data JSONB NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_spreadsheet_workbooks_user ON public.spreadsheet_workbooks(user_id);
CREATE INDEX idx_spreadsheet_versions_workbook ON public.spreadsheet_versions(workbook_id);

-- RLS
ALTER TABLE public.spreadsheet_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spreadsheet_versions ENABLE ROW LEVEL SECURITY;

-- Policies - users can only access their own workbooks
CREATE POLICY "Users can CRUD their own workbooks" ON public.spreadsheet_workbooks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can access versions of their workbooks" ON public.spreadsheet_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.spreadsheet_workbooks w WHERE w.id = workbook_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.spreadsheet_workbooks w WHERE w.id = workbook_id AND w.user_id = auth.uid())
  );

-- Auto-update timestamp trigger
CREATE TRIGGER update_spreadsheet_workbooks_updated_at
  BEFORE UPDATE ON public.spreadsheet_workbooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
