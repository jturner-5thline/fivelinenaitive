ALTER TABLE public.ai_configuration
ADD COLUMN IF NOT EXISTS copilot_instructions jsonb NOT NULL DEFAULT '{
  "company_description": "5th Line is a debt advisory firm that helps growth-stage companies access capital markets through ABL, growth capital, CapEx financing, and acquisition financing.",
  "lifecycle_stages": [
    {"name": "NDA/Needs List Sent", "description": ""},
    {"name": "Initial Lender Review", "description": ""},
    {"name": "Proposal Issued", "description": ""},
    {"name": "Agreement Pending", "description": ""},
    {"name": "Terms Issued", "description": ""},
    {"name": "Final Credit Items", "description": ""},
    {"name": "In Due Diligence", "description": ""},
    {"name": "Funded", "description": ""}
  ],
  "tone": "professional_concise",
  "team_structure": "",
  "custom_instructions": ""
}'::jsonb;