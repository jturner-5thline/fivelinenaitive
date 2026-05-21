import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { ArrowRight, Plus, Edit, Check, Loader2, CheckCircle, RefreshCw, AlertTriangle, FileText, ExternalLink, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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

export const CopilotActionConfirm = forwardRef<CopilotActionConfirmHandle, Props>(function CopilotActionConfirm({ action }, ref) {
  // Unified human-approval card for all AI-proposed task drafts
  // (personal, deal-linked, and delegated all flow through here).
  if (action.action_type === 'create_task') {
    return <CopilotTaskConfirm action={action as any} />;
  }

  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled' | 'failed'>('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [resolvedDealId, setResolvedDealId] = useState<string | null>(null);
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
  const fieldDiffs: FieldDiff[] = deriveFieldDiffs(action.action_type, action.params || {});
  const fieldStatuses = computeFieldStatuses(
    action.action_type,
    fieldDiffs,
    status === 'done' || status === 'failed' ? verifiedResult : null,
  );
  const isUpdateLikeAction = fieldDiffs.some((d) => d.oldValue !== undefined);

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

  const handleConfirm = async () => {
    setStatus('loading');
    setErrorMessage(null);
    setVerifiedResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: action }),
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
        const dealId = result.params?.deal_id || action.params?.deal_id;
        const dealName = result.params?.deal_name || action.params?.deal_name;
        setStatus('done');
        setCompletedAt(Date.now());
        setAuditId(result.audit?.id ?? null);
        setResolvedDealId(dealId ?? null);
        // Fix 6: Track mutation in conversation state
        addMutation({
          type: action.action_type,
          deal: action.params.deal_name || action.params.deal_id,
          dealId: action.params.deal_id,
          detail: result.message || action.description,
          timestamp: new Date().toISOString(),
        });
        // Trigger UI refresh
        invalidateRelatedQueries(result.actionType || action.action_type, result.params || action.params);
        // Global event for any non-React-Query consumers
        fireDealUpdated(dealId, result.audit?.after || action.params || {});

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
              ? { label: 'View deal', onClick: () => { window.location.assign(`/deals/${dealId}`); } }
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
    getActionType: () => action.action_type,
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
      <FieldDiffTable
        diffs={fieldDiffs}
        statuses={fieldStatuses}
        showOldValues={isUpdateLikeAction}
        tone="pending"
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            background: 'hsl(var(--primary))',
            color: 'white',
            border: 'none',
            fontSize: 13,
            fontWeight: 500,
            cursor: status === 'loading' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
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
