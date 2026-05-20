-- Lender Matching QA harness: regression tests
CREATE TABLE IF NOT EXISTS public.lender_qa_regression_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  -- Expected to appear in the top_n results (case-insensitive lender names)
  must_include_lenders text[] NOT NULL DEFAULT '{}',
  -- Expected to NOT appear anywhere (hard-filtered or low score)
  must_exclude_lenders text[] NOT NULL DEFAULT '{}',
  top_n integer NOT NULL DEFAULT 10,
  -- Optional criteria override snapshot used when running this test
  criteria_override jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lender_qa_regression_tests_deal ON public.lender_qa_regression_tests(deal_id);

ALTER TABLE public.lender_qa_regression_tests ENABLE ROW LEVEL SECURITY;

-- Only 5th Line / naitive internal users may CRUD regression tests
CREATE POLICY "Internal users can view regression tests"
ON public.lender_qa_regression_tests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co')
  )
);

CREATE POLICY "Internal users can insert regression tests"
ON public.lender_qa_regression_tests FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co')
  )
);

CREATE POLICY "Internal users can update regression tests"
ON public.lender_qa_regression_tests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co')
  )
);

CREATE POLICY "Internal users can delete regression tests"
ON public.lender_qa_regression_tests FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co')
  )
);

CREATE TRIGGER update_lender_qa_regression_tests_updated_at
BEFORE UPDATE ON public.lender_qa_regression_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
