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
  { id: 'draft-terms', name: 'Draft Terms', weeks: 3, order: 1 },
  { id: 'terms-review', name: 'Terms Review & Signing', weeks: 3, order: 2 },
  { id: 'diligence-closing', name: 'Diligence & Closing', weeks: 8, order: 3 },
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

  // Undo/redo history
  const historyRef = useRef<Record<string, DealPipelineConfig>[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((snapshot: Record<string, DealPipelineConfig>) => {
    if (skipHistoryRef.current) return;
    // Trim any forward history
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(snapshot)));
    historyIndexRef.current = historyRef.current.length - 1;
    // Limit history to 50 entries
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
  }, []);

  const setConfigsWithHistory = useCallback((updater: (prev: Record<string, DealPipelineConfig>) => Record<string, DealPipelineConfig>) => {
    setConfigs(prev => {
      const next = updater(prev);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const [undoRedoTick, setUndoRedoTick] = useState(0); // force re-render for canUndo/canRedo

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
      // Initialize undo history with fetched state
      historyRef.current = [JSON.parse(JSON.stringify(map))];
      historyIndexRef.current = 0;
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
    setConfigsWithHistory(prev => {
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
  }, [saveConfig, setConfigsWithHistory]);

  const updateStartDate = useCallback((dealId: string, newDate: string) => {
    setConfigsWithHistory(prev => {
      const cfg = prev[dealId];
      if (!cfg) return prev;
      const updated = { ...cfg, startDate: newDate };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig, setConfigsWithHistory]);

  const updateStageName = useCallback((dealId: string, stageId: string, newName: string) => {
    setConfigsWithHistory(prev => {
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
  }, [saveConfig, setConfigsWithHistory]);

  const addStage = useCallback((dealId: string) => {
    setConfigsWithHistory(prev => {
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
  }, [saveConfig, setConfigsWithHistory]);

  const removeStage = useCallback((dealId: string, stageId: string) => {
    setConfigsWithHistory(prev => {
      const cfg = prev[dealId];
      if (!cfg || cfg.stages.length <= 1) return prev;
      const updated = {
        ...cfg,
        stages: cfg.stages.filter(s => s.id !== stageId).map((s, i) => ({ ...s, order: i + 1 })),
      };
      saveConfig(updated);
      return { ...prev, [dealId]: updated };
    });
  }, [saveConfig, setConfigsWithHistory]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snapshot = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
    skipHistoryRef.current = true;
    setConfigs(snapshot);
    skipHistoryRef.current = false;
    setUndoRedoTick(t => t + 1);
    // Save all changed configs
    Object.values(snapshot).forEach((cfg: any) => saveConfig(cfg));
  }, [saveConfig]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snapshot = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
    skipHistoryRef.current = true;
    setConfigs(snapshot);
    skipHistoryRef.current = false;
    setUndoRedoTick(t => t + 1);
    Object.values(snapshot).forEach((cfg: any) => saveConfig(cfg));
  }, [saveConfig]);

  return {
    configs, isLoading, updateStageWeeks, updateStartDate, updateStageName, addStage, removeStage,
    undo, redo,
    canUndo: historyIndexRef.current > 0,
    canRedo: historyIndexRef.current < historyRef.current.length - 1,
    undoRedoTick,
  };
}
