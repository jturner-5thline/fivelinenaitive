
CREATE OR REPLACE FUNCTION public.get_lender_deal_stats(
  _company_id uuid,
  _limit integer DEFAULT 50
)
RETURNS TABLE(
  lender_name text,
  deal_count bigint,
  active_count bigint,
  funded_count bigint,
  total_volume numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    dl.name as lender_name,
    COUNT(DISTINCT dl.deal_id) as deal_count,
    COUNT(DISTINCT CASE WHEN d.status = 'active' THEN dl.deal_id END) as active_count,
    COUNT(DISTINCT CASE WHEN dl.stage = 'Funded' OR d.stage = 'Funded' THEN dl.deal_id END) as funded_count,
    COALESCE(SUM(d.value), 0) as total_volume
  FROM public.deal_lenders dl
  JOIN public.deals d ON d.id = dl.deal_id
  WHERE d.company_id = _company_id
  GROUP BY dl.name
  ORDER BY deal_count DESC
  LIMIT _limit;
$$;
