-- Create a table for referral sources
CREATE TABLE public.referral_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.referral_sources ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own referral sources" 
ON public.referral_sources 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own referral sources" 
ON public.referral_sources 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own referral sources" 
ON public.referral_sources 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own referral sources" 
ON public.referral_sources 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_referral_sources_updated_at
BEFORE UPDATE ON public.referral_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();