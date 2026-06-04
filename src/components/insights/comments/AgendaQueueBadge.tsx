import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { useReportAgendaQueue } from '@/hooks/useReportAgendaQueue';
import { AgendaQueuePanel } from './AgendaQueuePanel';

/**
 * Compact opener for the Queue panel. Shows a small badge with the current
 * queued count. NOTE: legacy "AgendaQueue*" file/symbol names are retained
 * as internal technical debt — user-facing copy says "Queue".
 */
export function AgendaQueueBadge({
  variant = 'icon',
}: { variant?: 'icon' | 'inline' }) {
  const [open, setOpen] = useState(false);
  const { counts } = useReportAgendaQueue();

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Queue"
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/50 text-[11px] font-medium text-foreground/80 hover:bg-accent/40 hover:text-foreground transition-colors"
        >
          <Inbox className="h-3 w-3" />
          Queue
          {counts.queued > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
              {counts.queued}
            </span>
          )}
        </button>
        <AgendaQueuePanel open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Queue"
        title={`Queue (${counts.queued} queued)`}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Inbox className="h-4 w-4" />
        {counts.queued > 0 && (
          <span
            style={{
              position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, padding: '0 4px',
              background: 'rgb(80,140,255)', color: 'white', borderRadius: 8, fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            }}
          >{counts.queued}</span>
        )}
      </button>
      <AgendaQueuePanel open={open} onOpenChange={setOpen} />
    </>
  );
}