-- Clean up orphaned deals with NULL user_id (these cannot be managed by anyone)
DELETE FROM deals WHERE user_id IS NULL;

-- Add NOT NULL constraint to user_id to prevent this issue in the future
-- First, set a default for any edge cases during the alter
ALTER TABLE deals ALTER COLUMN user_id SET NOT NULL;