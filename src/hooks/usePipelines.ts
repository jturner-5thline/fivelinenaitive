import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DealStageOption } from '@/contexts/DealStagesContext';
import { Json } from '@/integrations/supabase/types';

export interface Pipeline {
  id: string;
  companyId: string;
  name: string;
  stages: DealStageOption[];
  isDefault: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

const parseStagesFromJson = (json: Json | null): DealStageOption[] => {
  if (!json || !Array.isArray(json)) return [];
  return json.filter((item): item is { id: string; label: string; color: string } => {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).id === 'string' &&
      typeof (item as Record<string, unknown>).label === 'string' &&
      typeof (item as Record<string, unknown>).color === 'string'
    );
  });
};

export function usePipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership?.company_id) { setIsLoading(false); return; }
      setCompanyId(membership.company_id);
    };
    init();
  }, []);

  const fetchPipelines = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('deal_pipelines')
        .select('*')
        .eq('company_id', companyId)
        .order('position', { ascending: true });

      if (error) throw error;

      const mapped: Pipeline[] = (data || []).map(p => ({
        id: p.id,
        companyId: p.company_id,
        name: p.name,
        stages: parseStagesFromJson(p.stages),
        isDefault: p.is_default,
        position: p.position,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }));
      setPipelines(mapped);
    } catch (err) {
      console.error('Error fetching pipelines:', err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchPipelines();
  }, [companyId, fetchPipelines]);

  const createPipeline = useCallback(async (name: string, stages: DealStageOption[], isDefault = false): Promise<Pipeline | null> => {
    if (!companyId) return null;
    try {
      // If setting as default, unset existing default
      if (isDefault) {
        await supabase
          .from('deal_pipelines')
          .update({ is_default: false })
          .eq('company_id', companyId)
          .eq('is_default', true);
      }

      const { data, error } = await supabase
        .from('deal_pipelines')
        .insert({
          company_id: companyId,
          name,
          stages: stages as unknown as Json,
          is_default: isDefault,
          position: pipelines.length,
        })
        .select()
        .single();

      if (error) throw error;

      const newPipeline: Pipeline = {
        id: data.id,
        companyId: data.company_id,
        name: data.name,
        stages: parseStagesFromJson(data.stages),
        isDefault: data.is_default,
        position: data.position,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
      setPipelines(prev => [...prev, newPipeline]);
      return newPipeline;
    } catch (err) {
      console.error('Error creating pipeline:', err);
      return null;
    }
  }, [companyId, pipelines.length]);

  const updatePipeline = useCallback(async (id: string, updates: { name?: string; stages?: DealStageOption[]; isDefault?: boolean }) => {
    if (!companyId) return;
    try {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.stages !== undefined) dbUpdates.stages = updates.stages as unknown as Json;
      if (updates.isDefault !== undefined) {
        dbUpdates.is_default = updates.isDefault;
        if (updates.isDefault) {
          await supabase
            .from('deal_pipelines')
            .update({ is_default: false })
            .eq('company_id', companyId)
            .eq('is_default', true);
        }
      }

      await supabase
        .from('deal_pipelines')
        .update(dbUpdates)
        .eq('id', id);

      setPipelines(prev => prev.map(p => {
        if (p.id === id) {
          return {
            ...p,
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.stages !== undefined ? { stages: updates.stages } : {}),
            ...(updates.isDefault !== undefined ? { isDefault: updates.isDefault } : {}),
          };
        }
        // If we set this one as default, unset others
        if (updates.isDefault) {
          return { ...p, isDefault: false };
        }
        return p;
      }));
    } catch (err) {
      console.error('Error updating pipeline:', err);
    }
  }, [companyId]);

  const deletePipeline = useCallback(async (id: string) => {
    try {
      await supabase.from('deal_pipelines').delete().eq('id', id);
      setPipelines(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting pipeline:', err);
    }
  }, []);

  return {
    pipelines,
    isLoading,
    companyId,
    createPipeline,
    updatePipeline,
    deletePipeline,
    refetch: fetchPipelines,
  };
}
