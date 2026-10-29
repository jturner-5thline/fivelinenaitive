DROP POLICY IF EXISTS "Members can create invitations" ON public.company_invitations;
CREATE POLICY "Members can create invitations" ON public.company_invitations
FOR INSERT TO authenticated
WITH CHECK (
  public.is_company_member(auth.uid(), company_id)
  AND (role = 'member' OR (role = 'admin' AND public.is_company_admin(auth.uid(), company_id)))
);

CREATE OR REPLACE FUNCTION public.guard_company_invitation_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_company_admin(auth.uid(), NEW.company_id) THEN
    RAISE EXCEPTION 'Only company admins can change an invitation role';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation company cannot be changed';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_company_invitation_role ON public.company_invitations;
CREATE TRIGGER trg_guard_company_invitation_role
BEFORE UPDATE ON public.company_invitations
FOR EACH ROW EXECUTE FUNCTION public.guard_company_invitation_role();