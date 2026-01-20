import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { WorkflowData, WorkflowAction, TriggerType } from '@/components/workflows/WorkflowBuilder';

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export function useWorkflowVersions(workflowId?: string) {
  const { user } = useAuth();
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchVersions = useCallback(async (wfId?: string) => {
    const targetId = wfId || workflowId;
    if (!user || !targetId) {
      setVersions([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('workflow_versions')
        .select('*')
        .eq('workflow_id', targetId)
        .order('version_number', { ascending: false });

      if (error) throw error;

      const transformedData: WorkflowVersion[] = (data || []).map(v => ({
        id: v.id,
        workflow_id: v.workflow_id,
        version_number: v.version_number,
        name: v.name,
        description: v.description,
        is_active: v.is_active,
        trigger_type: v.trigger_type as TriggerType,
        trigger_config: v.trigger_config as Record<string, any>,
        actions: (v.actions as unknown) as WorkflowAction[],
        change_summary: v.change_summary,
        created_by: v.created_by,
        created_at: v.created_at,
      }));

      setVersions(transformedData);
    } catch (error) {
      console.error('Error fetching workflow versions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, workflowId]);

  const createVersion = async (
    wfId: string,
    data: WorkflowData,
    changeSummary?: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      // Get the latest version number
      const { data: latestVersion, error: fetchError } = await supabase
        .from('workflow_versions')
        .select('version_number')
        .eq('workflow_id', wfId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const nextVersion = (latestVersion?.version_number || 0) + 1;

      const { error } = await supabase
        .from('workflow_versions')
        .insert({
          workflow_id: wfId,
          version_number: nextVersion,
          name: data.name,
          description: data.description || null,
          is_active: data.isActive,
          trigger_type: data.triggerType,
          trigger_config: data.triggerConfig,
          actions: data.actions as any,
          change_summary: changeSummary || null,
          created_by: user.id,
        });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error creating workflow version:', error);
      return false;
    }
  };

  const rollbackToVersion = async (version: WorkflowVersion): Promise<WorkflowData | null> => {
    if (!user) return null;

    try {
      // Return the version data to be used for updating the workflow
      const data: WorkflowData = {
        name: version.name,
        description: version.description || '',
        isActive: version.is_active,
        triggerType: version.trigger_type,
        triggerConfig: version.trigger_config,
        actions: version.actions,
      };

      toast.success(`Loaded version ${version.version_number}. Save to apply changes.`);
      return data;
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
    rollbackToVersion,
  };
}
