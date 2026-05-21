import { useEffect, useMemo, useState, useCallback } from 'react';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useAdminRole } from '@/hooks/useAdminRole';
import { isExcludedDealName } from '@/utils/excludedDeals';

/**
 * Canonical scope object the Copilot uses to scope every deal-related tool
 * call to the same slice of data the dashboard is currently showing.
 *
 *   workspace = active company (e.g. "5th Line", "naitive")
 *   pipeline  = the active deal pipeline within that workspace
 *   status    = active only (excludes closed/on-hold/archived) vs include_all
 */
export interface CopilotChatScope {
  /** company_id from PipelineContext, or null when explicitly broadened. */
  company_id: string | null;
  /** Active default pipeline id, or null when explicitly broadened. */
  pipeline_id: string | null;
  /** Whether to exclude closed/on-hold/archived deals. */
  active_only: boolean;
  /** Whether archived deals are included (only meaningful when active_only=false). */
  include_archived: boolean;
  /** Pretty label for the header chip: "5th Line · Active Pipeline · Active only". */
  label: string;
  /** Live count of deals visible to the AI under this scope. */
  deal_count: number;
  /** True when the user can broaden beyond their own workspace (admin only). */
  can_broaden_workspaces: boolean;
}

/** Per-tab persisted override. */
export interface CopilotScopeOverride {
  /** 'workspace' = current company, 'all' = every workspace the user can see. */
  workspace_mode: 'workspace' | 'all';
  /** 'default' = active pipeline, 'all' = every pipeline in the workspace. */
  pipeline_mode: 'default' | 'all';
  /** 'active' = exclude closed/on-hold, 'include_inactive' = +closed/on-hold,
   * 'include_archived' = also include archived. */
  status_mode: 'active' | 'include_inactive' | 'include_archived';
}

const SCOPE_STORAGE_KEY = 'naitive.copilot.chat_scope';

export const DEFAULT_SCOPE_OVERRIDE: CopilotScopeOverride = {
  workspace_mode: 'workspace',
  pipeline_mode: 'default',
  status_mode: 'active',
};

export function readScopeOverride(): CopilotScopeOverride {
  try {
    const raw = sessionStorage.getItem(SCOPE_STORAGE_KEY);
    if (!raw) return DEFAULT_SCOPE_OVERRIDE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SCOPE_OVERRIDE, ...parsed };
  } catch {
    return DEFAULT_SCOPE_OVERRIDE;
  }
}

export function writeScopeOverride(o: CopilotScopeOverride) {
  try {
    sessionStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(o));
    window.dispatchEvent(new CustomEvent('naitive:copilot-scope-changed'));
  } catch { /* ignore */ }
}

/**
 * Build the {@link CopilotChatScope} that should be sent to the edge
 * function and rendered in the chat header. Listens for cross-component
 * scope changes so every consumer stays in sync within the same tab.
 */
export function useCopilotChatScope(): {
  scope: CopilotChatScope;
  override: CopilotScopeOverride;
  setOverride: (next: Partial<CopilotScopeOverride>) => void;
} {
  const { companyId, activePipelineId, activePipeline } = usePipelineContext();
  const { deals } = useDealsContext();
  const { isAdmin } = useAdminRole();

  const [override, setOverrideState] = useState<CopilotScopeOverride>(() => readScopeOverride());

  useEffect(() => {
    const handler = () => setOverrideState(readScopeOverride());
    window.addEventListener('naitive:copilot-scope-changed', handler);
    return () => window.removeEventListener('naitive:copilot-scope-changed', handler);
  }, []);

  const setOverride = useCallback((next: Partial<CopilotScopeOverride>) => {
    const merged = { ...readScopeOverride(), ...next };
    writeScopeOverride(merged);
    setOverrideState(merged);
  }, []);

  const scope = useMemo<CopilotChatScope>(() => {
    const effectiveCompany = override.workspace_mode === 'all' && isAdmin ? null : companyId;
    const effectivePipeline = override.pipeline_mode === 'all' ? null : activePipelineId;
    const active_only = override.status_mode === 'active';
    const include_archived = override.status_mode === 'include_archived';

    // Compute deal_count from the in-memory deals list, mirroring how the
    // dashboard sees the world. Apply the same global test-deal exclusions
    // the rest of the app does so the chip number lines up with what the
    // user actually sees in the pipeline.
    const filtered = (deals || []).filter((d: any) => {
      if (isExcludedDealName(d?.name || d?.company)) return false;
      if (effectivePipeline && d?.pipelineId && d.pipelineId !== effectivePipeline) return false;
      if (active_only) {
        const status = String(d?.status || '').toLowerCase();
        if (status === 'closed' || status === 'on-hold' || status === 'archived' || status === 'closed-won' || status === 'closed-lost') {
          return false;
        }
      } else if (!include_archived) {
        if (String(d?.status || '').toLowerCase() === 'archived') return false;
      }
      return true;
    });

    const workspaceLabel = override.workspace_mode === 'all'
      ? 'All workspaces'
      : (activePipeline?.name ? '' : '') + (companyId ? 'Current workspace' : 'No workspace');
    const pipelineLabel = override.pipeline_mode === 'all'
      ? 'All pipelines'
      : (activePipeline?.name || 'Active Pipeline');
    const statusLabel =
      override.status_mode === 'active' ? 'Active only'
      : override.status_mode === 'include_inactive' ? 'Include closed & on-hold'
      : 'Include archived';

    const label = `${workspaceLabel} · ${pipelineLabel} · ${statusLabel} (${filtered.length} ${filtered.length === 1 ? 'deal' : 'deals'})`;

    return {
      company_id: effectiveCompany,
      pipeline_id: effectivePipeline,
      active_only,
      include_archived,
      label,
      deal_count: filtered.length,
      can_broaden_workspaces: !!isAdmin,
    };
  }, [override, companyId, activePipelineId, activePipeline, deals, isAdmin]);

  return { scope, override, setOverride };
}

/** Plain-data version of the scope for sending to the edge function. */
export function serializeScope(scope: CopilotChatScope) {
  return {
    company_id: scope.company_id,
    pipeline_id: scope.pipeline_id,
    active_only: scope.active_only,
    include_archived: scope.include_archived,
    label: scope.label,
    deal_count: scope.deal_count,
  };
}