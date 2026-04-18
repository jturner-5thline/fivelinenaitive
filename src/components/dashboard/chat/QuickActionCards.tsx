import { Clock, Users, AlertTriangle, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onAction: (prompt: string, requiresInput: boolean) => void;
}

const actions = [
  {
    icon: Clock,
    label: 'What are we waiting on?',
    description: 'Outstanding items by deal',
    prompt: 'What are we waiting on?',
    requiresInput: false,
    iconClass: 'text-amber-400',
    iconBg: 'bg-amber-400/10 ring-1 ring-amber-400/20',
  },
  {
    icon: Users,
    label: 'Who are our most active lenders?',
    description: 'Most-sent and most-active lenders',
    prompt: 'Who are our most active lenders?',
    requiresInput: false,
    iconClass: 'text-emerald-400',
    iconBg: 'bg-emerald-400/10 ring-1 ring-emerald-400/20',
  },
  {
    icon: AlertTriangle,
    label: 'Stale Deals Analysis',
    description: 'Deals at risk of going stale',
    prompt: 'Stale Deals Analysis',
    requiresInput: false,
    iconClass: 'text-rose-400',
    iconBg: 'bg-rose-400/10 ring-1 ring-rose-400/20',
  },
  {
    icon: ListChecks,
    label: 'To-Do List',
    description: 'Your assigned tasks and priorities',
    prompt: 'To-Do List',
    requiresInput: false,
    iconClass: 'text-sky-400',
    iconBg: 'bg-sky-400/10 ring-1 ring-sky-400/20',
  },
];

export function QuickActionCards({ onAction }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt, action.requiresInput)}
          className={cn(
            'group flex items-start gap-3 p-3 rounded-xl text-left',
            'border border-border/40 bg-card/40 backdrop-blur-sm',
            'transition-all duration-200',
            'hover:border-border/70 hover:bg-card/70 hover:shadow-md hover:-translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
          )}
        >
          <div
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
              action.iconBg
            )}
          >
            <action.icon className={cn('h-4 w-4', action.iconClass)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-foreground leading-tight truncate">
              {action.label}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground leading-tight truncate">
              {action.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
