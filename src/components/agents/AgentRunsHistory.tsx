import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2,
  RefreshCw,
  ChevronRight,
  Zap
} from 'lucide-react';
import { useAgentRuns, useExecutePendingRuns, type AgentRun } from '@/hooks/useAgentTriggers';
import { formatDistanceToNow, format } from 'date-fns';

interface AgentRunsHistoryProps {
  agentId?: string;
  limit?: number;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Running' },
  completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Failed' },
};

const EVENT_LABELS: Record<string, string> = {
  deal_created: 'New Deal',
  deal_stage_change: 'Stage Change',
  deal_closed: 'Deal Closed',
  lender_added: 'Lender Added',
  lender_stage_change: 'Lender Update',
  milestone_completed: 'Milestone Done',
};

export function AgentRunsHistory({ agentId, limit = 50 }: AgentRunsHistoryProps) {
  const { data: runs, isLoading, refetch } = useAgentRuns(agentId, limit);
  const executePending = useExecutePendingRuns();
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  const pendingRuns = runs?.filter(r => r.status === 'pending') || [];

  const formatContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        return <li key={i} className="ml-4">{line.replace(/^[\s]*[-•]\s*/, '')}</li>;
      }
      if (/^\d+\.\s/.test(line.trim())) {
        return <li key={i} className="ml-4 list-decimal">{line.replace(/^\d+\.\s*/, '')}</li>;
      }
      const parts = line.split(/\*\*(.*?)\*\*/g);
      if (parts.length > 1) {
        return <p key={i}>{parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}</p>;
      }
      return line ? <p key={i}>{line}</p> : <br key={i} />;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Run History</h3>
          <p className="text-sm text-muted-foreground">
            Recent agent executions and their outputs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingRuns.length > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => executePending.mutate(undefined)}
              disabled={executePending.isPending}
            >
              {executePending.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Process {pendingRuns.length} Pending
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading history...</div>
      ) : runs && runs.length > 0 ? (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2 pr-4">
            {runs.map((run) => {
              const status = STATUS_CONFIG[run.status];
              const StatusIcon = status.icon;

              return (
                <Card 
                  key={run.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedRun(run)}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${status.bg}`}>
                          <StatusIcon className={`h-4 w-4 ${status.color} ${run.status === 'running' ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {run.agents && (
                              <span className="text-lg">{run.agents.avatar_emoji}</span>
                            )}
                            <p className="font-medium truncate">
                              {run.agents?.name || 'Unknown Agent'}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {EVENT_LABELS[run.trigger_event || ''] || run.trigger_event}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {run.deals && <span>{run.deals.company}</span>}
                            {run.agent_triggers && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  {run.agent_triggers.name}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right text-xs text-muted-foreground">
                          <p>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</p>
                          {run.duration_ms && <p>{run.duration_ms}ms</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    {run.status === 'failed' && run.error_message && (
                      <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                        {run.error_message}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No runs yet
            </p>
            <p className="text-xs text-muted-foreground">
              Runs will appear here when triggers are activated
            </p>
          </CardContent>
        </Card>
      )}

      {/* Run Detail Dialog */}
      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRun?.agents && (
                <span className="text-xl">{selectedRun.agents.avatar_emoji}</span>
              )}
              {selectedRun?.agents?.name || 'Agent Run'}
              <Badge variant="outline">
                {EVENT_LABELS[selectedRun?.trigger_event || ''] || selectedRun?.trigger_event}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {selectedRun && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const status = STATUS_CONFIG[selectedRun.status];
                      const StatusIcon = status.icon;
                      return (
                        <>
                          <StatusIcon className={`h-4 w-4 ${status.color}`} />
                          <span>{status.label}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground">Deal</p>
                  <p>{selectedRun.deals?.company || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Started</p>
                  <p>{selectedRun.started_at ? format(new Date(selectedRun.started_at), 'PPp') : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p>{selectedRun.duration_ms ? `${selectedRun.duration_ms}ms` : 'N/A'}</p>
                </div>
              </div>

              {/* Output */}
              {selectedRun.output_content && (
                <div>
                  <p className="text-sm font-medium mb-2">Output</p>
                  <Card>
                    <CardContent className="py-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {formatContent(selectedRun.output_content)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Error */}
              {selectedRun.error_message && (
                <div>
                  <p className="text-sm font-medium mb-2 text-destructive">Error</p>
                  <Card className="border-destructive/50">
                    <CardContent className="py-3">
                      <pre className="text-sm text-destructive whitespace-pre-wrap">
                        {selectedRun.error_message}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Input Context */}
              {selectedRun.input_context && Object.keys(selectedRun.input_context).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Input Context</p>
                  <Card>
                    <CardContent className="py-3">
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(selectedRun.input_context, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
