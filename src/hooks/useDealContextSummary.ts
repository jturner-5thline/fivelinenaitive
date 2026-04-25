import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealContextSummary {
  dealId: string;
  stage: string;
  status: string;
  pipelineId?: string | null;
  daysInStage: number | null;
  stageEnteredAt: string | null;
  lastStatusNote: { note: string; createdAt: string; author: string | null } | null;
  lenderCounts: { active: number; total: number };
  outstanding: {
    openCount: number;
    mostOverdue: { description: string; dueDate: string; daysOverdue: number } | null;
  };
}

const NEUTRAL_STATUSES = new Set(['passed']);

function parseOutstandingStatus(status: string | null): { received: boolean; approved: boolean } {
  if (!status) return { received: false, approved: false };
  try {
    const p = JSON.parse(status);
    return { received: !!p.received, approved: !!p.approved };
  } catch {
    return {
      received: status === 'received' || status === 'approved' || status === 'delivered',
      approved: status === 'approved' || status === 'delivered',
    };
  }
}

/**
 * Lightweight hook that fetches the slim "Deal Context" summary surfaced in
 * the Email AI panel. Updates in real-time when `dealId` changes (i.e. user
 * switches between emails linked to different deals).
 */
export function useDealContextSummary(dealId: string | undefined) {
  const [summary, setSummary] = useState<DealContextSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!dealId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [dealRes, stageActivityRes, statusNoteRes, lendersRes, outstandingRes] = await Promise.all([
        supabase
          .from('deals')
          .select('id, stage, status, pipeline_id, updated_at, created_at')
          .eq('id', dealId)
          .maybeSingle(),
        supabase
          .from('activity_logs')
          .select('created_at, metadata, description')
          .eq('deal_id', dealId)
          .eq('activity_type', 'stage_change')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('deal_status_notes')
          .select('note, created_at, user_id')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('deal_lenders')
          .select('id, tracking_status, stage')
          .eq('deal_id', dealId),
        supabase
          .from('outstanding_items')
          .select('description, status, due_date, eta')
          .eq('deal_id', dealId),
      ]);

      const deal = dealRes.data;
      if (!deal) {
        setSummary(null);
        return;
      }

      const lastStageChange = stageActivityRes.data?.[0];
      const stageEnteredAt = lastStageChange?.created_at || deal.created_at || null;
      const daysInStage = stageEnteredAt
        ? Math.max(0, Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000))
        : null;

      let lastStatusNote: DealContextSummary['lastStatusNote'] = null;
      const note = statusNoteRes.data?.[0];
      if (note) {
        let author: string | null = null;
        if (note.user_id) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name, first_name, last_name')
            .eq('user_id', note.user_id)
            .maybeSingle();
          if (prof) {
            author = prof.display_name
              || `${prof.first_name || ''} ${prof.last_name || ''}`.trim()
              || null;
          }
        }
        lastStatusNote = { note: note.note, createdAt: note.created_at, author };
      }

      const lenders = lendersRes.data || [];
      const lenderCounts = {
        total: lenders.length,
        active: lenders.filter((l) => {
          const ts = (l.tracking_status || '').toLowerCase();
          return ts === 'active' || ts === 'on-deck' || ts === '' || (!NEUTRAL_STATUSES.has(ts) && ts !== 'passed' && ts !== 'on-hold');
        }).length,
      };
      // Tighter definition: explicitly "active"
      lenderCounts.active = lenders.filter(
        (l) => (l.tracking_status || '').toLowerCase() === 'active'
      ).length;

      const items = outstandingRes.data || [];
      const open = items.filter((i) => {
        const s = parseOutstandingStatus(i.status);
        return !s.approved;
      });
      let mostOverdue: DealContextSummary['outstanding']['mostOverdue'] = null;
      const today = Date.now();
      for (const i of open) {
        const dueIso = i.due_date || i.eta;
        if (!dueIso) continue;
        const due = new Date(dueIso).getTime();
        if (Number.isNaN(due) || due > today) continue;
        const days = Math.floor((today - due) / 86_400_000);
        if (!mostOverdue || days > mostOverdue.daysOverdue) {
          mostOverdue = { description: i.description, dueDate: dueIso, daysOverdue: days };
        }
      }

      setSummary({
        dealId: deal.id,
        stage: deal.stage || '',
        status: deal.status || 'on-track',
        pipelineId: deal.pipeline_id,
        daysInStage,
        stageEnteredAt,
        lastStatusNote,
        lenderCounts,
        outstanding: { openCount: open.length, mostOverdue },
      });
    } catch (err: any) {
      console.error('[useDealContextSummary]', err);
      setError(err?.message || 'Failed to load deal context');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { summary, loading, error, refetch: fetchSummary };
}