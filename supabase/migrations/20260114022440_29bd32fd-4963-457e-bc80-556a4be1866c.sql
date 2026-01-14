-- Add tracking_status column to deal_lenders table
ALTER TABLE public.deal_lenders 
ADD COLUMN IF NOT EXISTS tracking_status text DEFAULT 'active' CHECK (tracking_status IN ('active', 'on-hold', 'on-deck', 'passed'));

-- Update the updated_at trigger if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_deal_lenders_updated_at' 
    AND tgrelid = 'public.deal_lenders'::regclass
  ) THEN
    CREATE TRIGGER update_deal_lenders_updated_at
    BEFORE UPDATE ON public.deal_lenders
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;