-- Add geography column to lender_contacts table
ALTER TABLE public.lender_contacts
ADD COLUMN geography text NULL;