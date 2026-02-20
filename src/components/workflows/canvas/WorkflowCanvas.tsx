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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Loader2, X, Undo2, Redo2 } from 'lucide-react';

import { WorkflowNode } from './WorkflowNode';
import { NodePalette } from './NodePalette';
import { NodeInspector } from './NodeInspector';
import { NODE_REGISTRY } from './nodeRegistry';
import type { CanvasNodeData } from './types';

interface WorkflowCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  workflowName?: string;
  workflowDescription?: string;
  isActive?: boolean;
  onSave: (data: {
    name: string;
    description: string;
    isActive: boolean;
    nodes: Node[];
    edges: Edge[];
  }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode as any,
};

export function WorkflowCanvas({
  initialNodes = [],
  initialEdges = [],
  workflowName = '',
  workflowDescription = '',
  isActive = true,
  onSave,
  onCancel,
  isSaving,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(workflowName);
  const [description, setDescription] = useState(workflowDescription);
  const [active, setActive] = useState(isActive);

  // Undo/redo stacks
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) as (Node & { data: CanvasNodeData }) | undefined,
    [nodes, selectedNodeId]
  );

  const pushHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
      return newHistory.slice(-30); // keep 30 states max
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
      const nodeType = event.dataTransfer.getData('application/reactflow');
      if (!nodeType) return;

      const registryItem = NODE_REGISTRY.find(n => n.type === nodeType);
      if (!registryItem) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: event.clientX - bounds.left - 90,
        y: event.clientY - bounds.top - 30,
      };

      pushHistory();

      const newNode: Node = {
        id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'workflowNode',
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
        } satisfies CanvasNodeData,
      };

      setNodes(nds => [...nds, newNode]);
    },
    [setNodes, pushHistory]
  );

  const onDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
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
    onSave({ name, description, isActive: active, nodes, edges });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Workflow name..."
          className="h-8 max-w-xs text-sm font-medium"
        />
        <Input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description..."
          className="h-8 max-w-sm text-xs"
        />
        <div className="flex items-center gap-2 ml-2">
          <Switch id="canvas-active" checked={active} onCheckedChange={setActive} />
          <Label htmlFor="canvas-active" className="text-xs">Active</Label>
        </div>

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
        <NodePalette onDragStart={onDragStart} />

        {/* Canvas */}
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
                <div className="mt-20 text-center text-muted-foreground">
                  <p className="text-sm font-medium">Drag nodes from the left panel to get started</p>
                  <p className="text-xs mt-1">Connect them by dragging from output ports to input ports</p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Right inspector */}
        {selectedNode && (
          <NodeInspector
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
