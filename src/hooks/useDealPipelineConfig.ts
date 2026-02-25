import { useState, useEffect, useCallback, useRef } from 'react';
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

/**
 * Hook for a single deal's pipeline config.
 */
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

/**
 * Bulk-fetch pipeline configs for multiple deals at once.
 */
export function useMultiDealPipelineConfigs(dealIds: string[], dealCreatedAtMap: Record<string, string>) {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<Record<string, DealPipelineConfig>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (dealIds.length === 0) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_pipeline_configs')
        .select('*')
        .in('deal_id', dealIds);
      if (error) throw error;

      const map: Record<string, DealPipelineConfig> = {};
      for (const row of (data || [])) {
        map[row.deal_id] = {
          id: row.id,
          dealId: row.deal_id,
          startDate: row.start_date,
          stages: (row.stages as any as PipelineStage[]).sort((a, b) => a.order - b.order),
        };
      }
      // Fill defaults for deals without config
      for (const id of dealIds) {
        if (!map[id]) {
          const defaultStart = dealCreatedAtMap[id]
            ? new Date(dealCreatedAtMap[id]).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          map[id] = { dealId: id, startDate: defaultStart, stages: [...DEFAULT_STAGES] };
        }
      }
      setConfigs(map);
    } catch (err) {
      console.error('Error fetching pipeline configs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [dealIds.join(','), dealCreatedAtMap]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveConfig = useCallback(async (updatedConfig: DealPipelineConfig) => {
    if (!user?.id) return;
    const payload = {
      deal_id: updatedConfig.dealId,
      user_id: user.id,
      start_date: updatedConfig.startDate,
      stages: updatedConfig.stages as any,
    };
    try {
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
        setConfigs(prev => ({
          ...prev,
          [updatedConfig.dealId]: { ...updatedConfig, id: data.id },
        }));
        return;
      }
    } catch (err: any) {
      console.error('Error saving pipeline config:', err);
      toast.error('Failed to save timeline config');
    }
  }, [user?.id]);

  const updateStageWeeks = useCallback((dealId: string, stageId: string, delta: number) => {
    setConfigs(prev => {
      const cfg = prev[dealId];
      if (!cfg) return prev;
      const updated = {
        ...cfg,
        stages: cfg.stages.map(s =>
          s.id === stageId ? { ...s, weeks: Math.max(0, s.weeks + delta) } : s
        ),
      };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig]);

  const updateStartDate = useCallback((dealId: string, newDate: string) => {
    setConfigs(prev => {
      const cfg = prev[dealId];
      if (!cfg) return prev;
      const updated = { ...cfg, startDate: newDate };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig]);

  const updateStageName = useCallback((dealId: string, stageId: string, newName: string) => {
    setConfigs(prev => {
      const cfg = prev[dealId];
      if (!cfg) return prev;
      const updated = {
        ...cfg,
        stages: cfg.stages.map(s =>
          s.id === stageId ? { ...s, name: newName } : s
        ),
      };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig]);

  const addStage = useCallback((dealId: string) => {
    setConfigs(prev => {
      const cfg = prev[dealId];
      if (!cfg) return prev;
      const maxOrder = Math.max(0, ...cfg.stages.map(s => s.order));
      const newStage: PipelineStage = {
        id: `stage-${Date.now()}`,
        name: 'New Stage',
        weeks: 2,
        order: maxOrder + 1,
      };
      const updated = { ...cfg, stages: [...cfg.stages, newStage] };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig]);

  const removeStage = useCallback((dealId: string, stageId: string) => {
    setConfigs(prev => {
      const cfg = prev[dealId];
      if (!cfg || cfg.stages.length <= 1) return prev;
      const updated = {
        ...cfg,
        stages: cfg.stages.filter(s => s.id !== stageId).map((s, i) => ({ ...s, order: i + 1 })),
      };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig]);

  return { configs, isLoading, updateStageWeeks, updateStartDate, updateStageName, addStage, removeStage };
}
