// React hook driving a single chained AI agent run end-to-end.
//
// Lifecycle:
//   1. start(prompt, context)        → creates run + steps in DB (planning)
//   2. approvePlan()                  → runs reads + non-write steps; pauses at first write needing approval
//   3. approveStep(stepId, override?) → resume after per-write approval
//   4. rejectStep(stepId)             → skip a write step and resume
//   5. cancel()                       → mark run cancelled
//
// All edge-function calls go through `agent-orchestrator`. RLS on the
// underlying tables makes sure the user only sees their own runs.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AgentRunStatus =
  | 'planning'
  | 'awaiting_plan_approval'
  | 'running'
  | 'awaiting_write_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentStepStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped';

export type AgentTool =
  | 'gmail_search'
  | 'deal_lookup'
  | 'data_room_search'
  | 'gmail_draft_reply'
  | 'task_create'
  | 'activity_post';

export interface AgentRun {
  id: string;
  user_id: string;
  prompt: string;
  status: AgentRunStatus;
  plan_summary: string | null;
  final_summary: string | null;
  context: Record<string, any>;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AgentStep {
  id: string;
  run_id: string;
  step_index: number;
  kind: 'read' | 'write';
  tool: AgentTool;
  title: string;
  args: Record<string, any>;
  requires_approval: boolean;
  status: AgentStepStatus;
  output: any;
  output_summary: string | null;
  error: string | null;
}

interface State {
  run: AgentRun | null;
  steps: AgentStep[];
  loading: boolean;
  error: string | null;
}

export function useAgentRun(initialRunId?: string | null) {
  const [state, setState] = useState<State>({
    run: null,
    steps: [],
    loading: !!initialRunId,
    error: null,
  });

  // Hydrate an existing run (e.g., when re-opening from chat history).
  useEffect(() => {
    if (!initialRunId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: run }, { data: steps }] = await Promise.all([
          supabase.from('ai_agent_runs').select('*').eq('id', initialRunId).maybeSingle(),
          supabase.from('ai_agent_run_steps').select('*').eq('run_id', initialRunId).order('step_index'),
        ]);
        if (cancelled) return;
        setState({
          run: (run as AgentRun) || null,
          steps: (steps as AgentStep[]) || [],
          loading: false,
          error: run ? null : 'Agent run not found',
        });
      } catch (e: any) {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: e?.message || 'Failed to load run' }));
      }
    })();
    return () => { cancelled = true; };
  }, [initialRunId]);

  const invoke = useCallback(async (body: Record<string, any>) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke('agent-orchestrator', { body });
      if (error) throw new Error(error.message || 'Agent call failed');
      if (!data?.ok) throw new Error((data as any)?.error || 'Agent call failed');
      setState({
        run: (data.run as AgentRun) || null,
        steps: (data.steps as AgentStep[]) || [],
        loading: false,
        error: null,
      });
      return data;
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e?.message || 'Agent call failed' }));
      throw e;
    }
  }, []);

  const start = useCallback((prompt: string, context: Record<string, any> = {}) =>
    invoke({ action: 'start', prompt, context }), [invoke]);

  const approvePlan = useCallback(() => {
    const runId = state.run?.id;
    if (!runId) throw new Error('No active run');
    return invoke({ action: 'approve_plan', run_id: runId });
  }, [invoke, state.run?.id]);

  const approveStep = useCallback((stepId: string, argsOverride?: Record<string, any>) => {
    const runId = state.run?.id;
    if (!runId) throw new Error('No active run');
    return invoke({
      action: 'approve_step', run_id: runId, step_id: stepId,
      decision: 'approve', args_override: argsOverride,
    });
  }, [invoke, state.run?.id]);

  const rejectStep = useCallback((stepId: string) => {
    const runId = state.run?.id;
    if (!runId) throw new Error('No active run');
    return invoke({ action: 'approve_step', run_id: runId, step_id: stepId, decision: 'reject' });
  }, [invoke, state.run?.id]);

  const cancel = useCallback(async () => {
    const runId = state.run?.id;
    if (!runId) return;
    await invoke({ action: 'cancel', run_id: runId });
  }, [invoke, state.run?.id]);

  return {
    ...state,
    start,
    approvePlan,
    approveStep,
    rejectStep,
    cancel,
  };
}
