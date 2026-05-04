
CREATE OR REPLACE FUNCTION public.save_dashboard_grid_layout(
  _company_id uuid,
  _dashboard_id text,
  _layout jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Access denied: not a company member';
  END IF;

  INSERT INTO public.dashboard_grid_layouts (user_id, company_id, dashboard_id, layout)
  VALUES (auth.uid(), _company_id, _dashboard_id, _layout)
  ON CONFLICT (company_id, dashboard_id)
  DO UPDATE SET layout = EXCLUDED.layout, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_dashboard_grid_layout(
  _company_id uuid,
  _dashboard_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Access denied: not a company member';
  END IF;

  DELETE FROM public.dashboard_grid_layouts
  WHERE company_id = _company_id AND dashboard_id = _dashboard_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_dashboard_grid_layout(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_dashboard_grid_layout(uuid, text) TO authenticated;
