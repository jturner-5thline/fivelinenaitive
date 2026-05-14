import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export type MilestoneTimingType = 'from_creation' | 'after_previous' | 'from_stage_entry';

export interface DefaultMilestone {
  id: string;
  title: string;
  daysFromCreation: number | null;
  timingType: MilestoneTimingType;
  position: number;
  triggerStage?: string | null;
  daysFromStage?: number | null;
}

interface DefaultMilestonesContextType {
  defaultMilestones: DefaultMilestone[];
  isLoading: boolean;
  addDefaultMilestone: (milestone: Omit<DefaultMilestone, 'id' | 'position'>) => Promise<void>;
  updateDefaultMilestone: (id: string, updates: Partial<Omit<DefaultMilestone, 'id'>>) => Promise<void>;
  deleteDefaultMilestone: (id: string) => Promise<void>;
  reorderDefaultMilestones: (milestones: DefaultMilestone[]) => Promise<void>;
}

const DefaultMilestonesContext = createContext<DefaultMilestonesContextType | undefined>(undefined);

function mapRow(row: any): DefaultMilestone {
  return {
    id: row.id,
    title: row.title,
    daysFromCreation: row.days_from_creation,
    timingType: (row.timing_type as MilestoneTimingType) || 'from_creation',
    position: row.position,
    triggerStage: row.trigger_stage ?? null,
    daysFromStage: row.days_from_stage ?? null,
  };
}

export function DefaultMilestonesProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const [defaultMilestones, setDefaultMilestones] = useState<DefaultMilestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const companyId = company?.id;

  const fetchMilestones = useCallback(async () => {
    if (!companyId) {
      setDefaultMilestones([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('default_milestones' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('position', { ascending: true });

      if (error) throw error;
      setDefaultMilestones((data || []).map(mapRow));
    } catch (error) {
      console.error('Failed to load default milestones:', error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  const addDefaultMilestone = async (milestone: Omit<DefaultMilestone, 'id' | 'position'>) => {
    if (!companyId) return;

    const maxPosition = defaultMilestones.length > 0
      ? Math.max(...defaultMilestones.map(m => m.position))
      : -1;

    const { error } = await supabase
      .from('default_milestones' as any)
      .insert({
        company_id: companyId,
        title: milestone.title,
        days_from_creation: milestone.daysFromCreation,
        timing_type: milestone.timingType || 'from_creation',
        position: maxPosition + 1,
        trigger_stage: milestone.triggerStage ?? null,
        days_from_stage: milestone.daysFromStage ?? null,
      });

    if (error) {
      console.error('Failed to add milestone:', error);
      return;
    }
    await fetchMilestones();
  };

  const updateDefaultMilestone = async (id: string, updates: Partial<Omit<DefaultMilestone, 'id'>>) => {
    const dbUpdates: Record<string, any> = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.daysFromCreation !== undefined) dbUpdates.days_from_creation = updates.daysFromCreation;
    if (updates.timingType !== undefined) dbUpdates.timing_type = updates.timingType;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.triggerStage !== undefined) dbUpdates.trigger_stage = updates.triggerStage;
    if (updates.daysFromStage !== undefined) dbUpdates.days_from_stage = updates.daysFromStage;

    const { error } = await supabase
      .from('default_milestones' as any)
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Failed to update milestone:', error);
      return;
    }
    await fetchMilestones();
  };

  const deleteDefaultMilestone = async (id: string) => {
    const { error } = await supabase
      .from('default_milestones' as any)
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete milestone:', error);
      return;
    }
    await fetchMilestones();
  };

  const reorderDefaultMilestones = async (milestones: DefaultMilestone[]) => {
    // Optimistic update
    setDefaultMilestones(milestones.map((m, i) => ({ ...m, position: i })));

    // Batch update positions
    const updates = milestones.map((m, index) =>
      supabase
        .from('default_milestones' as any)
        .update({ position: index })
        .eq('id', m.id)
    );

    try {
      await Promise.all(updates);
    } catch (error) {
      console.error('Failed to reorder milestones:', error);
      await fetchMilestones(); // Revert on error
    }
  };

  return (
    <DefaultMilestonesContext.Provider
      value={{
        defaultMilestones,
        isLoading,
        addDefaultMilestone,
        updateDefaultMilestone,
        deleteDefaultMilestone,
        reorderDefaultMilestones,
      }}
    >
      {children}
    </DefaultMilestonesContext.Provider>
  );
}

export function useDefaultMilestones() {
  const context = useContext(DefaultMilestonesContext);
  if (!context) {
    throw new Error('useDefaultMilestones must be used within a DefaultMilestonesProvider');
  }
  return context;
}
