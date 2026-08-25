ALTER TABLE public.contacts DISABLE TRIGGER trg_contacts_audit_update;
ALTER TABLE public.contacts DISABLE TRIGGER trg_contacts_autolink;

UPDATE public.contacts
SET owner_user_id = 'a6b48ccd-0f2a-4018-886e-241287208ea0'
WHERE owner_user_id IS NULL
  AND (org_company_id IS NULL OR org_company_id = '44556c46-9127-4b12-b14e-d6fee784afcf');

ALTER TABLE public.contacts ENABLE TRIGGER trg_contacts_audit_update;
ALTER TABLE public.contacts ENABLE TRIGGER trg_contacts_autolink;