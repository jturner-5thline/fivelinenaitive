-- Add contact_phone column to master_lenders table for primary contact phone number
ALTER TABLE public.master_lenders
ADD COLUMN contact_phone text NULL;