import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Loader2, X, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface InlineTestRunnerProps {
  agentId: string | null;
  onClose: () => void;
}

interface RunLog {
  nodeId: string;
  level: string;
  message: string;
  timestamp: string;
}

interface RunResult {
  runId: string;
  status: string;
  outputs: Record<string, any>;
  logs: RunLog[];
}

export function InlineTestRunner({ agentId, onClose }: InlineTestRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!agentId) {
      setError('Save the agent first before testing');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('execute-agent-graph', {
        body: { agentId, dryRun: true },
      });

      if (fnError) throw fnError;
      setResult(data as RunResult);
    } catch (err: any) {
      setError(err.message || 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Test Run</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3">
        <Button
          size="sm"
          className="w-full"
          onClick={handleRun}
          disabled={isRunning || !agentId}
        >
          {isRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Running...</>
          ) : (
            <><Play className="h-4 w-4 mr-1" /> Execute Graph</>
          )}
        </Button>
        {!agentId && (
          <p className="text-xs text-muted-foreground mt-2">Save the solution first to enable testing.</p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {error && (
            <div className="p-2 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              <div className="flex items-center gap-1.5 font-medium mb-1">
                <AlertCircle className="h-3.5 w-3.5" /> Error
              </div>
              {error}
            </div>
          )}

          {result && (
            <>
              <div className={cn(
                'p-2 rounded-md border text-xs',
                result.status === 'completed' ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'
              )}>
                <div className="flex items-center gap-1.5 font-medium mb-1">
                  {result.status === 'completed'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    : <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  }
                  {result.status === 'completed' ? 'Completed' : 'Failed'}
                </div>
                <span className="text-muted-foreground">Run ID: {result.runId?.slice(0, 8)}...</span>
              </div>

              {/* Execution log */}
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-muted-foreground">Execution Log</h4>
                {result.logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    {log.level === 'error'
                      ? <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                      : <Clock className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    }
                    <span className={log.level === 'error' ? 'text-destructive' : 'text-foreground'}>{log.message}</span>
                  </div>
                ))}
              </div>

              {/* Node outputs */}
              {Object.keys(result.outputs).length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-xs font-medium text-muted-foreground">Node Outputs</h4>
                  {Object.entries(result.outputs).map(([nodeId, outputs]) => (
                    <div key={nodeId} className="p-2 rounded border border-border bg-muted/20">
                      <span className="text-[10px] font-medium text-muted-foreground">{nodeId}</span>
                      <pre className="text-[10px] text-foreground mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                        {JSON.stringify(outputs, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
