import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StatusReportEditableContent } from '@/utils/dealExport';

/**
 * Persisted, resumable Status Report drafts (one per deal).
 * Stored in `deal_status_report_drafts`; RLS scopes rows to users who can
 * access the deal.
 */
export function useStatusReportDraft(dealId: string | undefined, enabled = true) {
  const [draft, setDraft] = useState<StatusReportEditableContent | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** True once the initial fetch for this deal has settled. */
  const [isChecked, setIsChecked] = useState(false);
  const checkedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dealId || !enabled) return;
    if (checkedForRef.current === dealId) return;
    checkedForRef.current = dealId;
    let cancelled = false;
    setIsLoading(true);
    setIsChecked(false);
    (async () => {
      const { data, error } = await (supabase as any)
        .from('deal_status_report_drafts')
        .select('content, updated_at')
        .eq('deal_id', dealId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data?.content && Object.keys(data.content).length > 0) {
        setDraft(data.content as StatusReportEditableContent);
        setSavedAt(data.updated_at ?? null);
      } else {
        setDraft(null);
        setSavedAt(null);
      }
      setIsLoading(false);
      setIsChecked(true);
    })();
    return () => { cancelled = true; };
  }, [dealId, enabled]);

  /** Allow a re-fetch the next time the modal opens. */
  const reset = useCallback(() => {
    checkedForRef.current = null;
    setIsChecked(false);
  }, []);

  const saveDraft = useCallback(
    async (content: StatusReportEditableContent): Promise<boolean> => {
      if (!dealId) return false;
      setIsSaving(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from('deal_status_report_drafts')
          .upsert(
            {
              deal_id: dealId,
              content: content as any,
              updated_by: user?.id ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'deal_id' },
          );
        if (error) throw error;
        setDraft(content);
        setSavedAt(new Date().toISOString());
        return true;
      } catch (e) {
        console.error('saveStatusReportDraft failed', e);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [dealId],
  );

  const discardDraft = useCallback(async (): Promise<boolean> => {
    if (!dealId) return false;
    const { error } = await (supabase as any)
      .from('deal_status_report_drafts')
      .delete()
      .eq('deal_id', dealId);
    if (error) {
      console.error('discardStatusReportDraft failed', error);
      return false;
    }
    setDraft(null);
    setSavedAt(null);
    return true;
  }, [dealId]);

  return { draft, savedAt, isLoading, isSaving, isChecked, saveDraft, discardDraft, reset };
}
