import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertCircle, Clock, Shield, Database, Sparkles, Users } from 'lucide-react';
import { useCompany } from '@/hooks/useCompany';

interface StatusItem {
  label: string;
  status: 'healthy' | 'warning' | 'error';
  detail: string;
  icon: React.ReactNode;
}

export function FPAStatusBar() {
  const { company } = useCompany();

  const statuses: StatusItem[] = [
    {
      label: 'Data Sync',
      status: 'healthy',
      detail: 'Last sync: 2 min ago',
      icon: <Database className="h-3 w-3" />,
    },
    {
      label: 'Connectors',
      status: 'healthy',
      detail: '4 of 4 connectors healthy',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    {
      label: 'AI Service',
      status: 'healthy',
      detail: 'AI models operational',
      icon: <Sparkles className="h-3 w-3" />,
    },
  ];

  const statusColors = {
    healthy: 'text-emerald-500',
    warning: 'text-amber-500',
    error: 'text-destructive',
  };

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {/* Org */}
      <div className="flex items-center gap-1.5 border-r border-border pr-4">
        <Users className="h-3 w-3" />
        <span className="font-medium text-foreground">{company?.name || 'Organization'}</span>
      </div>

      {/* Role */}
      <div className="flex items-center gap-1.5 border-r border-border pr-4">
        <Shield className="h-3 w-3" />
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-medium">Admin</Badge>
      </div>

      {/* Status dots */}
      {statuses.map((s) => (
        <Tooltip key={s.label}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-default">
              <span className={statusColors[s.status]}>{s.icon}</span>
              <span className="hidden xl:inline">{s.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p className="font-medium">{s.label}</p>
            <p className="text-muted-foreground">{s.detail}</p>
          </TooltipContent>
        </Tooltip>
      ))}

      {/* Last updated */}
      <div className="flex items-center gap-1 ml-auto">
        <Clock className="h-3 w-3" />
        <span>Updated just now</span>
      </div>
    </div>
  );
}
