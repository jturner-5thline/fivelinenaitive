import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WorkflowRunResult {
  actionId: string;
  type: string;
  success: boolean;
  message: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  trigger_data: Record<string, any>;
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed';
  results: WorkflowRunResult[];
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export function useWorkflowRuns(workflowId?: string) {
  const { user } = useAuth();
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    if (!user) {
      setRuns([]);
      setIsLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('workflow_runs')
        .select(`
          *,
          workflows:workflow_id (name)
        `)
        .order('started_at', { ascending: false })
        .limit(50);

      if (workflowId) {
        query = query.eq('workflow_id', workflowId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transformedData: WorkflowRun[] = (data || []).map(run => ({
        id: run.id,
        workflow_id: run.workflow_id,
        workflow_name: (run.workflows as any)?.name || 'Unknown Workflow',
        trigger_data: run.trigger_data as Record<string, any>,
        status: run.status as WorkflowRun['status'],
        results: (run.results as unknown) as WorkflowRunResult[],
        error_message: run.error_message,
        started_at: run.started_at,
        completed_at: run.completed_at,
      }));

      setRuns(transformedData);
    } catch (error) {
      console.error('Error fetching workflow runs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, workflowId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return {
    runs,
    isLoading,
    refetch: fetchRuns,
  };
}
