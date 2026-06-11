import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DealContextSummary {
  dealId: string;
  dealName: string;
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
    /** Up to 5 currently-open items (description + due date), most overdue first. */
    openItems: Array<{ description: string; dueDate: string | null; daysOverdue: number | null; assignee: string | null }>;
  };
  /** Snapshot of headline financials sourced from Deal Space. All numbers in USD. */
  financials: {
    /** `deals.value` — engagement / capital ask. */
    dealSize: number | null;
    /** `deals.mrr`. */
    mrr: number | null;
    /** Annualized recurring revenue: prefers TTM recurring, falls back to mrr * 12. */
    arr: number | null;
    /** TTM total revenue from Deal Space financial data (recurring + non-recurring). */
    ttmRevenue: number | null;
    /** Most recent EBITDA value from Deal Space (currently inferred from financial data; null if absent). */
    ebitda: number | null;
  };
  /** Free-text "Use of Proceeds" — sourced from `deals.narrative` when populated. */
  useOfProceeds: string | null;
  /** Per-lender stage on this deal, keyed by lowercased lender name. */
  lenderStagesByName: Record<string, string>;
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
          .select('id, company, stage, status, pipeline_id, updated_at, created_at, value, mrr, narrative')
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
          .select('id, name, tracking_status, stage')
          .eq('deal_id', dealId),
        supabase
          .from('outstanding_items')
          .select('description, status, due_date, eta, assigned_to')
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
      // Resolve assignee user IDs → display names in one batch lookup.
      const assigneeIds = Array.from(
        new Set(
          open
            .map((i: any) => i.assigned_to)
            .filter((v: any): v is string => typeof v === 'string' && v.length > 0),
        ),
      );
      const assigneeMap = new Map<string, string>();
      if (assigneeIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, display_name, first_name, last_name')
          .in('user_id', assigneeIds);
        for (const p of profs || []) {
          const name = (p as any).display_name
            || `${(p as any).first_name || ''} ${(p as any).last_name || ''}`.trim()
            || null;
          if (name) assigneeMap.set((p as any).user_id, name);
        }
      }
      const enriched = open.map((i: any) => {
        const dueIso = i.due_date || i.eta || null;
        let daysOverdue: number | null = null;
        if (dueIso) {
          const due = new Date(dueIso).getTime();
          if (!Number.isNaN(due) && due <= today) {
            daysOverdue = Math.floor((today - due) / 86_400_000);
          }
        }
        const assignee = i.assigned_to ? assigneeMap.get(i.assigned_to) || null : null;
        return { description: i.description as string, dueDate: dueIso, daysOverdue, assignee };
      });
      const openItems = enriched
        .slice()
        .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1))
        .slice(0, 5);
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

      // ─── Financials snapshot (Deal Space) ─────────────────────────
      // Pull TTM recurring + non-recurring revenue from deal_financial_data.
      // We compute it best-effort — if the table is empty for this deal we
      // still fall back to deals.value and deals.mrr so the email AI always
      // has *something* concrete to reference.
      let ttmRevenue: number | null = null;
      let arrFromData: number | null = null;
      let ebitda: number | null = null;
      try {
        const since = new Date();
        since.setMonth(since.getMonth() - 12);
        const sinceYm = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}`;
        const { data: fin } = await supabase
          .from('deal_financial_data')
          .select('account_key, value, year_month')
          .eq('deal_id', dealId)
          .gte('year_month', sinceYm);
        if (fin && fin.length > 0) {
          let recurring = 0;
          let nonRecurring = 0;
          let ebitdaSum = 0;
          let ebitdaSeen = false;
          for (const row of fin) {
            const v = Number(row.value) || 0;
            const k = (row.account_key || '').toLowerCase();
            if (k === 'revenue.recurring') recurring += v;
            else if (k === 'revenue.nonrecurring') nonRecurring += v;
            else if (k.includes('ebitda')) { ebitdaSum += v; ebitdaSeen = true; }
          }
          ttmRevenue = recurring + nonRecurring || null;
          arrFromData = recurring || null;
          ebitda = ebitdaSeen ? ebitdaSum : null;
        }
      } catch (finErr) {
        console.warn('[useDealContextSummary] financial snapshot failed', finErr);
      }

      const dealSize = deal.value != null ? Number(deal.value) : null;
      const mrr = (deal as any).mrr != null ? Number((deal as any).mrr) : null;
      const arr = arrFromData ?? (mrr != null ? mrr * 12 : null);

      // Per-lender stage map (case-insensitive name → stage) so the AI panel
      // can surface the matched lender's current stage on this deal.
      const lenderStagesByName: Record<string, string> = {};
      for (const l of lenders as any[]) {
        const nm = (l?.name || '').toString().trim().toLowerCase();
        if (nm && l?.stage) lenderStagesByName[nm] = String(l.stage);
      }

      const narrativeText = ((deal as any).narrative || '').toString().trim();
      const useOfProceeds = narrativeText.length > 0 ? narrativeText : null;

      setSummary({
        dealId: deal.id,
        dealName: (deal as any).company || '',
        stage: deal.stage || '',
        status: deal.status ?? null,
        pipelineId: deal.pipeline_id,
        daysInStage,
        stageEnteredAt,
        lastStatusNote,
        lenderCounts,
        outstanding: { openCount: open.length, mostOverdue, openItems },
        financials: { dealSize, mrr, arr, ttmRevenue, ebitda },
        useOfProceeds,
        lenderStagesByName,
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