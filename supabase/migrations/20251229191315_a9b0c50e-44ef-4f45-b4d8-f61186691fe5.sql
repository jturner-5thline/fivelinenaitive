-- Add position column to track milestone order
ALTER TABLE public.deal_milestones 
ADD COLUMN position integer NOT NULL DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX idx_deal_milestones_position ON public.deal_milestones(deal_id, position);