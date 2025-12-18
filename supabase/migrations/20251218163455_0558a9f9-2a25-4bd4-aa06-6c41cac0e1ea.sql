-- Enable realtime for deals table
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;

-- Enable realtime for deal_lenders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_lenders;