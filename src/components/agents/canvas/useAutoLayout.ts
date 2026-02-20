import { useCallback } from 'react';
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 160;

export function useAutoLayout(
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  pushHistory: () => void
) {
  const autoLayout = useCallback(
    (nodes: Node[], edges: Edge[]) => {
      if (nodes.length === 0) return;

      pushHistory();

      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100, marginx: 40, marginy: 40 });

      nodes.forEach(node => {
        g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      });

      edges.forEach(edge => {
        g.setEdge(edge.source, edge.target);
      });

      dagre.layout(g);

      setNodes(nds =>
        nds.map(node => {
          const pos = g.node(node.id);
          return {
            ...node,
            position: {
              x: pos.x - NODE_WIDTH / 2,
              y: pos.y - NODE_HEIGHT / 2,
            },
          };
        })
      );
    },
    [setNodes, pushHistory]
  );

  return autoLayout;
}
