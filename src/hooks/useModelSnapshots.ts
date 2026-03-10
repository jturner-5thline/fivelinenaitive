import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SaaSModelData, SensitivityScenario, LenderConfig } from '../components/deal/saas-model/types';

export interface ModelSnapshot {
  id: string;
  deal_id: string;
  user_id: string;
  label: string;
  description: string | null;
  model_data: SaaSModelData;
  sensitivity_data: SensitivityScenario[] | null;
  lender_data: LenderConfig[] | null;
  created_at: string;
}

export function useModelSnapshots(dealId: string) {
  const [snapshots, setSnapshots] = useState<ModelSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('model_snapshots' as any)
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSnapshots((data as any[]) || []);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const createSnapshot = useCallback(async (
    model: SaaSModelData,
    scenarios: SensitivityScenario[],
    lenders: LenderConfig[],
    label: string,
    description?: string
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sign in to save snapshots'); return null; }

    const { data, error } = await supabase
      .from('model_snapshots' as any)
      .insert({
        deal_id: dealId,
        user_id: user.id,
        label,
        description: description || null,
        model_data: model,
        sensitivity_data: scenarios,
        lender_data: lenders,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to save snapshot');
      return null;
    }
    toast.success(`Snapshot "${label}" saved`);
    await load();
    return data as unknown as ModelSnapshot;
  }, [dealId, load]);

  const deleteSnapshot = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('model_snapshots' as any)
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete snapshot');
      return;
    }
    toast.success('Snapshot deleted');
    await load();
  }, [load]);

  return { snapshots, isLoading, createSnapshot, deleteSnapshot, refresh: load };
}
