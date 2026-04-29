import { Clock, Users, AlertTriangle, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  prompt: string;
  icon: typeof Clock;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Waiting on', prompt: 'What are we waiting on?', icon: Clock },
  { label: 'Active lenders', prompt: 'Who are our most active lenders?', icon: Users },
  { label: 'Stale deals', prompt: 'Stale deals analysis', icon: AlertTriangle },
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
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(prompt)}
          disabled={isLoading}
          title={prompt}
          data-active={false}
          className={cn(
            'inline-flex items-center gap-1.5 shrink-0 rounded-full',
            'bg-muted/70 border border-border',
            'px-2.5 py-1 text-[11px] font-medium leading-none text-foreground',
            'transition-colors duration-150',
            'hover:bg-accent hover:text-accent-foreground hover:border-border',
            'active:bg-accent/80',
            'data-[active=true]:bg-accent data-[active=true]:text-accent-foreground data-[active=true]:border-border',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <Icon className="h-3 w-3 text-foreground" aria-hidden="true" />
          <span className="truncate max-w-[180px]">{label}</span>
        </button>
      ))}
    </div>
  );
}