-- Create table for configurable data room checklist categories
CREATE TABLE public.data_room_checklist_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.data_room_checklist_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for categories
CREATE POLICY "Users can view their own or company categories"
ON public.data_room_checklist_categories
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Users can insert their own categories"
ON public.data_room_checklist_categories
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own categories"
ON public.data_room_checklist_categories
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own categories"
ON public.data_room_checklist_categories
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_data_room_checklist_categories_updated_at
BEFORE UPDATE ON public.data_room_checklist_categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();