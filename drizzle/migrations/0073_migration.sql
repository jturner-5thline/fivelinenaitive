CREATE OR REPLACE FUNCTION public.fn_trimmed_mean(p_values numeric[], p_trim numeric DEFAULT 0.10)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH v AS (SELECT x, row_number() OVER (ORDER BY x) rn, count(*) OVER () n FROM unnest(p_values) x WHERE x IS NOT NULL)
  SELECT avg(x) FROM v WHERE rn > floor(n * p_trim) AND rn <= n - floor(n * p_trim);
$$;

CREATE OR REPLACE FUNCTION public.fn_milestone_projection_days(p_company_id uuid, p_target_stage text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vals numeric[]; v_fallback numeric;
BEGIN
  v_fallback := CASE p_target_stage WHEN 'final-credit-items' THEN 20 WHEN 'terms-issued' THEN 58 WHEN 'in-due-diligence' THEN 120 END;
  IF v_fallback IS NULL THEN RETURN NULL; END IF;
  WITH e AS (
    SELECT h.deal_id, h.to_stage, min(h.changed_at) t
    FROM deal_stage_history h JOIN deals d ON d.id = h.deal_id
    JOIN deal_pipelines p ON p.id = d.pipeline_id AND p.is_default
    WHERE h.company_id = p_company_id AND h.to_stage IN ('pre-credit-needs', p_target_stage)
      AND d.company NOT IN ('Test-Niki''s Store','Example Deal') AND lower(d.company) NOT LIKE 'test %'
    GROUP BY 1,2)
  SELECT array_agg(extract(epoch FROM b.t - a.t) / 86400) INTO v_vals
  FROM e a JOIN e b ON a.deal_id = b.deal_id AND b.to_stage = p_target_stage
  WHERE a.to_stage = 'pre-credit-needs' AND b.t > a.t AND b.t >= now() - interval '24 months';
  IF coalesce(array_length(v_vals,1),0) < 3 THEN RETURN v_fallback; END IF;
  RETURN round(fn_trimmed_mean(v_vals, 0.10));
END $$;
REVOKE ALL ON FUNCTION public.fn_milestone_projection_days(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_deal_milestone_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_days numeric; v_due date; v_id uuid; v_base timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM deal_pipelines WHERE id = NEW.pipeline_id AND is_default) THEN RETURN NEW; END IF;
  IF NEW.company IN ('Test-Niki''s Store','Example Deal') OR lower(NEW.company) LIKE 'test %' THEN RETURN NEW; END IF;

  IF NEW.stage = 'pre-credit-needs' THEN
    v_base := coalesce(NEW.stage_entered_at, now());
    FOR m IN SELECT * FROM (VALUES ('Client Signed','final-credit-items'),('First Term Sheets','terms-issued'),('Term Sheet Signed','in-due-diligence')) t(title, stage) LOOP
      v_days := fn_milestone_projection_days(NEW.company_id, m.stage);
      v_due := (v_base + make_interval(days => v_days::int))::date;
      SELECT id INTO v_id FROM deal_milestones WHERE deal_id = NEW.id AND lower(title) = lower(m.title) ORDER BY created_at LIMIT 1;
      IF v_id IS NULL THEN
        INSERT INTO deal_milestones(deal_id, title, due_date, user_id, position)
        VALUES (NEW.id, m.title, v_due, NEW.user_id, coalesce((SELECT max(position)+1 FROM deal_milestones WHERE deal_id = NEW.id),0));
      ELSE
        UPDATE deal_milestones SET due_date = v_due WHERE id = v_id AND NOT completed AND due_date IS NULL;
      END IF;
    END LOOP;
  END IF;

  UPDATE deal_milestones SET completed = true, completed_at = now()
  WHERE deal_id = NEW.id AND NOT completed AND lower(title) = lower(CASE NEW.stage
    WHEN 'final-credit-items' THEN 'Client Signed' WHEN 'terms-issued' THEN 'First Term Sheets' WHEN 'in-due-diligence' THEN 'Term Sheet Signed' END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_deal_milestone_automation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deal_milestone_automation ON public.deals;
CREATE TRIGGER trg_deal_milestone_automation AFTER INSERT OR UPDATE OF stage ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.fn_deal_milestone_automation();