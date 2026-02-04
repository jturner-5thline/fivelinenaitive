-- Add lender_matching_config column to company_settings table
ALTER TABLE public.company_settings
ADD COLUMN lender_matching_config JSONB DEFAULT '{
  "criteria": [
    {"id": "deal_size", "label": "Deal Size", "enabled": true, "weight": 50, "position": 1},
    {"id": "deal_type", "label": "Deal Type", "enabled": true, "weight": 40, "position": 2},
    {"id": "cash_burn", "label": "Cash Burn OK", "enabled": true, "weight": 30, "position": 3},
    {"id": "industry", "label": "Industry", "enabled": true, "weight": 25, "position": 4},
    {"id": "sponsorship", "label": "Sponsorship", "enabled": true, "weight": 20, "position": 5},
    {"id": "geography", "label": "Geography", "enabled": true, "weight": 10, "position": 6},
    {"id": "b2b_b2c", "label": "B2B/B2C", "enabled": true, "weight": 8, "position": 7}
  ],
  "penalties": {
    "industry_avoided": -50,
    "below_min_deal": -30,
    "above_max_deal": -30,
    "cash_burn_mismatch": -25,
    "sponsorship_mismatch": -20
  }
}'::jsonb;