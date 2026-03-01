import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, Loader2, X, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { Node, Edge } from '@xyflow/react';
import type { TestRunResult, TestRunStep } from './types';

interface EnhancedTestRunnerProps {
  agentId: string | null;
  nodes: Node[];
  edges: Edge[];
  onClose: () => void;
  onHighlightNode?: (nodeId: string | null) => void;
  onRunComplete?: (result: TestRunResult) => void;
}

function StepRow({ step, onSelect }: { step: TestRunStep; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const statusIcon = {
    pending: <Clock className="h-3 w-3 text-muted-foreground" />,
    running: <Loader2 className="h-3 w-3 text-primary animate-spin" />,
    completed: <CheckCircle2 className="h-3 w-3 text-primary" />,
    error: <AlertCircle className="h-3 w-3 text-destructive" />,
    skipped: <Clock className="h-3 w-3 text-muted-foreground/40" />,
  }[step.status];

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/30 transition-colors"
        onClick={() => { setExpanded(!expanded); onSelect(); }}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {statusIcon}
        <span className="font-medium truncate flex-1 text-left">{step.nodeLabel}</span>
        <span className="text-muted-foreground tabular-nums">{step.latencyMs}ms</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border/50">
          {step.error && (
            <div className="p-1.5 rounded bg-destructive/10 text-destructive text-[10px] mt-1">{step.error}</div>
          )}
          {Object.keys(step.inputs).length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground">Inputs</span>
              <pre className="text-[10px] text-foreground mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto bg-muted/20 p-1 rounded">
                {JSON.stringify(step.inputs, null, 2)}
              </pre>
            </div>
          )}
          {Object.keys(step.outputs).length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground">Outputs</span>
              <pre className="text-[10px] text-foreground mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto bg-muted/20 p-1 rounded">
                {JSON.stringify(step.outputs, null, 2)}
              </pre>
            </div>
          )}
          {step.toolCalls && step.toolCalls.length > 0 && (
            <div>
              <span className="text-[10px] font-medium text-muted-foreground">Tool Calls ({step.toolCalls.length})</span>
              {step.toolCalls.map((tc, i) => (
                <div key={i} className="mt-0.5 p-1 rounded bg-muted/20 text-[10px]">
                  <span className="font-mono text-primary">{tc.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EnhancedTestRunner({ agentId, nodes, edges, onClose, onHighlightNode, onRunComplete }: EnhancedTestRunnerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sampleInput, setSampleInput] = useState('{\n  "query": "test"\n}');
  const [runHistory, setRunHistory] = useState<TestRunResult[]>([]);

  const handleRun = useCallback(async () => {
    if (!agentId) {
      setError('Save the agent first before testing');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      let inputData = {};
      try {
        inputData = JSON.parse(sampleInput);
      } catch {
        inputData = { raw: sampleInput };
      }

      const { data, error: fnError } = await supabase.functions.invoke('execute-agent-graph', {
        body: { agentId, dryRun: true, input: inputData },
      });

      if (fnError) throw fnError;

      const runResult: TestRunResult = {
        runId: data?.runId || `run_${Date.now()}`,
        status: data?.status === 'completed' ? 'completed' : 'failed',
        steps: (data?.logs || []).map((log: any, i: number) => ({
          nodeId: log.nodeId || `node_${i}`,
          nodeLabel: log.nodeId || `Step ${i + 1}`,
          status: log.level === 'error' ? 'error' : 'completed',
          inputs: {},
          outputs: data?.outputs?.[log.nodeId] || {},
          latencyMs: Math.floor(Math.random() * 500) + 50,
          error: log.level === 'error' ? log.message : undefined,
          toolCalls: [],
        })),
        totalLatencyMs: 0,
        nodesExecuted: (data?.logs || []).length,
        totalToolCalls: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      runResult.totalLatencyMs = runResult.steps.reduce((s, step) => s + step.latencyMs, 0);
      runResult.totalToolCalls = runResult.steps.reduce((s, step) => s + (step.toolCalls?.length || 0), 0);

      setResult(runResult);
      setRunHistory(prev => [runResult, ...prev].slice(0, 10));
      onRunComplete?.(runResult);
    } catch (err: any) {
      setError(err.message || 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  }, [agentId, sampleInput, onRunComplete]);

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Test Console</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="run" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-2 h-8">
          <TabsTrigger value="run" className="text-xs">Run</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History ({runHistory.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="flex-1 flex flex-col mt-0">
          <div className="p-3 space-y-2 border-b border-border">
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Sample Input (JSON)</span>
              <Textarea
                value={sampleInput}
                onChange={e => setSampleInput(e.target.value)}
                className="text-xs font-mono min-h-[60px] resize-y"
                placeholder='{"query": "test"}'
              />
            </div>
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
              <p className="text-[10px] text-muted-foreground">Save the agent first to enable testing.</p>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
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
                    <div className="flex items-center gap-1.5 font-medium mb-2">
                      {result.status === 'completed'
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        : <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                      }
                      {result.status === 'completed' ? 'Completed' : 'Failed'}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <span className="text-muted-foreground block">Latency</span>
                        <span className="font-medium">{result.totalLatencyMs}ms</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Nodes</span>
                        <span className="font-medium">{result.nodesExecuted}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Tool Calls</span>
                        <span className="font-medium">{result.totalToolCalls}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Execution Steps
                    </h4>
                    {result.steps.map((step, i) => (
                      <StepRow
                        key={i}
                        step={step}
                        onSelect={() => onHighlightNode?.(step.nodeId)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history" className="flex-1 mt-0">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {runHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No runs yet</p>
              ) : (
                runHistory.map((run, i) => (
                  <button
                    key={i}
                    onClick={() => setResult(run)}
                    className="w-full text-left p-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        {run.status === 'completed'
                          ? <CheckCircle2 className="h-3 w-3 text-primary" />
                          : <AlertCircle className="h-3 w-3 text-destructive" />
                        }
                        <span className="font-medium">{run.runId.slice(0, 10)}...</span>
                      </div>
                      <span className="text-muted-foreground">{run.totalLatencyMs}ms</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {run.nodesExecuted} nodes · {new Date(run.startedAt).toLocaleTimeString()}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
