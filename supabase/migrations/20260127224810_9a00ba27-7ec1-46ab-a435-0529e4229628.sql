-- Create table for Deal Space conversation history
CREATE TABLE public.deal_space_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for conversation messages
CREATE TABLE public.deal_space_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.deal_space_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for document summaries
CREATE TABLE public.deal_space_document_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.deal_space_documents(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- Enable RLS
ALTER TABLE public.deal_space_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_space_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_space_document_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversations (company members can access)
CREATE POLICY "Users can view deal space conversations for their deals"
ON public.deal_space_conversations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM deals d WHERE d.id = deal_id AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create deal space conversations"
ON public.deal_space_conversations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_id AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM deals d WHERE d.id = deal_id AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own conversations"
ON public.deal_space_conversations FOR DELETE
USING (user_id = auth.uid());

-- RLS policies for messages
CREATE POLICY "Users can view messages in accessible conversations"
ON public.deal_space_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deal_space_conversations c
    JOIN deals d ON d.id = c.deal_id
    LEFT JOIN company_members cm ON cm.company_id = d.company_id
    WHERE c.id = conversation_id 
    AND (cm.user_id = auth.uid() OR d.user_id = auth.uid())
  )
);

CREATE POLICY "Users can create messages in accessible conversations"
ON public.deal_space_messages FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deal_space_conversations c
    JOIN deals d ON d.id = c.deal_id
    LEFT JOIN company_members cm ON cm.company_id = d.company_id
    WHERE c.id = conversation_id 
    AND (cm.user_id = auth.uid() OR d.user_id = auth.uid())
  )
);

-- RLS policies for document summaries
CREATE POLICY "Users can view document summaries for accessible deals"
ON public.deal_space_document_summaries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deal_space_documents doc
    JOIN deals d ON d.id = doc.deal_id
    LEFT JOIN company_members cm ON cm.company_id = d.company_id
    WHERE doc.id = document_id 
    AND (cm.user_id = auth.uid() OR d.user_id = auth.uid())
  )
);

CREATE POLICY "Users can create document summaries"
ON public.deal_space_document_summaries FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deal_space_documents doc
    JOIN deals d ON d.id = doc.deal_id
    LEFT JOIN company_members cm ON cm.company_id = d.company_id
    WHERE doc.id = document_id 
    AND (cm.user_id = auth.uid() OR d.user_id = auth.uid())
  )
);

CREATE POLICY "Users can update document summaries"
ON public.deal_space_document_summaries FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deal_space_documents doc
    JOIN deals d ON d.id = doc.deal_id
    LEFT JOIN company_members cm ON cm.company_id = d.company_id
    WHERE doc.id = document_id 
    AND (cm.user_id = auth.uid() OR d.user_id = auth.uid())
  )
);

-- Add updated_at trigger
CREATE TRIGGER update_deal_space_conversations_updated_at
BEFORE UPDATE ON public.deal_space_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_space_document_summaries_updated_at
BEFORE UPDATE ON public.deal_space_document_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();