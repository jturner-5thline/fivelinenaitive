
-- =============================================
-- Feature 4: Help Center + Support
-- =============================================

-- Help articles with full-text search
CREATE TABLE public.help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  search_vector TSVECTOR,
  view_count INTEGER DEFAULT 0,
  helpful_count INTEGER DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_help_articles_search ON public.help_articles USING GIN (search_vector);
CREATE INDEX idx_help_articles_category ON public.help_articles (category, status);
CREATE INDEX idx_help_articles_slug ON public.help_articles (slug);

-- Auto-update search vector
CREATE OR REPLACE FUNCTION public.update_help_article_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.category, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '') || ' ' ||
    coalesce(regexp_replace(NEW.body_html, '<[^>]+>', ' ', 'g'), '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_help_article_search
  BEFORE INSERT OR UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_help_article_search_vector();

CREATE TRIGGER update_help_articles_updated_at
  BEFORE UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Support tickets
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requester_user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  assigned_to_user_id UUID,
  source TEXT DEFAULT 'in_app',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_tickets_company ON public.support_tickets (company_id, status);
CREATE INDEX idx_support_tickets_requester ON public.support_tickets (requester_user_id, status);

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ticket comments
CREATE TABLE public.support_ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_id UUID,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ticket_comments_ticket ON public.support_ticket_comments (ticket_id, created_at);

-- =============================================
-- RLS Policies
-- =============================================

-- Help articles: published ones are readable by all authenticated users
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read published articles"
  ON public.help_articles FOR SELECT TO authenticated
  USING (status = 'published' OR public.is_5thline_user(auth.uid()));

CREATE POLICY "5thline users can manage articles"
  ON public.help_articles FOR ALL TO authenticated
  USING (public.is_5thline_user(auth.uid()))
  WITH CHECK (public.is_5thline_user(auth.uid()));

-- Support tickets: requester and company admins can view
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tickets"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR public.is_company_admin(auth.uid(), company_id)
    OR public.is_5thline_user(auth.uid())
  );

CREATE POLICY "Users can create tickets"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (requester_user_id = auth.uid());

CREATE POLICY "Admins can update tickets"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (
    requester_user_id = auth.uid()
    OR public.is_company_admin(auth.uid(), company_id)
    OR public.is_5thline_user(auth.uid())
  );

-- Ticket comments
ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ticket participants can view comments"
  ON public.support_ticket_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id = ticket_id
      AND (st.requester_user_id = auth.uid()
           OR public.is_company_admin(auth.uid(), st.company_id)
           OR public.is_5thline_user(auth.uid()))
  ));

CREATE POLICY "Authenticated users can add comments"
  ON public.support_ticket_comments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id = ticket_id
      AND (st.requester_user_id = auth.uid()
           OR public.is_company_admin(auth.uid(), st.company_id)
           OR public.is_5thline_user(auth.uid()))
  ));
