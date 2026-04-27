import { Clock, Users, AlertTriangle, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  prompt: string;
  icon: typeof Clock;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'What are we waiting on?', prompt: 'What are we waiting on?', icon: Clock },
  { label: 'Most active lenders', prompt: 'Who are our most active lenders?', icon: Users },
  { label: 'Stale deals analysis', prompt: 'Stale deals analysis', icon: AlertTriangle },
  { label: 'To-do list', prompt: 'Show me my to-do list', icon: ListTodo },
];

interface QuickActionChipsProps {
  onSelect: (prompt: string) => void;
  isLoading?: boolean;
  className?: string;
}

/**
 * Compact inline quick-action suggestions rendered just above the
 * "Ask anything" input bar. Replaces the removed full-size prompt tiles
 * so users can still launch common tasks in one click.
 */
export function QuickActionChips({ onSelect, isLoading, className }: QuickActionChipsProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      aria-label="Quick actions"
    >
      {QUICK_ACTIONS.map(({ label, prompt, icon: Icon }) => (
        <button
          key={prompt}
          type="button"
          // Prevent the textarea from losing focus before the click handler
          // fires — otherwise the chip row would unmount on blur and swallow
          // the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(prompt)}
          disabled={isLoading}
          title={prompt}
          className={cn(
            'inline-flex items-center gap-1.5 shrink-0 rounded-full border bg-card/40 backdrop-blur-sm',
            'px-2.5 py-1 text-[11px] text-foreground/90',
            'transition-all duration-150',
            'hover:bg-muted/30 hover:border-primary/40 hover:-translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Icon className="h-3 w-3 text-primary" />
          <span className="truncate max-w-[200px]">{label}</span>
        </button>
      ))}
    </div>
  );
}