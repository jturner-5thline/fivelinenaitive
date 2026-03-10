
-- Fix can_access_deal to fall back to company membership when no permissions row exists
CREATE OR REPLACE FUNCTION public.can_access_deal(_user_id uuid, _deal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      -- Admin can access all
      WHEN public.has_role(_user_id, 'admin') THEN true
      -- Deal owner can always access
      WHEN EXISTS (SELECT 1 FROM deals WHERE id = _deal_id AND user_id = _user_id) THEN true
      -- Check permissions if they exist
      ELSE COALESCE(
        (
          SELECT 
            CASE 
              WHEN p.deals_scope = 'all' THEN true
              WHEN p.deals_scope = 'team' THEN _deal_id = ANY(p.assigned_deal_ids)
              WHEN p.deals_scope = 'own' THEN false
              ELSE false
            END
          FROM user_data_permissions p
          JOIN deals d ON d.id = _deal_id
          WHERE p.user_id = _user_id
            AND (p.company_id = d.company_id OR p.company_id IS NULL)
          LIMIT 1
        ),
        -- No permissions row: fall back to company membership
        (
          SELECT EXISTS (
            SELECT 1
            FROM deals d
            JOIN company_members cm ON cm.company_id = d.company_id
            WHERE d.id = _deal_id
              AND cm.user_id = _user_id
          )
        )
      )
    END
$function$;
