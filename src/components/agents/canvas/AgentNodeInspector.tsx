import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Node } from '@xyflow/react';
import type { AgentCanvasNodeData, AgentNodeConfigField } from './types';

interface AgentNodeInspectorProps {
  node: Node & { data: AgentCanvasNodeData };
  onConfigChange: (nodeId: string, config: Record<string, any>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

export function AgentNodeInspector({ node, onConfigChange, onClose, onDelete }: AgentNodeInspectorProps) {
  const { data } = node;
  const config = data.config || {};

  const updateField = (key: string, value: any) => {
    onConfigChange(node.id, { ...config, [key]: value });
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
          <Textarea
            value={value}
            onChange={e => updateField(key, e.target.value)}
            placeholder={field.placeholder}
            className="text-xs min-h-[80px] resize-y"
          />
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

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">{data.icon}</span>
          <h3 className="text-sm font-semibold truncate">{data.label}</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
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

          {/* Inputs/Outputs info */}
          {data.inputs.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Inputs</Label>
              {data.inputs.map(inp => (
                <div key={inp.key} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/40" />
                  <span>{inp.label || inp.key}</span>
                  <span className="text-muted-foreground/60">({inp.type})</span>
                </div>
              ))}
            </div>
          )}

          {data.outputs.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Outputs</Label>
              {data.outputs.map(out => (
                <div key={out.key} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-primary/40" />
                  <span>{out.label || out.key}</span>
                  <span className="text-muted-foreground/60">({out.type})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

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
