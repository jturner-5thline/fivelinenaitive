import { useState } from 'react';
import { ArrowRight, Plus, Edit, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConfirmAction {
  action: 'confirm';
  action_type: string;
  description: string;
  params: Record<string, any>;
}

interface Props {
  action: ConfirmAction;
}

const iconMap: Record<string, typeof ArrowRight> = {
  update_deal_stage: ArrowRight,
  create_task: Plus,
};

export function CopilotActionConfirm({ action }: Props) {
  const [status, setStatus] = useState<'pending' | 'loading' | 'done' | 'cancelled'>('pending');

  const Icon = iconMap[action.action_type] || Edit;

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
        toast.success(result.message || 'Action completed');
      } else {
        throw new Error(result.error || 'Action failed');
      }
    } catch (err: any) {
      setStatus('pending');
      toast.error(err.message || 'Failed to execute action');
    }
  };

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
        <span style={{ fontSize: 13, color: 'rgb(34, 197, 94)' }}>Done — {action.description}</span>
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
        <span style={{ fontSize: 13, color: 'var(--foreground)' }}>{action.description}</span>
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
}
