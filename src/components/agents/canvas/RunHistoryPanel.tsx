import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, History, CheckCircle2, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestRunResult } from './types';

interface RunHistoryPanelProps {
  runs: TestRunResult[];
  onSelectRun: (run: TestRunResult) => void;
  onClose: () => void;
}

export function RunHistoryPanel({ runs, onSelectRun, onClose }: RunHistoryPanelProps) {
  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Run History</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {runs.length === 0 ? (
            <div className="text-center py-8">
              <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No runs yet</p>
              <p className="text-[10px] text-muted-foreground">Execute a test run to see results here</p>
            </div>
          ) : (
            runs.map((run, i) => (
              <button
                key={run.runId}
                onClick={() => onSelectRun(run)}
                className="w-full text-left p-3 rounded-md border border-border hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {run.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    ) : run.status === 'running' ? (
                      <Clock className="h-4 w-4 text-chart-3 animate-pulse" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <div>
                      <p className="text-xs font-medium">Run #{runs.length - i}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                  <div className="px-1.5 py-1 rounded bg-muted/30">
                    <span className="text-muted-foreground block">Latency</span>
                    <span className="font-medium">{run.totalLatencyMs}ms</span>
                  </div>
                  <div className="px-1.5 py-1 rounded bg-muted/30">
                    <span className="text-muted-foreground block">Nodes</span>
                    <span className="font-medium">{run.nodesExecuted}</span>
                  </div>
                  <div className="px-1.5 py-1 rounded bg-muted/30">
                    <span className="text-muted-foreground block">Calls</span>
                    <span className="font-medium">{run.totalToolCalls}</span>
                  </div>
                </div>

                {run.steps.some(s => s.status === 'error') && (
                  <div className="mt-2 p-1.5 rounded bg-destructive/10 text-[10px] text-destructive">
                    {run.steps.filter(s => s.status === 'error').length} step(s) failed
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
