import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, ArrowDown, Trash2, GripVertical, Zap, Clock, Bell,
  FileSpreadsheet, Sparkles, Mail, MessageSquare, Database, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PipelineStep {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'notification';
  label: string;
  config: Record<string, string>;
  icon: any;
}

const STEP_TEMPLATES = {
  trigger: [
    { label: 'Schedule (Cron)', icon: Clock, config: { cron: '0 0 * * 1' } },
    { label: 'Data Event', icon: Database, config: { event: 'new_period_detected' } },
    { label: 'Threshold Breach', icon: Zap, config: { metric: 'opex_budget', threshold: '5%' } },
  ],
  action: [
    { label: 'Refresh Data Tables', icon: FileSpreadsheet, config: { tables: 'all' } },
    { label: 'Run AI Variance Scan', icon: Sparkles, config: { threshold: '5%' } },
    { label: 'Generate Report', icon: FileSpreadsheet, config: { template: 'board_report' } },
    { label: 'Run Data Quality Checks', icon: CheckCircle2, config: { suite: 'all' } },
  ],
  condition: [
    { label: 'If Variance > Threshold', icon: Zap, config: { operator: '>', value: '5%' } },
    { label: 'If Data Check Fails', icon: CheckCircle2, config: { check: 'any' } },
  ],
  notification: [
    { label: 'Slack Message', icon: MessageSquare, config: { channel: '#finance-team' } },
    { label: 'Email Summary', icon: Mail, config: { to: 'cfo@company.com' } },
    { label: 'In-App Alert', icon: Bell, config: { priority: 'high' } },
  ],
};

const stepTypeColors = {
  trigger: 'border-blue-500/30 bg-blue-500/5',
  action: 'border-primary/30 bg-primary/5',
  condition: 'border-amber-500/30 bg-amber-500/5',
  notification: 'border-emerald-500/30 bg-emerald-500/5',
};

const stepTypeBadgeColors = {
  trigger: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  action: 'bg-primary/10 text-primary border-primary/20',
  condition: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  notification: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

export function PipelineBuilder() {
  const [pipelineName, setPipelineName] = useState('New Automation Pipeline');
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: '1', type: 'trigger', label: 'Schedule (Cron)', config: { cron: '0 0 * * 1', description: 'Every Monday at midnight' }, icon: Clock },
    { id: '2', type: 'action', label: 'Refresh Data Tables', config: { tables: 'Income Statement, Balance Sheet' }, icon: FileSpreadsheet },
    { id: '3', type: 'action', label: 'Run AI Variance Scan', config: { threshold: '5%', minDollar: '$10,000' }, icon: Sparkles },
    { id: '4', type: 'condition', label: 'If Variance > Threshold', config: { operator: '>', value: '5%' }, icon: Zap },
    { id: '5', type: 'notification', label: 'Slack Message', config: { channel: '#finance-team', message: 'Variance alert' }, icon: MessageSquare },
  ]);
  const [addingType, setAddingType] = useState<string | null>(null);

  const removeStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const addStep = (type: string, template: any) => {
    const newStep: PipelineStep = {
      id: Date.now().toString(),
      type: type as PipelineStep['type'],
      label: template.label,
      config: { ...template.config },
      icon: template.icon,
    };
    setSteps(prev => [...prev, newStep]);
    setAddingType(null);
  };

  return (
    <div className="space-y-4">
      {/* Pipeline Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Input
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            className="text-sm font-medium border-none bg-transparent px-0 h-auto focus-visible:ring-0 w-64"
          />
          <Badge variant="outline" className="text-[10px]">Draft</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs">Test Run</Button>
          <Button size="sm" className="h-7 text-xs gap-1.5">
            <CheckCircle2 className="h-3 w-3" /> Save & Activate
          </Button>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="space-y-0">
        {steps.map((step, index) => (
          <div key={step.id}>
            <Card className={cn("border", stepTypeColors[step.type])}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
                  <div className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", stepTypeColors[step.type])}>
                    <step.icon className="h-4 w-4 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider", stepTypeBadgeColors[step.type])}>
                        {step.type}
                      </Badge>
                      <span className="text-xs font-medium">{step.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(step.config).map(([key, value]) => (
                        <span key={key} className="text-[10px] text-muted-foreground">
                          {key}: <span className="font-mono text-foreground/70">{value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeStep(step.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Connector Arrow */}
            {index < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Step */}
      {addingType ? (
        <Card className="border-dashed">
          <CardContent className="p-3">
            <p className="text-xs font-medium mb-2">Add {addingType} step:</p>
            <div className="grid grid-cols-2 gap-2">
              {STEP_TEMPLATES[addingType as keyof typeof STEP_TEMPLATES]?.map((template, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2 px-3 justify-start gap-2 text-xs"
                  onClick={() => addStep(addingType, template)}
                >
                  <template.icon className="h-3.5 w-3.5" />
                  {template.label}
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] mt-2" onClick={() => setAddingType(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center gap-2">
          {(['trigger', 'action', 'condition', 'notification'] as const).map((type) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 capitalize"
              onClick={() => setAddingType(type)}
            >
              <Plus className="h-3 w-3" /> {type}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
