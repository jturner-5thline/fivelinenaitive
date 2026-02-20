import { useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Loader2, X, Undo2, Redo2 } from 'lucide-react';

import { AgentNode } from './AgentNode';
import { AgentNodePalette } from './AgentNodePalette';
import { AgentNodeInspector } from './AgentNodeInspector';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';
import type { AgentCanvasNodeData } from './types';

interface AgentCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  agentName?: string;
  onSave: (data: {
    name: string;
    nodes: Node[];
    edges: Edge[];
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as any,
};

export function AgentCanvas({
  initialNodes = [],
  initialEdges = [],
  agentName = '',
  onSave,
  onCancel,
  isSaving,
}: AgentCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(agentName);

  // Undo/redo
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) as (Node & { data: AgentCanvasNodeData }) | undefined,
    [nodes, selectedNodeId]
  );

  const pushHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
      return newHistory.slice(-30);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 29));
  }, [nodes, edges, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistoryIndex(i => i - 1);
  }, [history, historyIndex, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setEdges(next.edges);
    setHistoryIndex(i => i + 1);
  }, [history, historyIndex, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory();
      setEdges(eds => addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))' } }, eds));
    },
    [setEdges, pushHistory]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/agentflow');
      if (!nodeType) return;

      const registryItem = AGENT_NODE_REGISTRY.find(n => n.type === nodeType);
      if (!registryItem) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 30,
      };

      pushHistory();

      const newNode: Node = {
        id: `anode_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'agentNode',
        position,
        data: {
          label: registryItem.label,
          nodeType: registryItem.type,
          icon: registryItem.icon,
          category: registryItem.category,
          inputs: registryItem.inputs,
          outputs: registryItem.outputs,
          configSchema: registryItem.configSchema,
          config: {},
          description: registryItem.description,
        } satisfies AgentCanvasNodeData as unknown as Record<string, unknown>,
      };

      setNodes(nds => [...nds, newNode]);
    },
    [setNodes, pushHistory]
  );

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/agentflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleConfigChange = useCallback(
    (nodeId: string, config: Record<string, any>) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config } }
            : n
        )
      );
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      pushHistory();
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
    },
    [setNodes, setEdges, pushHistory]
  );

  const handleSave = () => {
    onSave({ name, nodes, edges });
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Agent solution name..."
          className="h-8 max-w-xs text-sm font-medium"
        />

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={historyIndex <= 0}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !name.trim()}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <AgentNodePalette onDragStart={onDragStart} />

        {/* Canvas */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode="Shift"
              className="bg-background"
              defaultEdgeOptions={{
                animated: true,
                style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
              }}
            >
              <Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
              <MiniMap
                className="!bg-card !border-border"
                nodeColor="hsl(var(--primary))"
                maskColor="hsl(var(--background) / 0.8)"
              />
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="hsl(var(--muted-foreground) / 0.2)" />

              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-16 text-center max-w-md mx-auto">
                    <div className="text-4xl mb-3">🧠</div>
                    <h3 className="text-base font-semibold text-foreground mb-1">Design your agent solution</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Drag components from the left panel to build a multi-agent workflow. Connect agents, tools, memory, and human checkpoints.
                    </p>
                    <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">①</span>
                        <span>Add an agent</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">②</span>
                        <span>Wire tools & memory</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">③</span>
                        <span>Add approvals</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </div>

        {/* Right inspector */}
        {selectedNode && (
          <AgentNodeInspector
            node={selectedNode}
            onConfigChange={handleConfigChange}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleDeleteNode}
          />
        )}
      </div>
    </div>
  );
}
