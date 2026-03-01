import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataHealthProps {
  lastSyncMinutes?: number;
  completenessPercent?: number;
  connectorCount?: number;
  healthyConnectors?: number;
}

export function DataHealthIndicator({
  lastSyncMinutes = 2,
  completenessPercent = 94,
  connectorCount = 4,
  healthyConnectors = 4,
}: DataHealthProps) {
  const freshness = lastSyncMinutes < 5 ? 'fresh' : lastSyncMinutes < 30 ? 'stale' : 'old';
  const completeness = completenessPercent >= 90 ? 'good' : completenessPercent >= 70 ? 'partial' : 'incomplete';

  const freshnessConfig = {
    fresh: { color: 'text-emerald-500', bg: 'bg-emerald-500', label: `${lastSyncMinutes}m ago` },
    stale: { color: 'text-amber-500', bg: 'bg-amber-500', label: `${lastSyncMinutes}m ago` },
    old: { color: 'text-destructive', bg: 'bg-destructive', label: `${lastSyncMinutes}m ago` },
  };

  const completenessConfig = {
    good: { color: 'text-emerald-500', icon: <CheckCircle2 className="h-3 w-3" /> },
    partial: { color: 'text-amber-500', icon: <AlertTriangle className="h-3 w-3" /> },
    incomplete: { color: 'text-destructive', icon: <AlertTriangle className="h-3 w-3" /> },
  };

  return (
    <div className="flex items-center gap-3">
      {/* Freshness */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", freshnessConfig[freshness].bg)} />
            <Clock className={cn("h-3 w-3", freshnessConfig[freshness].color)} />
            <span className="text-[10px] text-muted-foreground">{freshnessConfig[freshness].label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p className="font-medium">Data Freshness</p>
          <p className="text-muted-foreground">Last synced {lastSyncMinutes} minutes ago</p>
        </TooltipContent>
      </Tooltip>

      {/* Completeness */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <span className={completenessConfig[completeness].color}>
              {completenessConfig[completeness].icon}
            </span>
            <span className="text-[10px] text-muted-foreground">{completenessPercent}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p className="font-medium">Data Completeness</p>
          <p className="text-muted-foreground">{completenessPercent}% of expected data fields populated</p>
        </TooltipContent>
      </Tooltip>

      {/* Connectors */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[9px] gap-1 cursor-default">
            <Activity className="h-2.5 w-2.5" />
            {healthyConnectors}/{connectorCount}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          <p className="font-medium">Connector Health</p>
          <p className="text-muted-foreground">{healthyConnectors} of {connectorCount} connectors healthy</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
