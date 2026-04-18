import { Clock, Users, AlertTriangle, ListChecks, Zap } from 'lucide-react';
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
    color: 'text-amber-400',
  },
  {
    icon: Users,
    label: 'Who are our most active lenders?',
    description: 'Most-sent and most-active lenders',
    prompt: 'Who are our most active lenders?',
    requiresInput: false,
    color: 'text-emerald-400',
  },
  {
    icon: AlertTriangle,
    label: 'Stale Deals Analysis',
    description: 'Deals at risk of going stale',
    prompt: 'Stale Deals Analysis',
    requiresInput: false,
    color: 'text-rose-400',
  },
  {
    icon: ListChecks,
    label: 'To-Do List',
    description: 'Your assigned tasks and priorities',
    prompt: 'To-Do List',
    requiresInput: false,
    color: 'text-blue-400',
  },
];

export function QuickActionCards({ onAction }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt, action.requiresInput)}
          className={cn(
            'flex flex-col items-start gap-1 p-2.5 rounded-lg text-left transition-all duration-200',
            'border-0 bg-muted/10',
            'hover:bg-primary/5 hover:shadow-sm',
            'group'
          )}
        >
          <div className="flex items-center gap-1.5">
            <action.icon className={cn('h-3.5 w-3.5', action.color)} />
            <span className="text-xs font-medium">{action.label}</span>
            <Zap className="h-2.5 w-2.5 text-muted-foreground/40" />
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {action.description}
          </span>
        </button>
      ))}
    </div>
  );
}
