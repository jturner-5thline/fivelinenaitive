import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * AI classification per VDR document, mirrored from `file_ai_classifications`.
 * Subscribes to realtime so the UI flips from "Analyzing…" → "Done" automatically.
 */

export type AiCategory =
  | 'materials' | 'financials' | 'agreements' | 'kpis_metrics' | 'other' | 'uncategorized';
export type AiSensitivity = 'low' | 'medium' | 'high';
export type AiStatus = 'pending' | 'processing' | 'complete' | 'failed';

export interface FileAiClassification {
  id: string;
  deal_id: string;
  document_id: string;
  filename: string;
  status: AiStatus;
  error_message: string | null;
  detected_document_type: string | null;
  category: AiCategory | null;
  checklist_target: string | null;
  alternate_targets: string[];
  external_share_recommended: boolean | null;
  confidence: number | null;
  sensitivity: AiSensitivity | null;
  entities: Record<string, unknown>;
  summary: string | null;
  reasoning_short: string | null;
  flags: string[];
  human_reviewed: boolean;
  override_category: AiCategory | null;
  override_checklist_target: string | null;
  override_external_share: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  model: string | null;
  raw_response: Record<string, unknown> | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

/** Effective category — override takes precedence over AI suggestion. */
export function effectiveCategory(c: FileAiClassification): AiCategory | null {
  return (c.override_category ?? c.category) as AiCategory | null;
}
/** Effective checklist target — override takes precedence. */
export function effectiveChecklistTarget(c: FileAiClassification): string | null {
  return c.override_checklist_target ?? c.checklist_target ?? null;
}

export function useFileAiClassifications(dealId: string | undefined) {
  const { user } = useAuth();
  const [rows, setRows] = useState<FileAiClassification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!dealId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('file_ai_classifications')
      .select('*')
      .eq('deal_id', dealId);
    if (error) {
      console.error('useFileAiClassifications fetch error:', error);
      setRows([]);
    } else {
      setRows((data || []) as FileAiClassification[]);
    }
    setLoading(false);
  }, [dealId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Realtime — keep in sync as classify-file completes
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`file-ai-${dealId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'file_ai_classifications',
        filter: `deal_id=eq.${dealId}`,
      }, () => { fetchRows(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dealId, fetchRows]);

  /** Map document_id → classification */
  const byDocumentId = useMemo(() => {
    const m = new Map<string, FileAiClassification>();
    for (const r of rows) m.set(r.document_id, r);
    return m;
  }, [rows]);

  /** Trigger (or re-trigger) AI classification for a document. */
  const runClassification = useCallback(async (documentId: string) => {
    if (!documentId) return;
    try {
      const { error } = await supabase.functions.invoke('classify-file', {
        body: { document_id: documentId },
      });
      if (error) {
        console.error('classify-file invoke error:', error);
        toast.error('AI classification failed to start');
      }
    } catch (e) {
      console.error('classify-file invoke threw:', e);
    }
  }, []);

  /** Persist a user override (category, checklist target, share toggle). */
  const updateOverride = useCallback(async (
    documentId: string,
    patch: Partial<{
      override_category: AiCategory | null;
      override_checklist_target: string | null;
      override_external_share: boolean | null;
    }>
  ) => {
    if (!user) return;
    const { error } = await (supabase as any)
      .from('file_ai_classifications')
      .update({
        ...patch,
        human_reviewed: true,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('document_id', documentId);
    if (error) {
      console.error('updateOverride error:', error);
      toast.error('Failed to save override');
      return;
    }
    setRows(prev => prev.map(r => r.document_id === documentId
      ? { ...r, ...patch, human_reviewed: true, reviewed_by: user.id, reviewed_at: new Date().toISOString() }
      : r));
  }, [user]);

  return {
    loading,
    rows,
    byDocumentId,
    runClassification,
    updateOverride,
    refresh: fetchRows,
  };
}