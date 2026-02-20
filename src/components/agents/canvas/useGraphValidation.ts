import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { AgentCanvasNodeData } from './types';

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
}

export interface GraphValidationResult {
  nodeIssues: Record<string, ValidationIssue[]>;
  globalIssues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
}

export function useGraphValidation(nodes: Node[], edges: Edge[]): GraphValidationResult {
  return useMemo(() => {
    const nodeIssues: Record<string, ValidationIssue[]> = {};
    let errorCount = 0;
    let warningCount = 0;
    const globalIssues: ValidationIssue[] = [];

    for (const node of nodes) {
      const data = node.data as unknown as AgentCanvasNodeData;
      const issues: ValidationIssue[] = [];

      // Check required config fields
      if (data.configSchema) {
        for (const [key, field] of Object.entries(data.configSchema)) {
          if (field.required) {
            const val = data.config?.[key];
            if (val === undefined || val === null || val === '') {
              issues.push({ type: 'error', message: `"${field.label || key}" is required` });
            }
          }
        }
      }

      // Check required inputs have connections
      if (data.inputs) {
        for (const input of data.inputs) {
          if (input.required) {
            const hasConnection = edges.some(e => e.target === node.id && e.targetHandle === input.key);
            if (!hasConnection) {
              issues.push({ type: 'warning', message: `Input "${input.label || input.key}" is not connected` });
            }
          }
        }
      }

      // Check if any output is connected
      if (data.outputs && data.outputs.length > 0) {
        const hasAnyOutput = edges.some(e => e.source === node.id);
        if (!hasAnyOutput) {
          issues.push({ type: 'warning', message: 'No outputs connected — this node\'s result won\'t be used' });
        }
      }

      if (issues.length > 0) {
        nodeIssues[node.id] = issues;
        errorCount += issues.filter(i => i.type === 'error').length;
        warningCount += issues.filter(i => i.type === 'warning').length;
      }
    }

    // Check for dangling nodes (no inputs AND no outputs connected)
    for (const node of nodes) {
      const hasInput = edges.some(e => e.target === node.id);
      const hasOutput = edges.some(e => e.source === node.id);
      if (!hasInput && !hasOutput && nodes.length > 1) {
        if (!nodeIssues[node.id]) nodeIssues[node.id] = [];
        nodeIssues[node.id].push({ type: 'warning', message: 'This node is isolated — connect it to the flow' });
        warningCount++;
      }
    }

    // Global: check for cycles (simple DFS)
    const adjacency: Record<string, string[]> = {};
    for (const edge of edges) {
      if (!adjacency[edge.source]) adjacency[edge.source] = [];
      adjacency[edge.source].push(edge.target);
    }
    const visited = new Set<string>();
    const stack = new Set<string>();
    function hasCycle(nodeId: string): boolean {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      stack.add(nodeId);
      for (const neighbor of adjacency[nodeId] || []) {
        if (hasCycle(neighbor)) return true;
      }
      stack.delete(nodeId);
      return false;
    }
    for (const node of nodes) {
      if (hasCycle(node.id)) {
        globalIssues.push({ type: 'warning', message: 'Graph contains a cycle — ensure it\'s intentional (e.g. loop node)' });
        warningCount++;
        break;
      }
    }

    return { nodeIssues, globalIssues, errorCount, warningCount };
  }, [nodes, edges]);
}
