import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { WorkflowAction, TriggerType } from '@/components/workflows/WorkflowBuilder';

export interface TemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  name: string;
  description: string | null;
  category: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
  tags: string[];
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export function useTemplateVersions(templateId?: string) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVersions = useCallback(async (tplId?: string) => {
    const targetId = tplId || templateId;
    if (!user || !targetId) {
      setVersions([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('template_versions')
        .select('*')
        .eq('template_id', targetId)
        .order('version_number', { ascending: false });

      if (error) throw error;

      const transformedData: TemplateVersion[] = (data || []).map(v => ({
        id: v.id,
        template_id: v.template_id,
        version_number: v.version_number,
        name: v.name,
        description: v.description,
        category: v.category,
        trigger_type: v.trigger_type as TriggerType,
        trigger_config: v.trigger_config as Record<string, any>,
        actions: (v.actions as unknown) as WorkflowAction[],
        tags: v.tags || [],
        change_summary: v.change_summary,
        created_by: v.created_by,
        created_at: v.created_at,
      }));

      setVersions(transformedData);
    } catch (error) {
      console.error('Error fetching template versions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, templateId]);

  const createVersion = async (
    tplId: string,
    data: {
      name: string;
      description?: string | null;
      category: string;
      trigger_type: TriggerType;
      trigger_config: Record<string, any>;
      actions: WorkflowAction[];
      tags?: string[];
    },
    changeSummary?: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data: latestVersion, error: fetchError } = await supabase
        .from('template_versions')
        .select('version_number')
        .eq('template_id', tplId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const nextVersion = (latestVersion?.version_number || 0) + 1;

      const { error } = await supabase
        .from('template_versions')
        .insert({
          template_id: tplId,
          version_number: nextVersion,
          name: data.name,
          description: data.description || null,
          category: data.category,
          trigger_type: data.trigger_type,
          trigger_config: data.trigger_config,
          actions: data.actions as any,
          tags: data.tags || [],
          change_summary: changeSummary || null,
          created_by: user.id,
        });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error creating template version:', error);
      return false;
    }
  };

  const restoreVersion = async (version: TemplateVersion): Promise<{
    name: string;
    description: string | null;
    category: string;
    trigger_type: TriggerType;
    trigger_config: Record<string, any>;
    actions: WorkflowAction[];
    tags: string[];
  } | null> => {
    if (!user) return null;

    try {
      toast.success(`Loaded version ${version.version_number}. Save to apply changes.`);
      return {
        name: version.name,
        description: version.description,
        category: version.category,
        trigger_type: version.trigger_type,
        trigger_config: version.trigger_config,
        actions: version.actions,
        tags: version.tags,
      };
    } catch (error) {
      console.error('Error loading version:', error);
      toast.error('Failed to load version');
      return null;
    }
  };

  return {
    versions,
    isLoading,
    fetchVersions,
    createVersion,
    restoreVersion,
  };
}
