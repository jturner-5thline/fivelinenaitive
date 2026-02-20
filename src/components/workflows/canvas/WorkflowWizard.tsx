import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, ArrowLeft, Wand2, Check } from 'lucide-react';
import { NODE_REGISTRY, NODE_CATEGORIES } from './nodeRegistry';
import { cn } from '@/lib/utils';
import type { Node, Edge } from '@xyflow/react';
import type { CanvasNodeData } from './types';

interface WorkflowWizardProps {
  onComplete: (name: string, nodes: Node[], edges: Edge[]) => void;
  onCancel: () => void;
}

type Step = 'trigger' | 'actions' | 'review';

function buildNodeData(nodeType: string, config: Record<string, any> = {}): CanvasNodeData {
  const reg = NODE_REGISTRY.find(n => n.type === nodeType)!;
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

export function WorkflowWizard({ onComplete, onCancel }: WorkflowWizardProps) {
  const [step, setStep] = useState<Step>('trigger');
  const [workflowName, setWorkflowName] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);

  const triggers = NODE_REGISTRY.filter(n => n.category === 'trigger');
  const actions = NODE_REGISTRY.filter(n => n.category === 'integration' || n.category === 'data');

  const steps: { key: Step; label: string; num: number }[] = [
    { key: 'trigger', label: 'Choose Trigger', num: 1 },
    { key: 'actions', label: 'Add Actions', num: 2 },
    { key: 'review', label: 'Review & Build', num: 3 },
  ];

  const toggleAction = (type: string) => {
    setSelectedActions(prev =>
      prev.includes(type) ? prev.filter(a => a !== type) : [...prev, type]
    );
  };

  const handleComplete = () => {
    if (!selectedTrigger) return;

    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Add trigger
    nodes.push({
      id: 'wiz_trigger',
      type: 'workflowNode',
      position: { x: 50, y: 150 },
      data: buildNodeData(selectedTrigger) as unknown as Record<string, unknown>,
    });

    // Add actions
    selectedActions.forEach((actionType, i) => {
      const id = `wiz_action_${i}`;
      nodes.push({
        id,
        type: 'workflowNode',
        position: { x: 350 + i * 270, y: 150 },
        data: buildNodeData(actionType) as unknown as Record<string, unknown>,
      });

      const sourceId = i === 0 ? 'wiz_trigger' : `wiz_action_${i - 1}`;
      edges.push({
        id: `wiz_edge_${i}`,
        source: sourceId,
        target: id,
        animated: true,
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      });
    });

    const name = workflowName || `${NODE_REGISTRY.find(n => n.type === selectedTrigger)?.label} Workflow`;
    onComplete(name, nodes, edges);
  };

  return (
    <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-8">
      <div className="bg-card border border-border rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Step indicator */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-3">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                step === s.key ? 'bg-primary text-primary-foreground' :
                  steps.findIndex(x => x.key === step) > i ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {steps.findIndex(x => x.key === step) > i ? <Check className="h-3.5 w-3.5" /> : s.num}
              </div>
              <span className={cn('text-xs font-medium', step === s.key ? 'text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {step === 'trigger' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">What triggers this workflow?</h3>
                <p className="text-xs text-muted-foreground">Pick the event that starts your automation.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {triggers.map(t => (
                  <button
                    key={t.type}
                    onClick={() => setSelectedTrigger(t.type)}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all hover:shadow-sm',
                      selectedTrigger === t.type
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'actions' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">What should happen next?</h3>
                <p className="text-xs text-muted-foreground">Select one or more actions. You can configure details on the canvas.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {actions.map(a => (
                  <button
                    key={a.type}
                    onClick={() => toggleAction(a.type)}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all hover:shadow-sm',
                      selectedActions.includes(a.type)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <span className="text-xl">{a.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{a.label}</span>
                        {selectedActions.includes(a.type) && (
                          <Badge variant="default" className="text-[10px] h-4 px-1">Added</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Review your workflow</h3>
                <p className="text-xs text-muted-foreground">Give it a name, then we'll build the canvas for you.</p>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Workflow Name</Label>
                  <Input
                    value={workflowName}
                    onChange={e => setWorkflowName(e.target.value)}
                    placeholder="e.g. Notify team when lender passes"
                    className="h-9"
                  />
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flow Preview</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedTrigger && (
                      <Badge variant="outline" className="text-xs gap-1">
                        {NODE_REGISTRY.find(n => n.type === selectedTrigger)?.icon}
                        {NODE_REGISTRY.find(n => n.type === selectedTrigger)?.label}
                      </Badge>
                    )}
                    {selectedActions.map((a, i) => (
                      <div key={a} className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="secondary" className="text-xs gap-1">
                          {NODE_REGISTRY.find(n => n.type === a)?.icon}
                          {NODE_REGISTRY.find(n => n.type === a)?.label}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={step === 'trigger' ? onCancel : () => setStep(step === 'review' ? 'actions' : 'trigger')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {step === 'trigger' ? 'Cancel' : 'Back'}
          </Button>

          {step === 'review' ? (
            <Button size="sm" onClick={handleComplete} disabled={!selectedTrigger}>
              <Wand2 className="h-4 w-4 mr-1" />
              Build on Canvas
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setStep(step === 'trigger' ? 'actions' : 'review')}
              disabled={step === 'trigger' && !selectedTrigger}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
