import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X, Trash2, Settings, AlertCircle, Plug, RotateCcw, Ban, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Node } from '@xyflow/react';
import type { AgentCanvasNodeData, AgentNodeConfigField } from './types';
import { AGENT_PRESETS } from './agentNodeRegistry';

interface EnhancedInspectorProps {
  node: Node & { data: AgentCanvasNodeData };
  onConfigChange: (nodeId: string, config: Record<string, any>) => void;
  onLabelChange: (nodeId: string, label: string) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  onOpenPromptLibrary?: () => void;
}

export function EnhancedInspector({ node, onConfigChange, onLabelChange, onClose, onDelete, onOpenPromptLibrary }: EnhancedInspectorProps) {
  const { data } = node;
  const config = data.config || {};
  const [errorConfig, setErrorConfig] = useState({
    retryCount: data.errorHandling?.retryCount ?? 0,
    fallbackRoute: data.errorHandling?.fallbackRoute ?? '',
    stopOnError: data.errorHandling?.stopOnError ?? true,
  });

  const updateField = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };

    // Handle preset loading
    if (key === 'preset' && value && AGENT_PRESETS[value]) {
      const preset = AGENT_PRESETS[value];
      newConfig.system_prompt = preset.system_prompt;
      newConfig.temperature = preset.temperature;
    }

    onConfigChange(node.id, newConfig);
  };

  const renderField = (key: string, field: AgentNodeConfigField) => {
    const value = config[key] ?? field.default ?? '';

    switch (field.type) {
      case 'select':
        return (
          <Select value={String(value)} onValueChange={v => updateField(key, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={`Select ${field.label || key}...`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'textarea':
        return (
          <div className="space-y-1">
            <Textarea
              value={value}
              onChange={e => updateField(key, e.target.value)}
              placeholder={field.placeholder}
              className="text-xs min-h-[80px] resize-y"
            />
            {onOpenPromptLibrary && (key === 'system_prompt' || key === 'planning_prompt' || key === 'review_prompt') && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onOpenPromptLibrary}>
                <BookOpen className="h-3 w-3 mr-1" /> Browse Library
              </Button>
            )}
          </div>
        );
      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={e => updateField(key, parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
            className="h-8 text-xs"
          />
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch checked={!!value} onCheckedChange={v => updateField(key, v)} />
            <span className="text-xs text-muted-foreground">{value ? 'Enabled' : 'Disabled'}</span>
          </div>
        );
      default:
        return (
          <Input
            value={value}
            onChange={e => updateField(key, e.target.value)}
            placeholder={field.placeholder}
            className="h-8 text-xs"
          />
        );
    }
  };

  const portTypeColor = (type: string) => {
    const typeMap: Record<string, string> = {
      text: 'bg-chart-1/20 text-chart-1',
      json: 'bg-chart-2/20 text-chart-2',
      number: 'bg-chart-3/20 text-chart-3',
      boolean: 'bg-chart-4/20 text-chart-4',
      file: 'bg-chart-5/20 text-chart-5',
      vector: 'bg-primary/20 text-primary',
      any: 'bg-muted text-muted-foreground',
    };
    const normalized = type.replace('string', 'text').replace('object', 'json').replace('object[]', 'json').replace('any[]', 'json');
    return typeMap[normalized] || typeMap.any;
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{data.icon}</span>
          <div className="min-w-0 flex-1">
            <Input
              value={data.label}
              onChange={e => onLabelChange(node.id, e.target.value)}
              className="h-6 text-sm font-semibold border-none p-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <span className="text-[10px] text-muted-foreground capitalize">{data.category}</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="config" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-3 h-8">
          <TabsTrigger value="config" className="text-xs"><Settings className="h-3 w-3 mr-1" />Config</TabsTrigger>
          <TabsTrigger value="ports" className="text-xs"><Plug className="h-3 w-3 mr-1" />I/O</TabsTrigger>
          <TabsTrigger value="errors" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />Errors</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="config" className="p-3 space-y-3 mt-0">
            {data.description && (
              <p className="text-xs text-muted-foreground">{data.description}</p>
            )}

            {Object.entries(data.configSchema).map(([key, field]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  {field.label || key}
                  {field.required && <span className="text-destructive">*</span>}
                </Label>
                {field.hint && (
                  <p className="text-[10px] text-muted-foreground">{field.hint}</p>
                )}
                {renderField(key, field)}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="ports" className="p-3 space-y-4 mt-0">
            {data.inputs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Inputs</Label>
                {data.inputs.map(inp => (
                  <div key={inp.key} className="flex items-center gap-2 text-xs">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono', portTypeColor(inp.type))}>
                      {inp.type}
                    </span>
                    <span className="font-medium">{inp.label || inp.key}</span>
                    {inp.required && <span className="text-destructive text-[10px]">req</span>}
                  </div>
                ))}
              </div>
            )}

            {data.outputs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Outputs</Label>
                {data.outputs.map(out => (
                  <div key={out.key} className="flex items-center gap-2 text-xs">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono', portTypeColor(out.type))}>
                      {out.type}
                    </span>
                    <span className="font-medium">{out.label || out.key}</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />
            <p className="text-[10px] text-muted-foreground">
              Typed ports ensure only compatible connections. Drag from an output to a matching input type.
            </p>
          </TabsContent>

          <TabsContent value="errors" className="p-3 space-y-3 mt-0">
            <p className="text-[10px] text-muted-foreground">Configure how this node handles failures.</p>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Retry Count
              </Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={errorConfig.retryCount}
                onChange={e => setErrorConfig(p => ({ ...p, retryCount: parseInt(e.target.value) || 0 }))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Fallback Route</Label>
              <Input
                value={errorConfig.fallbackRoute}
                onChange={e => setErrorConfig(p => ({ ...p, fallbackRoute: e.target.value }))}
                placeholder="Node ID to route to on error"
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Ban className="h-3 w-3" /> Stop on Error
              </Label>
              <Switch
                checked={errorConfig.stopOnError}
                onCheckedChange={v => setErrorConfig(p => ({ ...p, stopOnError: v }))}
              />
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <div className="p-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => onDelete(node.id)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete Node
        </Button>
      </div>
    </div>
  );
}
