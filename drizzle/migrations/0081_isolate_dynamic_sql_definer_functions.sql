CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.admin_delete_user(uuid) RENAME TO admin_delete_user_impl;
ALTER FUNCTION public.admin_delete_user_impl(uuid) SET SCHEMA private;
ALTER FUNCTION public.hard_delete_deal(uuid) RENAME TO hard_delete_deal_impl;
ALTER FUNCTION public.hard_delete_deal_impl(uuid) SET SCHEMA private;
ALTER FUNCTION public.mcp_transfer_lender_audit(uuid, uuid) RENAME TO mcp_transfer_lender_audit_impl;
ALTER FUNCTION public.mcp_transfer_lender_audit_impl(uuid, uuid) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.admin_delete_user_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.hard_delete_deal_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mcp_transfer_lender_audit_impl(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_delete_user(_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  PERFORM private.admin_delete_user_impl(_user_id);
END $$;

CREATE FUNCTION public.hard_delete_deal(_deal_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can permanently delete deals';
  END IF;
  PERFORM private.hard_delete_deal_impl(_deal_id);
END $$;

CREATE FUNCTION public.mcp_transfer_lender_audit(p_keep uuid, p_merge uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  PERFORM private.mcp_transfer_lender_audit_impl(p_keep, p_merge);
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hard_delete_deal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mcp_transfer_lender_audit(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hard_delete_deal(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_transfer_lender_audit(uuid, uuid) TO authenticated, service_role;