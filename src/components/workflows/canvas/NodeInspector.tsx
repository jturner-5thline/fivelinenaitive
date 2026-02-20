import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { CanvasNodeData, NodeConfigField } from './types';
import type { Node } from '@xyflow/react';

interface NodeInspectorProps {
  node: Node & { data: CanvasNodeData };
  onConfigChange: (nodeId: string, config: Record<string, any>) => void;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
}

function ConfigFieldRenderer({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: NodeConfigField;
  value: any;
  onChange: (key: string, value: any) => void;
}) {
  const label = field.label || fieldKey;

  switch (field.type) {
    case 'select':
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Select value={value || ''} onValueChange={v => onChange(fieldKey, v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Textarea
            className="text-xs min-h-[80px]"
            placeholder={field.placeholder}
            value={value || ''}
            onChange={e => onChange(fieldKey, e.target.value)}
          />
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder={field.placeholder}
            value={value ?? field.default ?? ''}
            onChange={e => onChange(fieldKey, Number(e.target.value))}
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <Label className="text-xs">{label}</Label>
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(fieldKey, e.target.checked)}
          />
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <Input
            className="h-8 text-xs"
            placeholder={field.placeholder}
            value={value || field.default || ''}
            onChange={e => onChange(fieldKey, e.target.value)}
          />
        </div>
      );
  }
}

export function NodeInspector({ node, onConfigChange, onClose, onDelete }: NodeInspectorProps) {
  const { data } = node;

  const handleFieldChange = (key: string, value: any) => {
    onConfigChange(node.id, { ...data.config, [key]: value });
  };

  const configEntries = Object.entries(data.configSchema);

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{data.icon}</span>
          <span className="text-sm font-semibold truncate">{data.label}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {data.description && (
            <div className="p-2.5 rounded-md bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground leading-relaxed">{data.description}</p>
            </div>
          )}

          {/* Configuration - show first as it's what users care about most */}
          {configEntries.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">⚙️ Settings</span>
              </div>
              <div className="space-y-3">
                {configEntries.map(([key, field]) => (
                  <ConfigFieldRenderer
                    key={key}
                    fieldKey={key}
                    field={field}
                    value={data.config[key]}
                    onChange={handleFieldChange}
                  />
                ))}
              </div>
            </div>
          )}

          {configEntries.length === 0 && (
            <div className="p-3 rounded-md border border-dashed border-border text-center">
              <p className="text-xs text-muted-foreground">No configuration needed — just connect this node.</p>
            </div>
          )}

          {/* Ports info - collapsible section */}
          <Separator />
          <details className="group">
            <summary className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none flex items-center gap-1 hover:text-foreground transition-colors">
              <span className="transition-transform group-open:rotate-90">▶</span>
              Inputs & Outputs
            </summary>
            <div className="mt-2 space-y-2">
              {data.inputs.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground">Accepts:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.inputs.map(inp => (
                      <Badge key={inp.key} variant="outline" className="text-[10px]">
                        {inp.label || inp.key}{inp.required ? ' *' : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {data.outputs.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground">Produces:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.outputs.map(out => (
                      <Badge key={out.key} variant="secondary" className="text-[10px]">
                        {out.label || out.key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>

          <Separator />

          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(node.id)}
          >
            Delete Node
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
