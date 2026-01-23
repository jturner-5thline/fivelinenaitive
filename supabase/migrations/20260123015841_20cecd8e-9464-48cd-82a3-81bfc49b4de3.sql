-- Create agents table for storing custom AI assistant configurations
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_emoji TEXT DEFAULT '🤖',
  system_prompt TEXT NOT NULL,
  personality TEXT DEFAULT 'professional',
  temperature NUMERIC(2,1) DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  -- Data access permissions
  can_access_deals BOOLEAN DEFAULT true,
  can_access_lenders BOOLEAN DEFAULT true,
  can_access_activities BOOLEAN DEFAULT false,
  can_access_milestones BOOLEAN DEFAULT false,
  can_search_web BOOLEAN DEFAULT false,
  -- Sharing settings
  is_shared BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  -- Metadata
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agent conversations table
CREATE TABLE public.agent_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  context_deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agent messages table
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for agents
CREATE POLICY "Users can view their own agents"
  ON public.agents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view shared agents in their company"
  ON public.agents FOR SELECT
  USING (
    is_shared = true 
    AND company_id IS NOT NULL 
    AND public.is_company_member(auth.uid(), company_id)
  );

CREATE POLICY "Users can view public agents"
  ON public.agents FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can create their own agents"
  ON public.agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agents"
  ON public.agents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agents"
  ON public.agents FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for conversations
CREATE POLICY "Users can view their own conversations"
  ON public.agent_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
  ON public.agent_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON public.agent_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
  ON public.agent_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
  ON public.agent_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON public.agent_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX idx_agents_user_id ON public.agents(user_id);
CREATE INDEX idx_agents_company_id ON public.agents(company_id);
CREATE INDEX idx_agent_conversations_agent_id ON public.agent_conversations(agent_id);
CREATE INDEX idx_agent_conversations_user_id ON public.agent_conversations(user_id);
CREATE INDEX idx_agent_messages_conversation_id ON public.agent_messages(conversation_id);

-- Create trigger for updated_at
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_conversations_updated_at
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();