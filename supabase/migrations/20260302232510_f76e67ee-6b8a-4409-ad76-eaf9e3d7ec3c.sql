
-- Add default checklist configuration column to company_settings
-- This stores default checklist items per deal type, configurable by admins
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS data_room_default_checklists jsonb DEFAULT '{}'::jsonb;

-- The JSON structure will be:
-- {
--   "deal-type-id": {
--     "label": "Venture Debt",
--     "items": [
--       { "name": "Balance Sheet", "category": "Financials", "is_required": true },
--       { "name": "Income Statement", "category": "Financials", "is_required": true },
--       ...
--     ]
--   }
-- }
