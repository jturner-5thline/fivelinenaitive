import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getStageMilestones,
  subscribeToStageMilestoneConfig,
  NaitiveMilestoneDef,
} from '@/config/naitiveStageMilestones';
import { toast } from 'sonner';

export interface NaitiveMilestoneRecord {
  id: string;
  deal_id: string;
  stage: string;
  milestone_key: string;
  completed: boolean;
  completed_at: string | null;
}

export interface DealStageMilestone extends NaitiveMilestoneDef {
  completed: boolean;
  recordId?: string;
}

/**
 * Hook to manage naitive pipeline stage milestones for a set of deals.
 * Fetches all milestone records for given deal IDs and provides toggle functionality.
 */
export function useNaitiveStageMilestones(
  dealIds: string[],
  options?: { onDealStageChanged?: () => void },
) {
  const [records, setRecords] = useState<NaitiveMilestoneRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    return subscribeToStageMilestoneConfig(() => setConfigVersion((v) => v + 1));
  }, []);

  const fetchMilestones = useCallback(async () => {
    if (dealIds.length === 0) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('naitive_stage_milestones')
      .select('*')
      .in('deal_id', dealIds);

    if (error) {
      console.error('Error fetching naitive milestones:', error);
    } else {
      setRecords((data || []) as NaitiveMilestoneRecord[]);
    }
    setIsLoading(false);
  }, [dealIds.join(',')]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const getMilestonesForDeal = useCallback(
    (dealId: string, stage: string): DealStageMilestone[] => {
      const defs = getStageMilestones(stage);
      if (defs.length === 0) return [];

      return defs.map((def) => {
        const rec = records.find(
          (r) => r.deal_id === dealId && r.stage === stage && r.milestone_key === def.key
        );
        return {
          ...def,
          completed: rec?.completed || false,
          recordId: rec?.id,
        };
      });
    },
    [records, configVersion]
  );

  const toggleMilestone = useCallback(
    async (dealId: string, stage: string, milestoneKey: string) => {
      const existing = records.find(
        (r) => r.deal_id === dealId && r.stage === stage && r.milestone_key === milestoneKey
      );
      const def = getStageMilestones(stage).find((d) => d.key === milestoneKey);
      const willBeCompleted = existing ? !existing.completed : true;

      if (existing) {
        const newCompleted = !existing.completed;
        // Optimistic update
        setRecords((prev) =>
          prev.map((r) =>
            r.id === existing.id
              ? { ...r, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
              : r
          )
        );

        const { error } = await supabase
          .from('naitive_stage_milestones')
          .update({
            completed: newCompleted,
            completed_at: newCompleted ? new Date().toISOString() : null,
          })
          .eq('id', existing.id);

        if (error) {
          console.error('Error updating milestone:', error);
          // Revert
          setRecords((prev) =>
            prev.map((r) => (r.id === existing.id ? existing : r))
          );
          return;
        }
      } else {
        // Insert new record as completed
        const tempId = crypto.randomUUID();
        const newRec: NaitiveMilestoneRecord = {
          id: tempId,
          deal_id: dealId,
          stage,
          milestone_key: milestoneKey,
          completed: true,
          completed_at: new Date().toISOString(),
        };
        setRecords((prev) => [...prev, newRec]);

        const { data, error } = await supabase
          .from('naitive_stage_milestones')
          .insert({
            deal_id: dealId,
            stage,
            milestone_key: milestoneKey,
            completed: true,
            completed_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) {
          console.error('Error inserting milestone:', error);
          setRecords((prev) => prev.filter((r) => r.id !== tempId));
          return;
        } else if (data) {
          setRecords((prev) =>
            prev.map((r) => (r.id === tempId ? { ...r, id: data.id } : r))
          );
        }
      }

      // Apply outcome routing: if milestone is now completed and has an
      // outcomeTargetStage, move the deal to that stage automatically.
      if (willBeCompleted && def?.outcomeTargetStage && def.outcomeTargetStage !== stage) {
        const { error: stageErr } = await supabase
          .from('deals')
          .update({ stage: def.outcomeTargetStage, updated_at: new Date().toISOString() })
          .eq('id', dealId);
        if (stageErr) {
          console.error('Error applying milestone outcome:', stageErr);
          toast.error('Milestone saved, but failed to update deal stage');
        } else {
          toast.success(`Deal moved (${def.label})`);
          options?.onDealStageChanged?.();
        }
      }
    },
    [records, options]
  );

  return { records, isLoading, getMilestonesForDeal, toggleMilestone, refetch: fetchMilestones };
}
