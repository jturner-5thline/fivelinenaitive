
-- FPA Comments: threaded comments on P&L lines, KPIs, charts
CREATE TABLE public.fpa_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.fpa_comments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- 'pl_line', 'kpi', 'chart', 'variance'
  target_key TEXT NOT NULL,  -- e.g. 'Revenue', 'SaaS Subscriptions', 'revenue_kpi'
  content TEXT NOT NULL,
  mentioned_user_ids UUID[] DEFAULT '{}',
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fpa_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view FPA comments"
  ON public.fpa_comments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create FPA comments"
  ON public.fpa_comments FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = user_id);

CREATE POLICY "Authors can update their own comments"
  ON public.fpa_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authors and admins can delete comments"
  ON public.fpa_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_fpa_comments_updated_at
  BEFORE UPDATE ON public.fpa_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FPA Annotations: sticky notes on charts/KPIs
CREATE TABLE public.fpa_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  target_type TEXT NOT NULL, -- 'chart', 'kpi', 'sensitivity', 'stress_test'
  target_key TEXT NOT NULL,
  content TEXT NOT NULL,
  color TEXT DEFAULT 'default', -- 'default', 'warning', 'success', 'destructive'
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fpa_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view annotations"
  ON public.fpa_annotations FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create annotations"
  ON public.fpa_annotations FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = user_id);

CREATE POLICY "Authors can update annotations"
  ON public.fpa_annotations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authors and admins can delete annotations"
  ON public.fpa_annotations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_fpa_annotations_updated_at
  BEFORE UPDATE ON public.fpa_annotations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FPA Variance Reviews: flag and review significant variances
CREATE TABLE public.fpa_variance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  flagged_by UUID NOT NULL,
  assigned_to UUID,
  account_name TEXT NOT NULL,
  variance_amount NUMERIC NOT NULL,
  variance_pct NUMERIC NOT NULL,
  comparison_mode TEXT NOT NULL, -- 'budget', 'forecast', 'prior_year'
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_review', 'approved', 'dismissed'
  notes TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fpa_variance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view variance reviews"
  ON public.fpa_variance_reviews FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create variance reviews"
  ON public.fpa_variance_reviews FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = flagged_by);

CREATE POLICY "Assigned or admin can update variance reviews"
  ON public.fpa_variance_reviews FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = flagged_by OR public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_fpa_variance_reviews_updated_at
  BEFORE UPDATE ON public.fpa_variance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FPA Budget Approvals: multi-level approval workflow
CREATE TABLE public.fpa_budget_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  submitted_by UUID NOT NULL,
  approval_type TEXT NOT NULL, -- 'budget_change', 'forecast_update', 'reclass'
  title TEXT NOT NULL,
  description TEXT,
  affected_accounts TEXT[] DEFAULT '{}',
  amount_impact NUMERIC,
  current_level TEXT NOT NULL DEFAULT 'analyst', -- 'analyst', 'manager', 'admin'
  current_approver UUID,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'withdrawn'
  analyst_approved_by UUID,
  analyst_approved_at TIMESTAMPTZ,
  manager_approved_by UUID,
  manager_approved_at TIMESTAMPTZ,
  admin_approved_by UUID,
  admin_approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fpa_budget_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view budget approvals"
  ON public.fpa_budget_approvals FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create budget approvals"
  ON public.fpa_budget_approvals FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id) AND auth.uid() = submitted_by);

CREATE POLICY "Approvers and admins can update budget approvals"
  ON public.fpa_budget_approvals FOR UPDATE TO authenticated
  USING (auth.uid() = current_approver OR auth.uid() = submitted_by OR public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_fpa_budget_approvals_updated_at
  BEFORE UPDATE ON public.fpa_budget_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
