import { useState } from 'react';
import { Play, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Node, Edge } from '@xyflow/react';
import type { CanvasNodeData } from './types';

interface TestRunPanelProps {
  nodes: Node[];
  edges: Edge[];
}

interface NodeResult {
  nodeId: string;
  label: string;
  icon: string;
  status: 'pending' | 'running' | 'success' | 'error';
  output?: Record<string, any>;
  error?: string;
  durationMs?: number;
}

// Simulates a test run through the workflow
function simulateRun(nodes: Node[], edges: Edge[]): NodeResult[] {
  // Find execution order via topological sort
  const adjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const n of nodes) {
    adjacency[n.id] = [];
    inDegree[n.id] = 0;
  }
  for (const e of edges) {
    adjacency[e.source]?.push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }

  const queue = nodes.filter(n => (inDegree[n.id] || 0) === 0).map(n => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adjacency[id] || []) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  // Add any nodes not in the order (disconnected)
  for (const n of nodes) {
    if (!order.includes(n.id)) order.push(n.id);
  }

  return order.map(id => {
    const node = nodes.find(n => n.id === id);
    const data = node?.data as unknown as CanvasNodeData;
    
    // Generate sample output based on node type
    const sampleOutputs: Record<string, Record<string, any>> = {
      'trigger/lender_event': { deal_id: 'deal_abc123', lender_name: 'Acme Bank', new_stage: 'Passed', pass_reason: 'Pricing too high' },
      'trigger/deal_event': { deal_id: 'deal_abc123', deal_name: 'Project Alpha', new_stage: 'Closed Won' },
      'trigger/schedule': { timestamp: new Date().toISOString() },
      'trigger/webhook': { body: { event: 'test' }, headers: {} },
      'condition/equals': { result: true },
      'condition/switch': { matched_case: 'case_1' },
      'data/lookup': { result: { company: 'Acme Corp', value: 1500000, stage: 'Active' } },
      'data/template': { message: '🔴 Acme Bank passed on Project Alpha. Reason: Pricing too high' },
      'data/transform': { output: { processed: true } },
      'integration/slack': { success: true, ts: '1234567890.123456' },
      'integration/email': { success: true },
      'integration/webhook': { response: { ok: true }, status: 200 },
      'integration/database_insert': { success: true },
      'integration/notification': { success: true },
      'utility/delay': { continue: true },
      'utility/retry': { success: true },
    };

    // Check if node has missing required config
    const missingConfig = Object.entries(data?.configSchema || {})
      .filter(([key, field]) => field.required && !data?.config?.[key]);

    if (missingConfig.length > 0) {
      return {
        nodeId: id,
        label: data?.label || 'Unknown',
        icon: data?.icon || '❓',
        status: 'error' as const,
        error: `Missing config: ${missingConfig.map(([k, f]) => f.label || k).join(', ')}`,
        durationMs: 0,
      };
    }

    return {
      nodeId: id,
      label: data?.label || 'Unknown',
      icon: data?.icon || '❓',
      status: 'success' as const,
      output: sampleOutputs[data?.nodeType] || { result: 'ok' },
      durationMs: Math.floor(Math.random() * 200) + 50,
    };
  });
}

export function TestRunPanel({ nodes, edges }: TestRunPanelProps) {
  const [results, setResults] = useState<NodeResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const runTest = async () => {
    setRunning(true);
    setResults(null);
    setExpandedNode(null);

    // Simulate progressive execution
    const simulated = simulateRun(nodes, edges);
    const progressive: NodeResult[] = [];

    for (const r of simulated) {
      progressive.push({ ...r, status: 'running' });
      setResults([...progressive]);
      await new Promise(res => setTimeout(res, 400 + Math.random() * 300));
      progressive[progressive.length - 1] = r;
      setResults([...progressive]);
    }

    setRunning(false);
  };

  const hasErrors = results?.some(r => r.status === 'error');

  return (
    <div className="border-t border-border bg-card">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground">Test Run</span>
        <div className="flex items-center gap-2">
          {results && !running && (
            <Badge variant={hasErrors ? 'destructive' : 'default'} className="text-[10px]">
              {hasErrors ? 'Issues Found' : 'All Passed'}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={runTest}
            disabled={running || nodes.length === 0}
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            {running ? 'Running...' : 'Run Test'}
          </Button>
        </div>
      </div>

      {results && (
        <ScrollArea className="max-h-48">
          <div className="p-2 space-y-1">
            {results.map(r => (
              <div key={r.nodeId} className="rounded-md border border-border/50 overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedNode(expandedNode === r.nodeId ? null : r.nodeId)}
                >
                  {r.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                  {r.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {r.status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  <span className="text-sm">{r.icon}</span>
                  <span className="text-xs font-medium flex-1 truncate">{r.label}</span>
                  {r.durationMs !== undefined && (
                    <span className="text-[10px] text-muted-foreground">{r.durationMs}ms</span>
                  )}
                  {r.status !== 'running' && (
                    expandedNode === r.nodeId
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </button>
                {expandedNode === r.nodeId && (
                  <div className="px-3 pb-2 pt-1 border-t border-border/30">
                    {r.error ? (
                      <p className="text-xs text-destructive">{r.error}</p>
                    ) : (
                      <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-24">
                        {JSON.stringify(r.output, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
