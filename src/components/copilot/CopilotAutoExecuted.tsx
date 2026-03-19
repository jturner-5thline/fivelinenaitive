import { useEffect, useRef } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useCopilotStore } from '@/stores/copilotStore';

interface AutoExecutedAction {
  action: 'auto_executed';
  action_type: string;
  success: boolean;
  message: string;
  params: Record<string, any>;
}

interface Props {
  action: AutoExecutedAction;
}

export function CopilotAutoExecuted({ action }: Props) {
  const queryClient = useQueryClient();
  const addMutation = useCopilotStore(s => s.addMutation);
  const didRefresh = useRef(false);

  useEffect(() => {
    if (didRefresh.current) return;
    didRefresh.current = true;

    if (action.success) {
      toast.success(action.message);
      // Fix 6: Track mutation in conversation state
      addMutation({
        type: action.action_type,
        dealId: action.params?.deal_id,
        detail: action.message,
        timestamp: new Date().toISOString(),
      });
      // Invalidate relevant queries
      const dealId = action.params?.deal_id;
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      if (dealId) {
        queryClient.invalidateQueries({ queryKey: ['deal', dealId] });
        queryClient.invalidateQueries({ queryKey: ['expected-milestones'] });
      }
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });

      // Dispatch event for non-React-Query state
      window.dispatchEvent(new CustomEvent('copilot-action-completed', {
        detail: { actionType: action.action_type, params: action.params },
      }));
    }
  }, [action, queryClient]);

  if (!action.success) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          marginTop: 8,
        }}
      >
        <AlertCircle size={16} style={{ color: 'rgb(239, 68, 68)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'rgb(239, 68, 68)' }}>{action.message}</span>
      </div>
    );
  }

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
      <Check size={16} style={{ color: 'rgb(34, 197, 94)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)' }}>{action.message}</span>
    </div>
  );
}
