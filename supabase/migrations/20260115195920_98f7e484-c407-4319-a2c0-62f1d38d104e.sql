-- Create deal_info_requests table to store FLEx info requests
CREATE TABLE public.deal_info_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_deal_id TEXT NOT NULL,
  company_name TEXT,
  industry TEXT,
  capital_ask TEXT,
  requester_user_id TEXT,
  requester_email TEXT,
  requester_name TEXT,
  requested_at TIMESTAMP WITH TIME ZONE,
  source TEXT DEFAULT 'flex',
  status TEXT DEFAULT 'pending',
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_info_requests ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all info requests (company-wide visibility)
CREATE POLICY "Users can view info requests"
ON public.deal_info_requests
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update info requests (for responding)
CREATE POLICY "Users can update info requests"
ON public.deal_info_requests
FOR UPDATE
TO authenticated
USING (true);

-- Allow service role to insert (from edge function)
CREATE POLICY "Service role can insert info requests"
ON public.deal_info_requests
FOR INSERT
TO service_role
WITH CHECK (true);

-- Add updated_at trigger
CREATE TRIGGER update_deal_info_requests_updated_at
BEFORE UPDATE ON public.deal_info_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();