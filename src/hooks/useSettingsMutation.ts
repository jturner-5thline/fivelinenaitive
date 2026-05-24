import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SettingsProposal = {
  diff_id: string;
  tool_name: string;
  human_name: string;
  description?: string;
  settings_tab: string;
  target_table?: string;
  target_column?: string;
  current_value: unknown;
  proposed_value: unknown;
  args?: Record<string, unknown>;
  json_schema?: Record<string, unknown>;
  source_prompt?: string;
  requires_role?: 'company_admin';
};

export type MutationState =
  | { status: 'idle' }
  | { status: 'applying' }
  | { status: 'applied'; applied_at: number; undo_token?: string }
  | { status: 'undone' }
  | { status: 'error'; code?: number; message: string };

type ApplyArgs = {
  diff_id: string;
  tool_name: string;
  args?: Record<string, unknown>;
  proposed_value?: unknown;
  source_prompt?: string;
};

/**
 * Owns the dry-run → confirm → apply → undo state machine for the AI-bar
 * Settings Mutation flow. Server-side admin re-verification + persistence
 * happen in the edge functions `ai-settings-tool` (dry-run / proposal) and
 * `ai-settings-apply` (commit / undo). This hook is intentionally I/O-thin:
 * it does not optimistically mutate any client cache.
 */
export function useSettingsMutation(proposal: SettingsProposal) {
  const [state, setState] = useState<MutationState>({ status: 'idle' });
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const startUndoTimer = useCallback((appliedAt: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const tick = () => {
      const remaining = Math.max(0, 30 - Math.floor((Date.now() - appliedAt) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
  }, []);

  const apply = useCallback(
    async (overrides?: { args?: Record<string, unknown>; proposed_value?: unknown }) => {
      setState({ status: 'applying' });
      const payload: ApplyArgs = {
        diff_id: proposal.diff_id,
        tool_name: proposal.tool_name,
        args: overrides?.args ?? proposal.args,
        proposed_value: overrides?.proposed_value ?? proposal.proposed_value,
        source_prompt: proposal.source_prompt,
      };
      const { data, error } = await supabase.functions.invoke('ai-settings-apply', {
        body: { ...payload, undo: false },
      });
      if (error) {
        const ctx: any = (error as any).context;
        const code = ctx?.status as number | undefined;
        setState({
          status: 'error',
          code,
          message: code === 429
            ? 'Rate limit reached — try again in a few minutes.'
            : code === 403
              ? 'Admin permission required to apply this change.'
              : (error.message || 'Failed to apply change.'),
        });
        return;
      }
      const appliedAt = Date.now();
      setState({ status: 'applied', applied_at: appliedAt, undo_token: (data as any)?.undo_token });
      startUndoTimer(appliedAt);
    },
    [proposal, startUndoTimer]
  );

  const undo = useCallback(async () => {
    if (state.status !== 'applied') return;
    const { error } = await supabase.functions.invoke('ai-settings-apply', {
      body: {
        diff_id: proposal.diff_id,
        tool_name: proposal.tool_name,
        undo: true,
        undo_token: state.undo_token,
        source_prompt: proposal.source_prompt,
      },
    });
    if (error) {
      setState({ status: 'error', message: error.message || 'Failed to undo change.' });
      return;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setSecondsLeft(0);
    setState({ status: 'undone' });
  }, [proposal, state]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, secondsLeft, apply, undo, reset };
}