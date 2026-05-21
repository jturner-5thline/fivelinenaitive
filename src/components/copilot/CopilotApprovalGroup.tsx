import { useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CopilotActionConfirm, type CopilotActionConfirmHandle } from './CopilotActionConfirm';

interface Props {
  actions: any[];
}

/**
 * Renders a stack of inline approval cards that share the same action_type,
 * with a leading "Approve all (N)" / "Cancel all" bar. Each card retains
 * its own confirm/cancel; the bar simply drives them sequentially.
 */
export function CopilotApprovalGroup({ actions }: Props) {
  const refs = useRef<Array<CopilotActionConfirmHandle | null>>([]);
  const [running, setRunning] = useState(false);

  const handleApproveAll = async () => {
    setRunning(true);
    for (let i = 0; i < refs.current.length; i++) {
      const card = refs.current[i];
      if (!card) continue;
      if (card.getStatus() !== 'pending') continue;
      try {
        await card.confirm();
      } catch (err: any) {
        toast.error(`Failed: ${card.getLabel()}`);
        // Leave remaining cards pending per spec
        setRunning(false);
        return;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    setRunning(false);
  };

  const handleCancelAll = () => {
    refs.current.forEach((c) => {
      if (c && c.getStatus() === 'pending') c.cancel();
    });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 8,
          padding: '8px 12px',
          background: 'rgba(126,184,247,0.08)',
          border: '1px solid rgba(126,184,247,0.25)',
          borderRadius: 8,
        }}
      >
        <button
          onClick={handleApproveAll}
          disabled={running}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 6,
            background: 'hsl(var(--primary))',
            color: 'white',
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: running ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {running ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          Approve all ({actions.length})
        </button>
        <button
          onClick={handleCancelAll}
          disabled={running}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 6,
            background: 'transparent',
            color: 'hsl(var(--muted-foreground))',
            border: '1px solid var(--glass-border)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Cancel all
        </button>
      </div>
      {actions.map((a, i) => (
        <CopilotActionConfirm
          key={i}
          action={a}
          ref={(el) => {
            refs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}
