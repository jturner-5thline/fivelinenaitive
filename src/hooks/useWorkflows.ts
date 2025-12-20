import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { WorkflowData, WorkflowAction, TriggerType } from '@/components/workflows/WorkflowBuilder';

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: Record<string, any>;
  actions: WorkflowAction[];
  created_at: string;
  updated_at: string;
}

export function useWorkflows() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWorkflows = useCallback(async () => {
    if (!user) {
      setWorkflows([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform the data to match our interface
      const transformedData: Workflow[] = (data || []).map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        is_active: w.is_active,
        trigger_type: w.trigger_type as TriggerType,
        trigger_config: w.trigger_config as Record<string, any>,
        actions: (w.actions as unknown) as WorkflowAction[],
        created_at: w.created_at,
        updated_at: w.updated_at,
      }));

      setWorkflows(transformedData);
    } catch (error) {
      console.error('Error fetching workflows:', error);
      toast.error('Failed to load workflows');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const createWorkflow = async (data: WorkflowData): Promise<Workflow | null> => {
    if (!user) return null;

    try {
      const { data: newWorkflow, error } = await supabase
        .from('workflows')
        .insert({
          user_id: user.id,
          name: data.name,
          description: data.description || null,
          is_active: data.isActive,
          trigger_type: data.triggerType,
          trigger_config: data.triggerConfig,
          actions: data.actions as any,
        })
        .select()
        .single();

      if (error) throw error;

      const transformed: Workflow = {
        id: newWorkflow.id,
        name: newWorkflow.name,
        description: newWorkflow.description,
        is_active: newWorkflow.is_active,
        trigger_type: newWorkflow.trigger_type as TriggerType,
        trigger_config: newWorkflow.trigger_config as Record<string, any>,
        actions: (newWorkflow.actions as unknown) as WorkflowAction[],
        created_at: newWorkflow.created_at,
        updated_at: newWorkflow.updated_at,
      };

      setWorkflows(prev => [transformed, ...prev]);
      toast.success('Workflow created');
      return transformed;
    } catch (error) {
      console.error('Error creating workflow:', error);
      toast.error('Failed to create workflow');
      return null;
    }
  };

  const updateWorkflow = async (id: string, data: WorkflowData): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workflows')
        .update({
          name: data.name,
          description: data.description || null,
          is_active: data.isActive,
          trigger_type: data.triggerType,
          trigger_config: data.triggerConfig,
          actions: data.actions as any,
        })
        .eq('id', id);

      if (error) throw error;

      setWorkflows(prev => prev.map(w => w.id === id ? {
        ...w,
        name: data.name,
        description: data.description || null,
        is_active: data.isActive,
        trigger_type: data.triggerType,
        trigger_config: data.triggerConfig,
        actions: data.actions,
        updated_at: new Date().toISOString(),
      } : w));

      toast.success('Workflow updated');
      return true;
    } catch (error) {
      console.error('Error updating workflow:', error);
      toast.error('Failed to update workflow');
      return false;
    }
  };

  const deleteWorkflow = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workflows')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setWorkflows(prev => prev.filter(w => w.id !== id));
      toast.success('Workflow deleted');
      return true;
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
      return false;
    }
  };

  const toggleWorkflow = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('workflows')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setWorkflows(prev => prev.map(w => w.id === id ? { ...w, is_active: isActive } : w));
      toast.success(isActive ? 'Workflow activated' : 'Workflow deactivated');
      return true;
    } catch (error) {
      console.error('Error toggling workflow:', error);
      toast.error('Failed to update workflow');
      return false;
    }
  };

  return {
    workflows,
    isLoading,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    toggleWorkflow,
    refetch: fetchWorkflows,
  };
}
