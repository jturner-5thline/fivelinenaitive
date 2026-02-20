import { memo, useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { AgentCanvasNodeData } from './types';
import { AGENT_NODE_CATEGORIES } from './agentNodeRegistry';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, AlertTriangle } from 'lucide-react';

const handleStyle = { width: 10, height: 10, borderRadius: '50%' };

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

const sectionHeaders: Record<string, string> = {
  agent: 'Think with',
  tool: 'Call',
  memory: 'Remember',
  router: 'Route',
  ui: 'Ask user',
};

const sectionHeaderColors: Record<string, string> = {
  agent: 'text-chart-4',
  tool: 'text-chart-1',
  memory: 'text-chart-2',
  router: 'text-chart-3',
  ui: 'text-chart-5',
};

const cardBorderColors: Record<string, string> = {
  agent: 'border-chart-4/30',
  tool: 'border-chart-1/30',
  memory: 'border-chart-2/30',
  router: 'border-chart-3/30',
  ui: 'border-chart-5/30',
};

function AgentNodeComponent({ data, selected }: NodeProps & { data: AgentCanvasNodeData & { _validation?: ValidationIssue[] } }) {
  const catConfig = AGENT_NODE_CATEGORIES.find(c => c.key === data.category);
  const validation = data._validation || [];
  const errors = validation.filter(v => v.type === 'error');

  const sectionHeader = sectionHeaders[data.category] || 'Step';
  const headerColor = sectionHeaderColors[data.category] || 'text-muted-foreground';
  const borderColor = cardBorderColors[data.category] || 'border-border';

  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm min-w-[220px] max-w-[300px] transition-all relative',
        'bg-card text-card-foreground',
        borderColor,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        errors.length > 0 && 'border-destructive/50'
      )}
    >
      {/* Validation badge */}
      {validation.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                'absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-primary-foreground shadow-sm z-10',
                errors.length > 0 ? 'bg-destructive' : 'bg-chart-3'
              )}>
                {errors.length > 0
                  ? <AlertCircle className="h-3 w-3" />
                  : <AlertTriangle className="h-3 w-3" />
                }
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                {validation.map((v, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    {v.type === 'error'
                      ? <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                      : <AlertTriangle className="h-3 w-3 text-chart-3 mt-0.5 shrink-0" />
                    }
                    <span>{v.message}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Input handles */}
      {data.inputs.map((input, i) => (
        <Handle
          key={`in-${input.key}`}
          type="target"
          position={Position.Left}
          id={input.key}
          style={{
            ...handleStyle,
            top: `${((i + 1) / (data.inputs.length + 1)) * 100}%`,
            background: catConfig?.color || 'hsl(var(--muted-foreground))',
            border: '2px solid hsl(var(--background))',
          }}
        />
      ))}

      {/* Section header */}
      <div className="px-4 pt-3 pb-1">
        <span className={cn('font-serif text-xs italic tracking-wide', headerColor)}>
          {sectionHeader}
        </span>
      </div>

      {/* Main label */}
      <div className="px-4 pb-2 flex items-center gap-2">
        <span className="text-base leading-none">{data.icon}</span>
        <p className="text-sm font-semibold text-foreground leading-snug tracking-tight">{data.label}</p>
      </div>

      {/* Config summary */}
      {Object.keys(data.configSchema).length > 0 && (
        <div className="px-4 pb-3 border-t border-border/30 pt-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(data.configSchema).map(([key, field]) => {
              const val = data.config[key];
              const isSet = val !== undefined && val !== null && val !== '';

              if (field.type === 'textarea') {
                const text = isSet ? String(val) : '';
                return (
                  <div key={key} className="w-full mt-1">
                    <span className="text-[10px] text-muted-foreground">{field.label || key}</span>
                    <div className={cn(
                      'mt-0.5 text-xs px-2 py-1 rounded border border-dashed',
                      isSet ? 'border-border bg-muted/30 text-foreground' : 'border-border/50 text-muted-foreground'
                    )}>
                      {isSet ? (text.length > 50 ? text.slice(0, 50) + '…' : text) : 'Unspecified'}
                    </div>
                  </div>
                );
              }

              let displayVal: string;
              if (isSet && field.type === 'select' && field.options) {
                displayVal = field.options.find(o => o.value === val)?.label || String(val);
              } else if (isSet) {
                displayVal = String(val);
              } else {
                displayVal = 'Unspecified';
              }

              return (
                <div key={key} className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">{field.label || key}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded border border-dashed text-[11px]',
                    isSet
                      ? 'border-border bg-muted/30 text-foreground font-medium'
                      : 'border-border/50 text-muted-foreground/60'
                  )}>
                    {displayVal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Output handles */}
      {data.outputs.map((output, i) => (
        <Handle
          key={`out-${output.key}`}
          type="source"
          position={Position.Right}
          id={output.key}
          style={{
            ...handleStyle,
            top: `${((i + 1) / (data.outputs.length + 1)) * 100}%`,
            background: catConfig?.color || 'hsl(var(--muted-foreground))',
            border: '2px solid hsl(var(--background))',
          }}
        />
      ))}
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
