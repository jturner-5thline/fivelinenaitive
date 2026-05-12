import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  applyDefaultChecklistToOutstandingItems,
  type ChecklistPhase,
} from '@/utils/applyDefaultChecklist';
import { toast } from 'sonner';

interface PhaseAvailability {
  /** Items in this phase that are NOT yet on the deal (active or archived). */
  remaining: number;
  /** Items in this phase that ARE already present (not archived). */
  present: number;
  /** Items in this phase that exist on the deal but are archived. */
  archived: number;
}

export interface ChecklistPhaseControls {
  loading: boolean;
  phases: Record<ChecklistPhase, PhaseAvailability>;
  /** True for deals created post 2026-05-12 that already have phase 2 or 3 items loaded. */
  showRetroBanner: boolean;
  refresh: () => Promise<void>;
  addPhase: (phase: ChecklistPhase) => Promise<number>;
  archivePhase: (phase: ChecklistPhase) => Promise<number>;
}

const RETRO_CUTOFF = new Date('2026-05-12T00:00:00Z').getTime();

function normKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export function useChecklistPhaseControls(
  dealId: string | undefined,
  companyId: string | undefined,
  userId: string | undefined,
  dealCreatedAt: string | undefined,
  dealTypes: string[] | undefined,
  onChange?: () => void | Promise<void>,
): ChecklistPhaseControls {
  const [loading, setLoading] = useState(true);
  const [phases, setPhases] = useState<Record<ChecklistPhase, PhaseAvailability>>({
    1: { remaining: 0, present: 0, archived: 0 },
    2: { remaining: 0, present: 0, archived: 0 },
    3: { remaining: 0, present: 0, archived: 0 },
  });
  const [showRetroBanner, setShowRetroBanner] = useState(false);

  const refresh = useCallback(async () => {
    if (!dealId || !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: stdItems }, { data: dealItems }] = await Promise.all([
        supabase
          .from('data_room_checklist_items')
          .select('name, phase')
          .eq('company_id', companyId),
        supabase
          .from('outstanding_items')
          .select('description, source_metadata, is_archived')
          .eq('deal_id', dealId),
      ]);

      const presentKeys = new Set<string>();
      const archivedKeys = new Set<string>();
      const presentByPhase: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      const archivedByPhase: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

      for (const di of dealItems || []) {
        const meta = ((di as any).source_metadata || {}) as Record<string, unknown>;
        const key = (meta.source_item_key as string) || normKey((di as any).description || '');
        if ((di as any).is_archived) archivedKeys.add(key);
        else presentKeys.add(key);
        const ph = Number(meta.source_phase);
        if (ph === 1 || ph === 2 || ph === 3) {
          if ((di as any).is_archived) archivedByPhase[ph]++;
          else presentByPhase[ph]++;
        }
      }

      const remainingByPhase: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
      for (const it of stdItems || []) {
        const ph = (((it as any).phase as number | null) ?? 2) as ChecklistPhase;
        const key = normKey((it as any).name || '');
        if (!presentKeys.has(key) && !archivedKeys.has(key)) {
          remainingByPhase[ph]++;
        }
      }

      setPhases({
        1: { remaining: remainingByPhase[1], present: presentByPhase[1], archived: archivedByPhase[1] },
        2: { remaining: remainingByPhase[2], present: presentByPhase[2], archived: archivedByPhase[2] },
        3: { remaining: remainingByPhase[3], present: presentByPhase[3], archived: archivedByPhase[3] },
      });

      const createdAt = dealCreatedAt ? new Date(dealCreatedAt).getTime() : 0;
      setShowRetroBanner(
        createdAt >= RETRO_CUTOFF &&
          (presentByPhase[2] > 0 || presentByPhase[3] > 0),
      );
    } finally {
      setLoading(false);
    }
  }, [dealId, companyId, dealCreatedAt]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPhase = useCallback(
    async (phase: ChecklistPhase) => {
      if (!dealId || !companyId || !userId) return 0;
      const r = await applyDefaultChecklistToOutstandingItems(
        dealId,
        dealTypes || [],
        companyId,
        userId,
        phase,
      );
      if (r.inserted > 0) {
        toast.success(`Added ${r.inserted} Phase ${phase} item${r.inserted === 1 ? '' : 's'}`);
      } else {
        toast.message(`No new Phase ${phase} items to add`);
      }
      await refresh();
      await onChange?.();
      return r.inserted;
    },
    [dealId, companyId, userId, dealTypes, refresh, onChange],
  );

  const archivePhase = useCallback(
    async (phase: ChecklistPhase) => {
      if (!dealId) return 0;
      // Pull live items so we can match by source_phase.
      const { data } = await supabase
        .from('outstanding_items')
        .select('id, source_metadata, is_archived')
        .eq('deal_id', dealId);
      const ids = (data || [])
        .filter((d: any) => !d.is_archived && Number(d.source_metadata?.source_phase) === phase)
        .map((d: any) => d.id as string);
      if (ids.length === 0) {
        toast.message(`No Phase ${phase} items to archive`);
        return 0;
      }
      const { error } = await supabase
        .from('outstanding_items')
        .update({ is_archived: true })
        .in('id', ids);
      if (error) {
        console.error('[archivePhase] failed:', error);
        toast.error('Failed to archive items');
        return 0;
      }
      toast.success(`Archived ${ids.length} Phase ${phase} item${ids.length === 1 ? '' : 's'}`);
      await refresh();
      await onChange?.();
      return ids.length;
    },
    [dealId, refresh, onChange],
  );

  return { loading, phases, showRetroBanner, refresh, addPhase, archivePhase };
}
