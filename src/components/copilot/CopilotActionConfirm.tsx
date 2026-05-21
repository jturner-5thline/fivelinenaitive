import { useState, forwardRef, useImperativeHandle } from 'react';
import { ArrowRight, Plus, Edit, Check, Loader2, CheckCircle, RefreshCw, AlertTriangle, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { getStageDisplayName } from '@/lib/copilot-utils';
import { useCopilotStore } from '@/stores/copilotStore';
import { CopilotTaskConfirm } from './CopilotTaskConfirm';

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
  getStatus: () => 'pending' | 'loading' | 'done' | 'cancelled';
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

  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled'>('pending');
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

  const invalidateRelatedQueries = (actionType: string, params: Record<string, any>) => {
    const dealId = params.deal_id;

    // Always invalidate deals list
    queryClient.invalidateQueries({ queryKey: ['deals'] });

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

  const handleConfirm = async () => {
    setStatus('loading');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmAction: action }),
      });

      const result = await resp.json();
      if (result.success) {
        setStatus('done');
        toast.success(`✓ ${result.message || 'Action completed'}`);
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
      } else {
        throw new Error(result.error || 'Action failed');
      }
    } catch (err: any) {
      setStatus('pending');
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
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.25)',
          marginTop: 8,
        }}
      >
        <Check size={16} style={{ color: 'rgb(34, 197, 94)' }} />
        <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)' }}>Done — {formattedDescription}</span>
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
        <span style={{ fontSize: 13, color: 'var(--foreground)' }}>{formattedDescription}</span>
      </div>
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
