import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Wand2 } from 'lucide-react';
import { CANVAS_TEMPLATES, type CanvasTemplate } from './canvasTemplates';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';
import type { AgentCanvasNodeData } from './types';

interface AgentCanvasWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (data: { name: string; nodes: Node[]; edges: Edge[] }) => void;
}

type WizardStep = 'goal' | 'template' | 'customize';

function aiNodeToCanvasNode(aiNode: any): Node | null {
  const registryItem = AGENT_NODE_REGISTRY.find(n => n.type === aiNode.type);
  if (!registryItem) return null;

  return {
    id: aiNode.id || `anode_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'agentNode',
    position: { x: aiNode.x || 0, y: aiNode.y || 0 },
    data: {
      label: aiNode.label || registryItem.label,
      nodeType: registryItem.type,
      icon: registryItem.icon,
      category: registryItem.category,
      inputs: registryItem.inputs,
      outputs: registryItem.outputs,
      configSchema: registryItem.configSchema,
      config: aiNode.config || {},
      description: registryItem.description,
    } satisfies AgentCanvasNodeData as unknown as Record<string, unknown>,
  };
}

function aiEdgeToCanvasEdge(aiEdge: any): Edge {
  return {
    id: `edge_${aiEdge.source}_${aiEdge.target}_${Math.random().toString(36).slice(2, 5)}`,
    source: aiEdge.source,
    sourceHandle: aiEdge.sourceHandle || undefined,
    target: aiEdge.target,
    targetHandle: aiEdge.targetHandle || undefined,
    animated: true,
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
  };
}

export function AgentCanvasWizard({ open, onOpenChange, onComplete }: AgentCanvasWizardProps) {
  const [step, setStep] = useState<WizardStep>('goal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CanvasTemplate | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const reset = () => {
    setStep('goal');
    setName('');
    setDescription('');
    setSelectedTemplate(null);
    setIsGenerating(false);
  };

  const handleComplete = () => {
    if (!selectedTemplate) return;
    onComplete({
      name: name || selectedTemplate.name,
      nodes: selectedTemplate.nodes,
      edges: selectedTemplate.edges,
    });
    reset();
    onOpenChange(false);
  };

  const handleAIGenerate = async () => {
    const prompt = description || name;
    if (!prompt.trim()) {
      toast.error('Please describe what you want the agent to do');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-agent-graph', {
        body: { description: prompt },
      });

      if (error) throw error;
      if (!data?.nodes?.length) throw new Error('AI returned no nodes');

      const nodes = data.nodes
        .map((n: any) => aiNodeToCanvasNode(n))
        .filter(Boolean) as Node[];

      const edges = (data.edges || []).map((e: any) => aiEdgeToCanvasEdge(e));

      onComplete({
        name: data.name || name || 'AI-Generated Solution',
        nodes,
        edges,
      });
      toast.success('Graph generated from your description!');
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate graph');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Agent Builder Wizard
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {(['goal', 'template', 'customize'] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                step === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {i + 1}
              </div>
              <span className={step === s ? 'text-foreground font-medium' : ''}>
                {s === 'goal' ? 'Define Goal' : s === 'template' ? 'Pick Template' : 'Customize'}
              </span>
              {i < 2 && <ArrowRight className="h-3 w-3 mx-1" />}
            </div>
          ))}
        </div>

        {step === 'goal' && (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>What should this agent solution do?</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Deal Research Pipeline"
              />
            </div>
            <div className="space-y-2">
              <Label>Describe the workflow</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Search for company info, analyze deal data, get manager approval, then send a summary to Slack..."
                className="min-h-[100px]"
              />
            </div>
            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={handleAIGenerate}
                disabled={isGenerating || (!name.trim() && !description.trim())}
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</>
                ) : (
                  <><Wand2 className="h-4 w-4 mr-1" /> Generate with AI</>
                )}
              </Button>
              <Button onClick={() => setStep('template')}>
                Pick Template <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 'template' && (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">Choose a starting template or start blank.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CANVAS_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t); setStep('customize'); }}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    selectedTemplate?.id === t.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{t.icon}</span>
                    <span className="text-sm font-medium">{t.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('goal')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button variant="outline" onClick={() => {
                onComplete({ name: name || 'Untitled Solution', nodes: [], edges: [] });
                reset();
                onOpenChange(false);
              }}>
                Start Blank
              </Button>
            </div>
          </div>
        )}

        {step === 'customize' && selectedTemplate && (
          <div className="space-y-4 mt-2">
            <div className="p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{selectedTemplate.icon}</span>
                <h3 className="font-semibold">{selectedTemplate.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{selectedTemplate.nodes.length} nodes</span>
                <span>{selectedTemplate.edges.length} connections</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Solution Name</Label>
              <Input
                value={name || selectedTemplate.name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep('template')}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleComplete}>
                Create Solution <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
