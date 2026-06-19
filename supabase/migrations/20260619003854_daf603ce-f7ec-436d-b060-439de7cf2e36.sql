CREATE OR REPLACE FUNCTION public.get_visible_ai_action_queue()
RETURNS SETOF public.ai_action_queue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_user_ctx AS (
    SELECT auth.uid() AS uid
  ), profile_names AS (
    SELECT array_remove(ARRAY[
      NULLIF(lower(regexp_replace(translate(trim(coalesce(p.display_name, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')), ''),
      NULLIF(lower(regexp_replace(translate(trim(coalesce(p.full_name, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')), ''),
      NULLIF(lower(regexp_replace(translate(trim(concat_ws(' ', p.first_name, p.last_name)), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')), '')
    ], NULL) AS normalized_names
    FROM public.profiles p
    JOIN current_user_ctx u ON p.user_id = u.uid
    LIMIT 1
  ), access_flags AS (
    SELECT
      u.uid,
      public.can_use_approval_queue(u.uid) AS can_use_queue,
      (
        public.is_admin(u.uid)
        OR EXISTS (
          SELECT 1
          FROM public.company_members cm
          WHERE cm.user_id = u.uid
            AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
            AND cm.role IN ('owner', 'admin')
        )
      ) AS can_see_all
    FROM current_user_ctx u
  )
  SELECT q.*
  FROM public.ai_action_queue q
  CROSS JOIN access_flags af
  LEFT JOIN profile_names pn ON true
  WHERE af.uid IS NOT NULL
    AND af.can_use_queue
    AND q.status = 'pending'
    AND (
      af.can_see_all
      OR q.user_id = af.uid
      OR EXISTS (
        SELECT 1
        FROM public.deals d
        WHERE (
            d.id = q.deal_id
            OR (
              q.payload ? 'deal_id'
              AND (q.payload->>'deal_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND d.id = (q.payload->>'deal_id')::uuid
            )
            OR (
              NULLIF(lower(regexp_replace(translate(trim(coalesce(q.deal_name, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')), '') IS NOT NULL
              AND lower(regexp_replace(translate(trim(coalesce(d.company, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')) = lower(regexp_replace(translate(trim(coalesce(q.deal_name, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g'))
            )
          )
          AND (
            d.deal_owner_user_id = af.uid
            OR lower(regexp_replace(translate(trim(coalesce(d.deal_owner, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')) = ANY(coalesce(pn.normalized_names, ARRAY[]::text[]))
            OR lower(regexp_replace(translate(trim(coalesce(d.manager, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')) = ANY(coalesce(pn.normalized_names, ARRAY[]::text[]))
            OR lower(regexp_replace(translate(trim(coalesce(d.dm_name, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'), '\s+', ' ', 'g')) = ANY(coalesce(pn.normalized_names, ARRAY[]::text[]))
          )
      )
    )
  ORDER BY q.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_visible_ai_action_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visible_ai_action_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visible_ai_action_queue() TO service_role;