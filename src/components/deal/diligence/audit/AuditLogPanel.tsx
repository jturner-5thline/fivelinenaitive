import { useState, useMemo } from 'react';
import { Clock, User, ArrowRight, Filter, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  action: 'value_changed' | 'mapping_changed' | 'extraction_run' | 'override_applied' | 'metric_recalculated' | 'source_added';
  target: string; // e.g., "EBITDA (FY2024)"
  oldValue?: string;
  newValue?: string;
  sourceFile?: string;
  details?: string;
}

interface AuditLogPanelProps {
  entries: AuditLogEntry[];
  className?: string;
}

const ACTION_CONFIG: Record<AuditLogEntry['action'], { label: string; color: string }> = {
  value_changed: { label: 'Value Changed', color: 'text-amber-400' },
  mapping_changed: { label: 'Mapping Changed', color: 'text-purple-400' },
  extraction_run: { label: 'Extraction Run', color: 'text-blue-400' },
  override_applied: { label: 'Override Applied', color: 'text-red-400' },
  metric_recalculated: { label: 'Recalculated', color: 'text-emerald-400' },
  source_added: { label: 'Source Added', color: 'text-cyan-400' },
};

export function AuditLogPanel({ entries, className }: AuditLogPanelProps) {
  const [filterAction, setFilterAction] = useState<AuditLogEntry['action'] | 'all'>('all');
  const [isOpen, setIsOpen] = useState(true);

  const filtered = useMemo(() =>
    filterAction === 'all' ? entries : entries.filter(e => e.action === filterAction),
    [entries, filterAction]
  );

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, AuditLogEntry[]> = {};
    for (const entry of filtered) {
      const day = format(entry.timestamp, 'yyyy-MM-dd');
      if (!groups[day]) groups[day] = [];
      groups[day].push(entry);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div className={cn("rounded-xl border border-border/30 bg-card overflow-hidden", className)}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Audit Trail</span>
              <Badge variant="outline" className="text-[9px] h-4">{entries.length}</Badge>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform text-muted-foreground", isOpen && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* Filter bar */}
          <div className="flex items-center gap-1 px-4 pb-2 flex-wrap">
            <Filter className="h-3 w-3 text-muted-foreground mr-1" />
            {(['all', 'value_changed', 'mapping_changed', 'extraction_run', 'override_applied'] as const).map(action => (
              <button
                key={action}
                onClick={() => setFilterAction(action)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  filterAction === action
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:text-foreground"
                )}
              >
                {action === 'all' ? 'All' : ACTION_CONFIG[action].label}
              </button>
            ))}
          </div>

          <ScrollArea className="max-h-[400px]">
            <div className="px-4 pb-4 space-y-4">
              {grouped.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No audit entries yet</p>
              )}
              {grouped.map(([day, dayEntries]) => (
                <div key={day}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {format(new Date(day), 'MMM d, yyyy')}
                  </p>
                  <div className="space-y-1.5">
                    {dayEntries.map(entry => {
                      const config = ACTION_CONFIG[entry.action];
                      return (
                        <div key={entry.id} className="flex items-start gap-2 group hover:bg-muted/20 rounded-lg px-2 py-1.5 -mx-2 transition-colors">
                          <div className="flex flex-col items-center pt-1">
                            <div className={cn("h-2 w-2 rounded-full", config.color.replace('text-', 'bg-'))} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn("text-[10px] font-medium", config.color)}>{config.label}</span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] font-medium truncate">{entry.target}</span>
                            </div>
                            {(entry.oldValue || entry.newValue) && (
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                                {entry.oldValue && (
                                  <span className="font-mono text-muted-foreground line-through">{entry.oldValue}</span>
                                )}
                                {entry.oldValue && entry.newValue && (
                                  <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                                )}
                                {entry.newValue && (
                                  <span className="font-mono font-semibold">{entry.newValue}</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <User className="h-2.5 w-2.5" />
                                {entry.userName}
                              </span>
                              <span>{format(entry.timestamp, 'HH:mm')}</span>
                              {entry.sourceFile && <span className="truncate">from {entry.sourceFile}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
