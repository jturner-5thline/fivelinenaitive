import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { CanvasNodeData } from './types';

export interface NodeValidation {
  nodeId: string;
  issues: { type: 'error' | 'warning'; message: string }[];
}

export function useNodeValidation(nodes: Node[], edges: Edge[]): Record<string, NodeValidation> {
  return useMemo(() => {
    const result: Record<string, NodeValidation> = {};

    for (const node of nodes) {
      const data = node.data as unknown as CanvasNodeData;
      const issues: { type: 'error' | 'warning'; message: string }[] = [];

      // Check required config fields
      for (const [key, field] of Object.entries(data.configSchema)) {
        if (field.required && !data.config[key]) {
          issues.push({ type: 'error', message: `"${field.label || key}" is required` });
        }
      }

      // Check if inputs are connected
      const connectedInputs = edges.filter(e => e.target === node.id).map(e => e.targetHandle);
      for (const input of data.inputs) {
        if (input.required && !connectedInputs.includes(input.key)) {
          issues.push({ type: 'warning', message: `Input "${input.label || input.key}" is not connected` });
        }
      }

      // Check if outputs go anywhere (for non-terminal nodes)
      const hasOutputConnections = edges.some(e => e.source === node.id);
      if (data.outputs.length > 0 && !hasOutputConnections && data.category !== 'integration') {
        issues.push({ type: 'warning', message: 'No outgoing connections — this node\'s output is unused' });
      }

      // Triggers shouldn't have incoming connections
      if (data.category === 'trigger') {
        const hasIncoming = edges.some(e => e.target === node.id);
        if (hasIncoming) {
          issues.push({ type: 'error', message: 'Triggers cannot have incoming connections' });
        }
      }

      if (issues.length > 0) {
        result[node.id] = { nodeId: node.id, issues };
      }
    }

    return result;
  }, [nodes, edges]);
}
