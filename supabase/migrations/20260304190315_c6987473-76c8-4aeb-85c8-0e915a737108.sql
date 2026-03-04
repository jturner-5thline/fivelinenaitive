
-- Add support_admin to app_role enum (must be in its own transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support_admin';
