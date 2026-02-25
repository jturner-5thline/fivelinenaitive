import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PipelineStage {
  id: string;
  name: string;
  weeks: number;
  order: number;
}

export interface DealPipelineConfig {
  id?: string;
  dealId: string;
  startDate: string;
  stages: PipelineStage[];
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'screen', name: 'Screening / Initial Review', weeks: 2, order: 1 },
  { id: 'ic', name: 'IC / Structuring', weeks: 2, order: 2 },
  { id: 'ts', name: 'Term Sheet / LOI', weeks: 3, order: 3 },
  { id: 'dd', name: 'Confirmatory Diligence', weeks: 6, order: 4 },
  { id: 'docs', name: 'Docs, Closing & Funding', weeks: 3, order: 5 },
];

export function useDealPipelineConfig(dealId: string | null, dealCreatedAt?: string) {
  const { user } = useAuth();
  const [config, setConfig] = useState<DealPipelineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!dealId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_pipeline_configs')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          id: data.id,
          dealId: data.deal_id,
          startDate: data.start_date,
          stages: (data.stages as any as PipelineStage[]).sort((a, b) => a.order - b.order),
        });
      } else {
        // Initialize with defaults
        const defaultStart = dealCreatedAt
          ? new Date(dealCreatedAt).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        setConfig({
          dealId,
          startDate: defaultStart,
          stages: [...DEFAULT_STAGES],
        });
      }
    } catch (err) {
      console.error('Error fetching pipeline config:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealId, dealCreatedAt]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (updatedConfig: DealPipelineConfig) => {
    if (!user?.id || !dealId) return;
    setIsSaving(true);
    try {
      const payload = {
        deal_id: dealId,
        user_id: user.id,
        start_date: updatedConfig.startDate,
        stages: updatedConfig.stages as any,
      };

      if (updatedConfig.id) {
        const { error } = await supabase
          .from('deal_pipeline_configs')
          .update(payload)
          .eq('id', updatedConfig.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_pipeline_configs')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        setConfig(prev => prev ? { ...prev, id: data.id } : prev);
      }
    } catch (err: any) {
      console.error('Error saving pipeline config:', err);
      toast.error('Failed to save timeline config');
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, dealId]);

  const updateStageWeeks = useCallback((stageId: string, delta: number) => {
    setConfig(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        stages: prev.stages.map(s =>
          s.id === stageId ? { ...s, weeks: Math.max(0, s.weeks + delta) } : s
        ),
      };
      saveConfig(updated);
      return updated;
    });
  }, [saveConfig]);

  const updateStartDate = useCallback((newDate: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      const updated = { ...prev, startDate: newDate };
      saveConfig(updated);
      return updated;
    });
  }, [saveConfig]);

  return {
    config,
    isLoading,
    isSaving,
    updateStageWeeks,
    updateStartDate,
  };
}
