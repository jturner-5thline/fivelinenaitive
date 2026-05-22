import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ArrowRight, Plus, Edit, Check, Loader2, CheckCircle, RefreshCw, AlertTriangle, FileText, ExternalLink, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { getStageDisplayName } from '@/lib/copilot-utils';
import { useCopilotStore } from '@/stores/copilotStore';
import { CopilotTaskConfirm } from './CopilotTaskConfirm';
import { renderTextWithEntityLinks } from './EntityLink';
import {
  deriveFieldDiffs,
  computeFieldStatuses,
  formatFieldValue,
  type FieldDiff,
  type FieldStatus,
  type VerifiedResult,
} from './copilotFieldDiff';

interface ConfirmAction {
  action: 'confirm';
  action_type: string;
  description: string;
  params: Record<string, any>;
}

interface Props {
  action: ConfirmAction;
}

export interface CopilotActionConfirmHandle {
  confirm: () => Promise<void>;
  cancel: () => void;
  getStatus: () => 'pending' | 'loading' | 'done' | 'cancelled' | 'failed';
  getLabel: () => string;
  getActionType: () => string;
}

const iconMap: Record<string, typeof ArrowRight> = {
  update_deal_stage: ArrowRight,
  update_deal_status: AlertTriangle,
  move_deal_pipeline: ArrowRight,
  create_task: Plus,
  update_milestone: CheckCircle,
  update_lender_status: RefreshCw,
  delete_outstanding_item: Edit,
  update_deal_fields: Edit,
  add_deal_note: FileText,
  log_note: FileText,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LenderEntity = {
  display_name: string;
  master_lender_id: string | null;
  candidates?: Array<{ id: string; name: string }>;
};

function isLenderAddAction(actionType: string) {
  return actionType === 'add_lender_to_deal' || actionType === 'add_lenders_to_deal';
}

function normalizeLenderEntities(params: Record<string, any>): LenderEntity[] {
  const rawEntities = Array.isArray(params.entities) ? params.entities : [];
  if (rawEntities.length > 0) {
    return rawEntities
      .map((entity: any) => ({
        display_name: String(entity?.display_name || entity?.lender_name || '').trim(),
        master_lender_id:
          typeof entity?.master_lender_id === 'string' && UUID_RE.test(entity.master_lender_id)
            ? entity.master_lender_id
            : null,
        candidates: Array.isArray(entity?.candidates)
          ? entity.candidates
              .map((c: any) => ({ id: String(c?.id || ''), name: String(c?.name || '') }))
              .filter((c: any) => c.id && c.name)
          : undefined,
      }))
      .filter((entity) => entity.display_name);
  }

  const lenderNames = Array.isArray(params.lender_names)
    ? params.lender_names
    : params.lender_name
      ? [params.lender_name]
      : [];

  return lenderNames
    .map((name: unknown) => ({ display_name: String(name || '').trim(), master_lender_id: null }))
    .filter((entity) => entity.display_name);
}

// Common acronym → expansion map for lender names. When an input
// token matches a key, the value tokens are required (all-of) for
// the alias bonus, letting "Wells Fargo TMT" resolve to
// "Wells Fargo Technology, Media & Telecom Group".
const LENDER_ACRONYMS: Record<string, string[]> = {
  tmt: ['technology', 'media', 'telecom'],
  cre: ['commercial', 'real', 'estate'],
  abl: ['asset', 'based', 'lending'],
  sba: ['small', 'business', 'administration'],
};

function normalizeLenderName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[*()\-_/.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLenderInput(displayName: string): { primary: string; alias: string | null } {
  // "CIT (First Citizens)" → primary="CIT", alias="First Citizens"
  const m = displayName.match(/^([^(]+)\(([^)]+)\)\s*$/);
  if (m) return { primary: m[1].trim(), alias: m[2].trim() };
  return { primary: displayName.trim(), alias: null };
}

async function resolveMasterLenderEntities(params: Record<string, any>): Promise<LenderEntity[]> {
  const entities = normalizeLenderEntities(params);
  return Promise.all(
    entities.map(async (entity) => {
      if (entity.master_lender_id) return entity;

      const { primary, alias } = parseLenderInput(entity.display_name);
      const cleanPrimary = primary.replace(/[%_]/g, '').trim();
      if (!cleanPrimary) return entity;

      // Broad candidate pool: search on the first significant token
      // so abbreviations like "Wells Fargo TMT" still surface
      // "Wells Fargo Technology, Media & Telecom Group".
      const firstToken = cleanPrimary.split(/\s+/)[0];
      const { data } = await supabase
        .from('master_lenders')
        .select('id, name')
        .ilike('name', `%${firstToken}%`)
        .limit(50);

      const rows = ((data || []) as Array<{ id: string; name: string }>).filter(r => r.name);
      if (rows.length === 0) return { ...entity, candidates: [] };

      const normInput = normalizeLenderName(cleanPrimary);
      const normAlias = alias ? normalizeLenderName(alias) : null;
      const inputTokens = normInput.split(/\s+/).filter(t => t.length >= 2);
      const expansionTokens = inputTokens
        .filter(t => LENDER_ACRONYMS[t])
        .flatMap(t => LENDER_ACRONYMS[t]);

      const scored = rows.map(r => {
        const n = normalizeLenderName(r.name);
        let score = 0;
        // (a) exact normalized match
        if (n === normInput) score += 100;
        // (b) prefix / contains
        if (n.startsWith(normInput)) score += 25;
        if (n.includes(normInput)) score += 10;
        // per-token containment
        for (const t of inputTokens) {
          if (t === firstToken.toLowerCase()) continue;
          if (n.includes(t)) score += 10;
        }
        // (c) acronym expansion — every expansion token must appear
        if (expansionTokens.length > 0 && expansionTokens.every(e => n.includes(e))) {
          score += 60;
        }
        // (d) parent-company / acquirer alias from parens
        if (normAlias && n.includes(normAlias)) score += 50;
        return { row: r, score, n };
      }).sort((a, b) => b.score - a.score || a.row.name.length - b.row.name.length);

      // Deduplicate by normalized name (master_lenders has duplicate
      // rows with the same display name) — keep first/best per name.
      const seenName = new Set<string>();
      const unique = scored.filter(s => {
        if (s.score <= 0) return false;
        if (seenName.has(s.n)) return false;
        seenName.add(s.n);
        return true;
      });

      const top = unique[0];
      const second = unique[1];
      // Auto-resolve when (1) top is an exact match, (2) only one
      // unique candidate survives, or (3) the top score is meaningfully
      // higher than the runner-up (alias / acronym hit).
      const canAutoResolve =
        !!top &&
        (
          top.score >= 100 ||
          unique.length === 1 ||
          (!!second && top.score - second.score >= 30)
        );

      if (canAutoResolve) {
        return {
          display_name: top.row.name,
          master_lender_id: top.row.id,
        };
      }

      return {
        ...entity,
        candidates: unique.slice(0, 8).map(s => ({ id: s.row.id, name: s.row.name })),
      };
    }),
  );
}

export const CopilotActionConfirm = forwardRef<CopilotActionConfirmHandle, Props>(function CopilotActionConfirm({ action }, ref) {
  // Unified human-approval card for all AI-proposed task drafts
  // (personal, deal-linked, and delegated all flow through here).
  if (action.action_type === 'create_task') {
    return <CopilotTaskConfirm action={action as any} />;
  }

  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled' | 'failed'>('pending');
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [resolvedDealId, setResolvedDealId] = useState<string | null>(null);
  const [preparedAction, setPreparedAction] = useState<ConfirmAction>(action);
  const [isPreparingAction, setIsPreparingAction] = useState<boolean>(isLenderAddAction(action.action_type));
  // Store the raw verified-write response so the field table can render
  // per-field status badges after Confirm (✅ / ⚠️ / ❌). The backend
  // attaches `error_code` and `mismatches` for WriteNotPersistedError
  // failures so we can mark only the offending fields red instead of
  // the whole card.
  const [verifiedResult, setVerifiedResult] = useState<VerifiedResult | null>(null);
  const [relativeTick, setRelativeTick] = useState(0);
  const queryClient = useQueryClient();
  const addMutation = useCopilotStore(s => s.addMutation);

  const Icon = iconMap[action.action_type] || Edit;

  // Fix 5: Format the description with display names
  const formattedDescription = action.description.replace(
    /"([a-z][a-z0-9-]*)"/g,
    (match, slug) => {
      const display = getStageDisplayName(slug);
      return display !== slug ? `"${display}"` : match;
    }
  );

  // Convert [Name](entity://type/id) tokens emitted by the AI into
  // clickable in-app links so entity references inside approval card
  // titles match the rest of the chat surface.
  const renderedDescription = renderTextWithEntityLinks(formattedDescription);

  // Field-by-field diff is rebuilt from the action's params and never
  // collapses into a one-line summary — that's the whole point of
  // this card.
  const fieldDiffs: FieldDiff[] = deriveFieldDiffs(preparedAction.action_type, preparedAction.params || {});
  const fieldStatuses = computeFieldStatuses(
    preparedAction.action_type,
    fieldDiffs,
    status === 'done' || status === 'failed' ? verifiedResult : null,
  );
  const isUpdateLikeAction = fieldDiffs.some((d) => d.oldValue !== undefined);

  useEffect(() => {
    let cancelled = false;

    if (!isLenderAddAction(action.action_type)) {
      setPreparedAction(action);
      setIsPreparingAction(false);
      return;
    }

    setIsPreparingAction(true);

    resolveMasterLenderEntities(action.params || {})
      .then((entities) => {
        if (cancelled) return;
        const nextParams = {
          ...action.params,
          entities,
          lender_names: entities.map((entity) => entity.display_name),
          lender_name: entities[0]?.display_name || action.params?.lender_name,
        };
        setPreparedAction({ ...action, params: nextParams });
      })
      .catch(() => {
        if (!cancelled) setPreparedAction(action);
      })
      .finally(() => {
        if (!cancelled) setIsPreparingAction(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action]);

  // Re-render the "Updated Xs ago" label on a steady tick so the
  // timestamp on the Done card stays accurate without a heavy interval.
  useEffect(() => {
    if (status !== 'done') return;
    const id = window.setInterval(() => setRelativeTick(t => t + 1), 5000);
    return () => window.clearInterval(id);
  }, [status]);

  const relativeTime = (ms: number | null) => {
    if (!ms) return '';
    void relativeTick;
    const secs = Math.max(1, Math.round((Date.now() - ms) / 1000));
    if (secs < 60) return `${secs} second${secs === 1 ? '' : 's'} ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  };

  const invalidateRelatedQueries = (actionType: string, params: Record<string, any>) => {
    const dealId = params.deal_id;

    // Always invalidate deals list
    queryClient.invalidateQueries({ queryKey: ['deals'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-kanban'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    switch (actionType) {
      case 'update_deal_stage':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        // Dispatch custom event for non-React-Query state (DealsContext)
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'update_deal_status':
      case 'add_deal_note':
      case 'log_note':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'create_task':
        queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'update_milestone':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
          queryClient.invalidateQueries({ queryKey: ['expected-milestones'] });
        }
        // Milestones use local state, need custom event
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'update_lender_status':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'delete_outstanding_item':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'update_deal_fields':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;

      case 'move_deal_pipeline':
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        }
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        queryClient.invalidateQueries({ queryKey: ['pipelines'] });
        window.dispatchEvent(new CustomEvent('copilot-action-completed', { detail: { actionType, params } }));
        break;
    }
  };

  const fireDealUpdated = (dealId: string | undefined, fields: Record<string, any>) => {
    if (!dealId) return;
    window.dispatchEvent(
      new CustomEvent('deal.updated', { detail: { deal_id: dealId, fields } })
    );
  };

  const runUndo = async (dealId: string, dealName: string | undefined, before: Record<string, any>) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const undoAction = {
        action: 'confirm' as const,
        action_type: 'update_deal_fields',
        description: `Revert changes on ${dealName || 'deal'}`,
        params: { deal_id: dealId, deal_name: dealName, ...before },
      };
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: undoAction }),
      });
      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Undo failed');
      toast.success('Reverted');
      invalidateRelatedQueries('update_deal_fields', { deal_id: dealId });
      fireDealUpdated(dealId, before);
    } catch (err: any) {
      toast.error(`Undo failed: ${err.message || 'unknown error'}`);
    }
  };

  const buildUnresolvedLenderError = () => {
    const entities = normalizeLenderEntities(preparedAction.params || {});
    const unresolved = entities.filter((entity) => !entity.master_lender_id);
    if (unresolved.length === 0) return null;
    return `Could not resolve ${unresolved.map((entity) => entity.display_name).join(', ')} to a lender record. Please pick from the disambiguation list.`;
  };

  const handleConfirm = async () => {
    setStatus('loading');
    setErrorMessage(null);
    setVerifiedResult(null);
    try {
      const unresolvedError = isLenderAddAction(preparedAction.action_type) ? buildUnresolvedLenderError() : null;
      if (import.meta.env.DEV && isLenderAddAction(preparedAction.action_type)) {
        // Debug-only: surface the resolved entities[] payload right before
        // the Confirm fetch fires so we can verify master_lender_id values
        // are populated and not display-name strings.
        // eslint-disable-next-line no-console
        console.log('[Copilot] add_lenders_to_deal entities payload →', {
          action_type: preparedAction.action_type,
          entities: normalizeLenderEntities(preparedAction.params || {}),
          deal_id: preparedAction.params?.deal_id,
        });
      }
      if (unresolvedError) {
        const entityResults = normalizeLenderEntities(preparedAction.params || {}).map((entity) => ({
          display_name: entity.display_name,
          master_lender_id: entity.master_lender_id,
          status: entity.master_lender_id ? ('activity-only' as const) : ('mismatch' as const),
          reason: entity.master_lender_id ? 'not_submitted' : 'invalid_lender_id',
        }));
        setVerifiedResult({ success: false, error: unresolvedError, entity_results: entityResults });
        throw new Error(unresolvedError);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: preparedAction }),
      });

      // Only flip to "done" once the backend acknowledges a 2xx response
      // AND returns success:true. Any non-2xx or error payload routes to
      // the failed state instead of an optimistic green.
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`Backend error (${resp.status}): ${text.slice(0, 160) || resp.statusText}`);
      }
      const result = await resp.json();
      // Keep the response so the field table can render per-field
      // badges in both the success and failure branches.
      setVerifiedResult(result as VerifiedResult);
      if (result.success) {
        const dealId = result.params?.deal_id || preparedAction.params?.deal_id;
        const dealName = result.params?.deal_name || preparedAction.params?.deal_name;
        setStatus('done');
        setCompletedAt(Date.now());
        setAuditId(result.audit?.id ?? null);
        setResolvedDealId(dealId ?? null);
        // Fix 6: Track mutation in conversation state
        addMutation({
          type: preparedAction.action_type,
          deal: preparedAction.params.deal_name || preparedAction.params.deal_id,
          dealId: preparedAction.params.deal_id,
          detail: result.message || preparedAction.description,
          timestamp: new Date().toISOString(),
        });
        // Trigger UI refresh
        invalidateRelatedQueries(result.actionType || preparedAction.action_type, result.params || preparedAction.params);
        // Global event for any non-React-Query consumers
        fireDealUpdated(dealId, result.audit?.after || preparedAction.params || {});

        // Toast with View deal + Undo (10s window)
        const before = result.audit?.before as Record<string, any> | undefined;
        const canUndo = !!(before && dealId && Object.keys(before).length > 0);
        toast.success(`${dealName || 'Deal'} updated`, {
          duration: 10000,
          action: canUndo
            ? {
                label: 'Undo',
                onClick: () => runUndo(dealId, dealName, before!),
              }
            : dealId
              ? { label: 'View deal', onClick: () => { navigate(`/deal/${dealId}`); } }
              : undefined,
        });
      } else {
        // Build an Error that preserves the structured fields so the
        // failed-state branch can render per-field mismatch badges.
        const e = new Error(result.error || 'Action failed') as Error & {
          error_code?: string;
          mismatches?: VerifiedResult['mismatches'];
        };
        e.error_code = result.error_code;
        e.mismatches = result.mismatches;
        throw e;
      }
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(err.message || 'Failed to execute action');
      toast.error(err.message || 'Failed to execute action');
      throw err;
    }
  };

  useImperativeHandle(ref, () => ({
    confirm: handleConfirm,
    cancel: () => setStatus('cancelled'),
    getStatus: () => status,
      getLabel: () => formattedDescription,
      getActionType: () => preparedAction.action_type,
  }));

  if (status === 'done') {
    const dealId = resolvedDealId || action.params?.deal_id;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={16} style={{ color: 'rgb(34, 197, 94)' }} />
          <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)' }}>Done — {renderedDescription}</span>
        </div>
        <FieldDiffTable
          diffs={fieldDiffs}
          statuses={fieldStatuses}
          showOldValues={isUpdateLikeAction}
          tone="done"
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingLeft: 24,
            fontSize: 11,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          {dealId && (
            <Link
              to={`/deals/${dealId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'rgb(34, 197, 94)',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={11} /> View deal
            </Link>
          )}
          {dealId && (
            <Link
              to={`/deals/${dealId}?tab=activity${auditId ? `&audit=${auditId}` : ''}`}
              title="Open audit log entry"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 6px',
                borderRadius: 6,
                border: '1px solid rgba(34, 197, 94, 0.35)',
                background: 'rgba(34, 197, 94, 0.10)',
                color: 'rgb(34, 197, 94)',
                textDecoration: 'none',
                fontSize: 10,
              }}
            >
              Activity logged
            </Link>
          )}
          {completedAt && <span>Updated {relativeTime(completedAt)}</span>}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.30)',
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertCircle size={16} style={{ color: 'rgb(239, 68, 68)', marginTop: 1 }} />
          <div style={{ fontSize: 13, color: 'rgb(239, 68, 68)' }}>
            <div style={{ fontWeight: 500 }}>✗ Failed — {renderedDescription}</div>
            {errorMessage && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(239, 68, 68, 0.85)' }}>
                {errorMessage}
              </div>
            )}
            {verifiedResult?.entity_results?.length ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                {verifiedResult.entity_results.map((entity, index) => (
                  <div key={`${entity.display_name}-${index}`}>
                    {entity.status === 'verified' ? '✅' : entity.status === 'activity-only' ? '⚠️' : '❌'} {entity.display_name}
                    {entity.reason ? ` (${entity.status === 'mismatch' ? `failed: ${entity.reason}` : entity.reason})` : ` (${entity.status})`}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <FieldDiffTable
          diffs={fieldDiffs}
          statuses={fieldStatuses}
          showOldValues={isUpdateLikeAction}
          tone="failed"
        />
        <div style={{ display: 'flex', gap: 8, paddingLeft: 24 }}>
          <button
            onClick={handleConfirm}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 6,
              background: 'rgb(239, 68, 68)',
              color: 'white',
              border: 'none',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <RefreshCw size={12} /> Retry
          </button>
          <button
            onClick={() => setStatus('cancelled')}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: 'rgb(239, 68, 68)',
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <X size={12} /> Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div style={{ marginTop: 8, fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
        Cancelled
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(126,184,247,0.06)',
        border: '1px solid rgba(126,184,247,0.22)',
        borderRadius: 8,
        padding: '12px 16px',
        marginTop: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={16} style={{ color: 'hsl(var(--primary))' }} />
        <span style={{ fontSize: 13, color: 'var(--foreground)' }}>{renderedDescription}</span>
      </div>
      {isPreparingAction && (
        <div style={{ marginBottom: 10, fontSize: 12, color: 'hsl(var(--muted-foreground))', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={12} className="animate-spin" /> Resolving lenders…
        </div>
      )}
      {(() => {
        if (isPreparingAction) return null;
        if (!isLenderAddAction(preparedAction.action_type)) return null;
        const unresolved = normalizeLenderEntities(preparedAction.params || {}).filter((e) => !e.master_lender_id);
        if (unresolved.length === 0) return null;
        return (
          <div
            role="alert"
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 6,
              background: 'rgba(234, 179, 8, 0.10)',
              border: '1px solid rgba(234, 179, 8, 0.35)',
              color: 'rgb(234, 179, 8)',
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            Could not resolve {unresolved.map((u) => u.display_name).join(', ')} to a lender record. Please pick from the disambiguation list.
          </div>
        );
      })()}
      <FieldDiffTable
        diffs={fieldDiffs}
        statuses={fieldStatuses}
        showOldValues={isUpdateLikeAction}
        tone="pending"
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleConfirm}
          disabled={
            status === 'loading' ||
            isPreparingAction ||
            (isLenderAddAction(preparedAction.action_type) &&
              normalizeLenderEntities(preparedAction.params || {}).some((e) => !e.master_lender_id))
          }
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            background: 'hsl(var(--primary))',
            color: 'white',
            border: 'none',
            fontSize: 13,
            fontWeight: 500,
            cursor: status === 'loading' || isPreparingAction ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            opacity:
              isLenderAddAction(preparedAction.action_type) &&
              normalizeLenderEntities(preparedAction.params || {}).some((e) => !e.master_lender_id)
                ? 0.5
                : 1,
          }}
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : null}
          Confirm
        </button>
        <button
          onClick={() => setStatus('cancelled')}
          disabled={status === 'loading'}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            background: 'transparent',
            color: 'hsl(var(--muted-foreground))',
            border: '1px solid var(--glass-border)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});

// ─── Field-by-field diff table ─────────────────────────────────────
//
// Renders every field the action will write (or just wrote) as a
// dedicated row: name, old value (for updates), new value, and a
// per-field status badge in the post-Confirm states. We never
// collapse fields into a one-line summary — the table is always
// shown when there's at least one field to display.

const STATUS_BADGE: Record<FieldStatus, { label: string; color: string; bg: string; border: string }> = {
  pending: {
    label: '— pending',
    color: 'hsl(var(--muted-foreground))',
    bg: 'transparent',
    border: 'var(--glass-border)',
  },
  verified: {
    label: '✅ verified',
    color: 'rgb(34, 197, 94)',
    bg: 'rgba(34, 197, 94, 0.10)',
    border: 'rgba(34, 197, 94, 0.35)',
  },
  'activity-only': {
    label: '⚠️ activity-logged only',
    color: 'rgb(234, 179, 8)',
    bg: 'rgba(234, 179, 8, 0.10)',
    border: 'rgba(234, 179, 8, 0.35)',
  },
  mismatch: {
    label: '❌ did not persist',
    color: 'rgb(239, 68, 68)',
    bg: 'rgba(239, 68, 68, 0.10)',
    border: 'rgba(239, 68, 68, 0.40)',
  },
};

function FieldDiffTable({
  diffs,
  statuses,
  showOldValues,
  tone,
}: {
  diffs: FieldDiff[];
  statuses: Record<string, FieldStatus>;
  showOldValues: boolean;
  tone: 'pending' | 'done' | 'failed';
}) {
  if (!diffs.length) return null;

  const headerColor = 'hsl(var(--muted-foreground))';
  const rowBorder =
    tone === 'done'
      ? 'rgba(34, 197, 94, 0.18)'
      : tone === 'failed'
        ? 'rgba(239, 68, 68, 0.20)'
        : 'var(--glass-border)';

  return (
    <div
      role="table"
      aria-label="Fields this action will write"
      style={{
        marginTop: tone === 'pending' ? 4 : 8,
        marginBottom: tone === 'pending' ? 12 : 0,
        marginLeft: tone === 'pending' ? 0 : 24,
        border: `1px solid ${rowBorder}`,
        borderRadius: 6,
        overflow: 'hidden',
        fontSize: 12,
      }}
    >
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: showOldValues ? '1.2fr 1.2fr 1.4fr 1.2fr' : '1.4fr 2fr 1.2fr',
          gap: 8,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.02)',
          fontSize: 11,
          fontWeight: 500,
          color: headerColor,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        <div role="columnheader">Field</div>
        {showOldValues && <div role="columnheader">From</div>}
        <div role="columnheader">{showOldValues ? 'To' : 'Value'}</div>
        <div role="columnheader" style={{ textAlign: 'right' }}>
          Status
        </div>
      </div>
      {diffs.map((d, i) => {
        const st = statuses[d.field] ?? 'pending';
        const badge = STATUS_BADGE[st];
        return (
          <div
            key={`${d.field}-${i}`}
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: showOldValues ? '1.2fr 1.2fr 1.4fr 1.2fr' : '1.4fr 2fr 1.2fr',
              gap: 8,
              padding: '8px 10px',
              borderTop: `1px solid ${rowBorder}`,
              alignItems: 'center',
              background: st === 'mismatch' ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
            }}
          >
            <div role="cell" style={{ color: 'var(--foreground)', fontWeight: 500 }}>
              {d.label}
            </div>
            {showOldValues && (
              <div
                role="cell"
                style={{
                  color: 'hsl(var(--muted-foreground))',
                  textDecoration: st === 'verified' ? 'line-through' : undefined,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={formatFieldValue(d.oldValue)}
              >
                {formatFieldValue(d.oldValue)}
              </div>
            )}
            <div
              role="cell"
              style={{
                color: 'var(--foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={formatFieldValue(d.newValue)}
            >
              {formatFieldValue(d.newValue)}
            </div>
            <div role="cell" style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: badge.color,
                  background: badge.bg,
                  border: `1px solid ${badge.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {badge.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
