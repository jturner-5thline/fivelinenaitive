import { useState } from 'react';
import { Inbox, Check } from 'lucide-react';
import { useReportAgendaQueue, type PromoteToQueueInput } from '@/hooks/useReportAgendaQueue';
import { toast } from 'sonner';

/**
 * Small "Add to Queue" button shown inside comment popovers / thread cards.
 * Deduplicates per comment so repeated clicks are safe.
 */
export function PromoteToQueueButton({
  input,
  size = 'sm',
  variant = 'ghost',
}: {
  input: () => PromoteToQueueInput;
  size?: 'sm' | 'xs';
  variant?: 'ghost' | 'solid';
}) {
  const { promote } = useReportAgendaQueue();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const result = await promote(input());
      if (result) {
        setDone(true);
        toast.success('Added to Queue');
        setTimeout(() => setDone(false), 1600);
      } else {
        toast.error("Couldn't add to queue");
      }
    } finally {
      setBusy(false);
    }
  };

  const padY = size === 'xs' ? 2 : 4;
  const padX = size === 'xs' ? 6 : 8;
  const fontSize = size === 'xs' ? 10 : 11;
  const isSolid = variant === 'solid';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Add to Queue"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: `${padY}px ${padX}px`, borderRadius: 6,
        background: isSolid ? 'rgba(80,140,255,0.85)' : 'transparent',
        color: isSolid ? 'white' : 'rgba(200,225,255,0.85)',
        border: isSolid ? 'none' : '1px solid rgba(120,170,255,0.25)',
        fontSize, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
        lineHeight: 1,
      }}
    >
      {done ? <Check size={11} /> : <Inbox size={11} />}
      {done ? 'Queued' : 'Queue'}
    </button>
  );
}