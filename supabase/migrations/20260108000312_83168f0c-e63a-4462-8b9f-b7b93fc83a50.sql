-- Add email delivery status tracking to company_invitations
ALTER TABLE public.company_invitations 
ADD COLUMN email_status TEXT DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
ADD COLUMN email_error TEXT,
ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;