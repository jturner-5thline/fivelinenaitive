ALTER TABLE public.outstanding_items ADD COLUMN IF NOT EXISTS source_metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN public.outstanding_items.source_metadata IS 'Stores automation origin data for dedup: source_type, source_round, source_deal_type_match, source_item_key';