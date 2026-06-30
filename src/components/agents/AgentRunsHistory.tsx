import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
  Sparkles,
  Activity,
  Zap,
  GraduationCap,
} from 'lucide-react';
import { useAgentActivity, type AgentActivityEvent, type AgentActivityKind } from '@/hooks/useAgentActivity';
import { formatDistanceToNow } from 'date-fns';

interface AgentRunsHistoryProps {
  limit?: number;
}

const KIND_META: Record<AgentActivityKind, { label: string; icon: typeof Activity; tone: string }> = {
  run: { label: 'Action', icon: Zap, tone: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  action: { label: 'Action', icon: Activity, tone: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  learn: { label: 'Learning', icon: GraduationCap, tone: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  audit: { label: 'Update', icon: Sparkles, tone: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
};

const STATUS_ICON = {
  success: { Icon: CheckCircle2, cls: 'text-emerald-500' },
  failed: { Icon: XCircle, cls: 'text-red-500' },
  pending: { Icon: Loader2, cls: 'text-blue-500 animate-spin' },
  info: { Icon: Clock, cls: 'text-muted-foreground' },
} as const;

type Filter = 'all' | 'action' | 'learn' | 'audit';

export function AgentRunsHistory({ limit = 100 }: AgentRunsHistoryProps) {
  const { data: events, isLoading, refetch, isRefetching } = useAgentActivity(limit);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<AgentActivityEvent | null>(null);

  const filtered = useMemo(() => {
    if (!events) return [];
    if (filter === 'all') return events;
    if (filter === 'action') return events.filter((e) => e.kind === 'run' || e.kind === 'action');
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium">Run History</h3>
          <p className="text-sm text-muted-foreground">
            Every agent action, learning event, and update across this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="h-6 text-xs">All</TabsTrigger>
              <TabsTrigger value="action" className="h-6 text-xs">Actions</TabsTrigger>
              <TabsTrigger value="learn" className="h-6 text-xs">Learning</TabsTrigger>
              <TabsTrigger value="audit" className="h-6 text-xs">Updates</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading activity…</div>
      ) : filtered.length > 0 ? (
        <ScrollArea className="h-[460px]">
          <div className="space-y-2 pr-4">
            {filtered.map((evt) => {
              const meta = KIND_META[evt.kind];
              const KindIcon = meta.icon;
              const statusKey = (evt.status ?? 'info') as keyof typeof STATUS_ICON;
              const { Icon: StatusIcon, cls } = STATUS_ICON[statusKey];
              return (
                <Card
                  key={evt.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelected(evt)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 mt-0.5 h-8 w-8 rounded-md flex items-center justify-center border ${meta.tone}`}>
                        <KindIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{evt.title}</p>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide h-4 px-1.5">
                            {meta.label}
                          </Badge>
                        </div>
                        {evt.subtitle && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{evt.subtitle}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
                        <StatusIcon className={`h-4 w-4 ${cls}`} />
                        <span className="whitespace-nowrap">
                          {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Activity className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground">
              Agent runs, approvals, learning events, and audits will appear here as they happen.
            </p>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className="border-border/60">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{selected.title}</p>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto max-h-72 overflow-y-auto">
              {JSON.stringify(selected.detail, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
