import { useState } from 'react';
import { Sparkles, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';
import { NODE_REGISTRY } from './nodeRegistry';
import type { CanvasNodeData } from './types';

interface AiPromptBarProps {
  onGenerate: (name: string, nodes: Node[], edges: Edge[]) => void;
}

function buildNodeData(nodeType: string, config: Record<string, any> = {}): CanvasNodeData | null {
  const reg = NODE_REGISTRY.find(n => n.type === nodeType);
  if (!reg) return null;
  return {
    label: reg.label,
    nodeType: reg.type,
    icon: reg.icon,
    category: reg.category,
    inputs: reg.inputs,
    outputs: reg.outputs,
    configSchema: reg.configSchema,
    config,
    description: reg.description,
  };
}

export function AiPromptBar({ onGenerate }: AiPromptBarProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('parse-workflow-description', {
        body: { description: prompt },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const wf = data.workflow;
      if (!wf?.nodes?.length) {
        toast.error('Could not generate workflow from that description. Try being more specific.');
        return;
      }

      // Convert AI output to canvas nodes
      const canvasNodes: Node[] = [];
      const canvasEdges: Edge[] = [];

      for (let i = 0; i < wf.nodes.length; i++) {
        const n = wf.nodes[i];
        const nodeData = buildNodeData(n.type, n.config || {});
        if (!nodeData) continue;

        canvasNodes.push({
          id: n.id || `ai_${i}`,
          type: 'workflowNode',
          position: { x: 50 + i * 270, y: 150 },
          data: nodeData as unknown as Record<string, unknown>,
        });
      }

      for (let i = 0; i < (wf.edges || []).length; i++) {
        const e = wf.edges[i];
        canvasEdges.push({
          id: `ai_edge_${i}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        });
      }

      onGenerate(wf.name || 'AI Workflow', canvasNodes, canvasEdges);
      setPrompt('');
      toast.success(`Generated "${wf.name}" with ${canvasNodes.length} nodes`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Failed to generate workflow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <Input
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Describe a workflow in plain English... e.g. 'When a lender passes, notify Slack and log it'"
        className="h-8 text-xs flex-1"
        onKeyDown={e => e.key === 'Enter' && !loading && handleGenerate()}
        disabled={loading}
      />
      <Button
        size="sm"
        variant="default"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        className="h-8 gap-1.5 text-xs shrink-0"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Generate
      </Button>
    </div>
  );
}
