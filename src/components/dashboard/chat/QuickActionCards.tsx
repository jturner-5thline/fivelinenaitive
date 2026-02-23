import { Search, FileText, Mail, BarChart3, TrendingUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  onAction: (prompt: string) => void;
}

const actions = [
  {
    icon: Search,
    label: 'Research',
    description: 'Company or market deep-dive',
    prompt: 'Research ',
    prefill: true,
    color: 'text-blue-400',
  },
  {
    icon: Mail,
    label: 'Draft Email',
    description: 'Lender outreach or follow-up',
    prompt: 'Draft a lender outreach email for ',
    prefill: true,
    color: 'text-emerald-400',
  },
  {
    icon: FileText,
    label: 'Deal Memo',
    description: 'Generate lender-ready memo',
    prompt: 'Generate a deal memo for ',
    prefill: true,
    color: 'text-amber-400',
  },
  {
    icon: BarChart3,
    label: 'Pipeline Report',
    description: 'Analytics & conversion rates',
    prompt: 'Give me a full pipeline analytics report',
    prefill: false,
    color: 'text-purple-400',
  },
  {
    icon: TrendingUp,
    label: 'Revenue Forecast',
    description: 'Weighted pipeline forecast',
    prompt: 'What\'s my revenue forecast this quarter?',
    prefill: false,
    color: 'text-cyan-400',
  },
  {
    icon: Shield,
    label: 'Risk Assessment',
    description: 'Deal risk analysis',
    prompt: 'Run a risk assessment for ',
    prefill: true,
    color: 'text-rose-400',
  },
];

export function QuickActionCards({ onAction }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onAction(action.prompt)}
          className={cn(
            'flex flex-col items-start gap-1 p-2.5 rounded-lg text-left transition-all duration-200',
            'border border-border/30 bg-muted/10',
            'hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm',
            'group'
          )}
        >
          <div className="flex items-center gap-1.5">
            <action.icon className={cn('h-3.5 w-3.5', action.color)} />
            <span className="text-xs font-medium">{action.label}</span>
          </div>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {action.description}
          </span>
        </button>
      ))}
    </div>
  );
}
