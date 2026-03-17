
-- 1. Reset all non-5th-Line companies to restricted defaults
UPDATE public.company_features
SET 
  workflows_enabled = false,
  timeline_view_enabled = false,
  agreement_icon_visible = false,
  deal_memo_enabled = false,
  sample_deal_on_signup = true,
  updated_at = now()
WHERE company_id != (
  SELECT c.id FROM public.companies c
  JOIN public.company_members cm ON cm.company_id = c.id
  WHERE c.name ILIKE '%5th Line%'
  GROUP BY c.id
  ORDER BY COUNT(cm.id) DESC
  LIMIT 1
);

-- 2. Ensure the 5th Line company has all flags true
UPDATE public.company_features
SET 
  workflows_enabled = true,
  timeline_view_enabled = true,
  agreement_icon_visible = true,
  deal_memo_enabled = true,
  sample_deal_on_signup = true,
  updated_at = now()
WHERE company_id = (
  SELECT c.id FROM public.companies c
  JOIN public.company_members cm ON cm.company_id = c.id
  WHERE c.name ILIKE '%5th Line%'
  GROUP BY c.id
  ORDER BY COUNT(cm.id) DESC
  LIMIT 1
);

-- 3. Replace the auto-creation trigger function to default flags to false for non-5th-Line
CREATE OR REPLACE FUNCTION public.auto_create_company_features()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_5thline BOOLEAN;
BEGIN
  -- Check if this company's domain suggests it's 5th Line
  is_5thline := (NEW.primary_domain = '5thline.co' OR NEW.name ILIKE '%5th Line%');

  INSERT INTO public.company_features (company_id, workflows_enabled, timeline_view_enabled, agreement_icon_visible, deal_memo_enabled, sample_deal_on_signup)
  VALUES (
    NEW.id,
    is_5thline,  -- false for non-5th-Line
    is_5thline,
    is_5thline,
    is_5thline,
    true         -- sample deal always defaults true
  )
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS auto_create_company_features ON public.companies;
CREATE TRIGGER auto_create_company_features
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_company_features();
