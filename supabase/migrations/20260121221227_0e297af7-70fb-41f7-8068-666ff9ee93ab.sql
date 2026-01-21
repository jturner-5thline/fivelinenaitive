-- Add permission_settings column to company_settings for role-based permissions
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS permission_settings JSONB DEFAULT '{"lenderEdit":{"allowedRoles":["owner","admin","member"],"allowMembersToEditStage":true,"allowMembersToEditMilestones":true,"allowMembersToEditNotes":true}}'::jsonb;