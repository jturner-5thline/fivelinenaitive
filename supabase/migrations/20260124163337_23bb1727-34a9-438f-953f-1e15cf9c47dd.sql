-- Create table to track incoming lender sync requests from Flex
CREATE TABLE public.lender_sync_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Source information
  source_system TEXT NOT NULL DEFAULT 'flex',
  source_lender_id TEXT, -- ID from the source system
  
  -- Request type
  request_type TEXT NOT NULL CHECK (request_type IN ('new_lender', 'update_existing', 'merge_conflict')),
  
  -- The incoming lender data from Flex
  incoming_data JSONB NOT NULL,
  
  -- If this relates to an existing lender
  existing_lender_id UUID REFERENCES public.master_lenders(id) ON DELETE SET NULL,
  existing_lender_name TEXT,
  
  -- Diff of changes (for updates)
  changes_diff JSONB,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged', 'auto_approved')),
  
  -- Who processed this request
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for quick lookups
CREATE INDEX idx_lender_sync_requests_status ON public.lender_sync_requests(status);
CREATE INDEX idx_lender_sync_requests_created ON public.lender_sync_requests(created_at DESC);
CREATE INDEX idx_lender_sync_requests_existing ON public.lender_sync_requests(existing_lender_id);

-- Enable RLS
ALTER TABLE public.lender_sync_requests ENABLE ROW LEVEL SECURITY;

-- Policies - company members can view and manage sync requests
CREATE POLICY "Users can view lender sync requests"
  ON public.lender_sync_requests
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update lender sync requests"
  ON public.lender_sync_requests
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_lender_sync_requests_updated_at
  BEFORE UPDATE ON public.lender_sync_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add a sync_source column to master_lenders to track origin
ALTER TABLE public.master_lenders 
  ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'naitive',
  ADD COLUMN IF NOT EXISTS flex_lender_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_from_flex TIMESTAMP WITH TIME ZONE;

-- Create index for flex_lender_id lookups
CREATE INDEX IF NOT EXISTS idx_master_lenders_flex_id ON public.master_lenders(flex_lender_id);
