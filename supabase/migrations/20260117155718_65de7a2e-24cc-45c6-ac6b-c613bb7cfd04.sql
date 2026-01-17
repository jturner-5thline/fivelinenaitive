-- Create table for storing Gmail OAuth tokens
CREATE TABLE public.gmail_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create table for caching emails
CREATE TABLE public.gmail_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT[],
  cc_emails TEXT[],
  bcc_emails TEXT[],
  snippet TEXT,
  body_text TEXT,
  body_html TEXT,
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  labels TEXT[],
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- Create table for sent emails
CREATE TABLE public.gmail_sent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gmail_message_id TEXT,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[],
  bcc_emails TEXT[],
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gmail_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sent_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for gmail_tokens
CREATE POLICY "Users can view their own tokens" 
ON public.gmail_tokens FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens" 
ON public.gmail_tokens FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens" 
ON public.gmail_tokens FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tokens" 
ON public.gmail_tokens FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for gmail_messages
CREATE POLICY "Users can view their own messages" 
ON public.gmail_messages FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages" 
ON public.gmail_messages FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages" 
ON public.gmail_messages FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages" 
ON public.gmail_messages FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for gmail_sent_messages
CREATE POLICY "Users can view their own sent messages" 
ON public.gmail_sent_messages FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sent messages" 
ON public.gmail_sent_messages FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sent messages" 
ON public.gmail_sent_messages FOR UPDATE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_gmail_tokens_user_id ON public.gmail_tokens(user_id);
CREATE INDEX idx_gmail_messages_user_id ON public.gmail_messages(user_id);
CREATE INDEX idx_gmail_messages_received_at ON public.gmail_messages(received_at DESC);
CREATE INDEX idx_gmail_sent_messages_user_id ON public.gmail_sent_messages(user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_gmail_tokens_updated_at
BEFORE UPDATE ON public.gmail_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();