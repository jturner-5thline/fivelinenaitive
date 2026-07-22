
DO $$
DECLARE
  target uuid := '4765ba06-44b9-4403-aad6-f40e27eea8ec'; -- LAGO Global Capital Management
  dups uuid[] := ARRAY['53291742-aa89-47c3-b2b6-bd7136e35d8b','93657c92-2bb9-4536-a5c4-15f794382ff0']::uuid[];
BEGIN
  -- Bypass user-defined triggers (tenant enforcement) for this one-time admin merge.
  SET LOCAL session_replication_role = 'replica';

  -- deal_lenders: delete dup rows where target already present on same deal, else repoint
  DELETE FROM public.deal_lenders dl
  WHERE dl.master_lender_id = ANY(dups)
    AND EXISTS (
      SELECT 1 FROM public.deal_lenders dl2
      WHERE dl2.deal_id = dl.deal_id AND dl2.master_lender_id = target
    );
  UPDATE public.deal_lenders
    SET master_lender_id = target, name = 'LAGO Global Capital Management'
    WHERE master_lender_id = ANY(dups);

  -- Repoint related tables (handle possible unique conflicts by deleting losers first)
  DELETE FROM public.lender_contacts lc
    WHERE lc.lender_id = ANY(dups)
      AND EXISTS (
        SELECT 1 FROM public.lender_contacts lc2
        WHERE lc2.lender_id = target
          AND lower(coalesce(lc2.email,'')) = lower(coalesce(lc.email,''))
          AND lc2.email IS NOT NULL AND lc.email IS NOT NULL
      );
  UPDATE public.lender_contacts SET lender_id = target WHERE lender_id = ANY(dups);

  UPDATE public.lender_audit_logs SET lender_id = target WHERE lender_id = ANY(dups);
  UPDATE public.lender_notes SET master_lender_id = target WHERE master_lender_id = ANY(dups);
  UPDATE public.lender_disqualifications SET master_lender_id = target WHERE master_lender_id = ANY(dups);
  UPDATE public.lender_pass_patterns SET master_lender_id = target WHERE master_lender_id = ANY(dups);
  UPDATE public.lender_fit_attributes SET master_lender_id = target WHERE master_lender_id = ANY(dups);
  UPDATE public.lender_sync_requests SET existing_lender_id = target WHERE existing_lender_id = ANY(dups);

  -- Delete the duplicate master_lenders rows
  DELETE FROM public.master_lenders WHERE id = ANY(dups);
END $$;
