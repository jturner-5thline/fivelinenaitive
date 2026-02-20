import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { CanvasNodeData } from './types';
import { NODE_CATEGORIES } from './nodeRegistry';

const categoryColors: Record<string, string> = {
  trigger: 'border-chart-1/50 bg-chart-1/10',
  condition: 'border-chart-3/50 bg-chart-3/10',
  data: 'border-chart-2/50 bg-chart-2/10',
  integration: 'border-chart-4/50 bg-chart-4/10',
  utility: 'border-chart-5/50 bg-chart-5/10',
};

const handleStyle = { width: 10, height: 10 };

function WorkflowNodeComponent({ data, selected }: NodeProps & { data: CanvasNodeData }) {
  const catConfig = NODE_CATEGORIES.find(c => c.key === data.category);

  return (
    <div
      className={cn(
        'rounded-lg border-2 shadow-md min-w-[180px] max-w-[220px] transition-all',
        'bg-card text-card-foreground',
        categoryColors[data.category] || 'border-border',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
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

      {/* Header */}
      <div className={cn(
        'px-3 py-2 rounded-t-md flex items-center gap-2 border-b',
        'border-border/50'
      )}>
        <span className="text-lg leading-none">{data.icon}</span>
        <span className="text-sm font-medium truncate">{data.label}</span>
      </div>

      {/* Body */}
      {data.description && (
        <div className="px-3 py-1.5">
          <p className="text-xs text-muted-foreground line-clamp-2">{data.description}</p>
        </div>
      )}

      {/* Port labels */}
      <div className="px-3 py-1.5 flex justify-between gap-2">
        <div className="space-y-0.5">
          {data.inputs.map(input => (
            <div key={input.key} className="text-[10px] text-muted-foreground">
              {input.label || input.key}
            </div>
          ))}
        </div>
        <div className="space-y-0.5 text-right">
          {data.outputs.map(output => (
            <div key={output.key} className="text-[10px] text-muted-foreground">
              {output.label || output.key}
            </div>
          ))}
        </div>
      </div>

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

export const WorkflowNode = memo(WorkflowNodeComponent);
