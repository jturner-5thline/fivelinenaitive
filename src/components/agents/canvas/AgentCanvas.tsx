import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
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
import { Save, Loader2, X, Undo2, Redo2, LayoutGrid, Sparkles, FileText, Play, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { AgentNode } from './AgentNode';
import { AgentNodePalette } from './AgentNodePalette';
import { AgentNodeInspector } from './AgentNodeInspector';
import { GraphValidationPanel } from './GraphValidationPanel';
import { CanvasTemplatesPicker } from './CanvasTemplatesPicker';
import { AgentCanvasWizard } from './AgentCanvasWizard';
import { InlineTestRunner } from './InlineTestRunner';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';
import { useGraphValidation } from './useGraphValidation';
import { useAutoLayout } from './useAutoLayout';
import type { AgentCanvasNodeData } from './types';
import type { CanvasTemplate } from './canvasTemplates';

interface AgentCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  agentName?: string;
  agentId?: string;
  onSave: (data: { name: string; nodes: Node[]; edges: Edge[] }) => void;
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
  agentId,
  onSave,
  onCancel,
  isSaving,
}: AgentCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(agentName);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showTestRunner, setShowTestRunner] = useState(false);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);

  // Undo/redo
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Validation
  const validation = useGraphValidation(nodes, edges);

  // Inject validation into node data
  const nodesWithValidation = useMemo(() => {
    return nodes.map(n => {
      const issues = validation.nodeIssues[n.id];
      if (issues) {
        return { ...n, data: { ...n.data, _validation: issues } };
      }
      return n;
    });
  }, [nodes, validation.nodeIssues]);

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

  // Auto-layout
  const autoLayout = useAutoLayout(setNodes, pushHistory);

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
          n.id === nodeId ? { ...n, data: { ...n.data, config } } : n
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

  // Duplicate node
  const duplicateNode = useCallback((node: Node) => {
    pushHistory();
    const newNode: Node = {
      ...structuredClone(node),
      id: `anode_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
    };
    setNodes(nds => [...nds, newNode]);
    toast.success('Node duplicated');
  }, [setNodes, pushHistory]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;
      if (isMeta && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (isMeta && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (isMeta && e.key === 'c' && selectedNodeId) {
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) setCopiedNode(structuredClone(node));
      }
      if (isMeta && e.key === 'v' && copiedNode) {
        duplicateNode(copiedNode);
      }
      if (isMeta && e.key === 'd' && selectedNodeId) {
        e.preventDefault();
        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) duplicateNode(node);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedNodeId, nodes, copiedNode, duplicateNode]);

  const handleSave = () => {
    onSave({ name, nodes, edges });
  };

  // Load template
  const handleLoadTemplate = (template: CanvasTemplate) => {
    pushHistory();
    setNodes(template.nodes);
    setEdges(template.edges);
    if (!name) setName(template.name);
    toast.success(`Loaded "${template.name}" template`);
  };

  const handleWizardComplete = (data: { name: string; nodes: Node[]; edges: Edge[] }) => {
    pushHistory();
    setNodes(data.nodes);
    setEdges(data.edges);
    setName(data.name);
    toast.success('Solution created from wizard');
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

        <GraphValidationPanel validation={validation} />

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowWizard(true)} title="Wizard Mode">
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTemplates(true)} title="Templates">
            <FileText className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => autoLayout(nodes, edges)} title="Auto Layout">
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
            <Redo2 className="h-4 w-4" />
          </Button>
          {selectedNodeId && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
              const node = nodes.find(n => n.id === selectedNodeId);
              if (node) duplicateNode(node);
            }} title="Duplicate (Ctrl+D)">
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTestRunner(v => !v)} title="Test Run">
            <Play className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
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
        <AgentNodePalette onDragStart={onDragStart} />

        <div className="flex-1 flex flex-col">
          <div className="flex-1" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodesWithValidation}
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
                      Drag components from the left panel, or use the wizard / templates to get started fast.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
                        <Sparkles className="h-4 w-4 mr-1" /> Wizard
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
                        <FileText className="h-4 w-4 mr-1" /> Templates
                      </Button>
                    </div>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </div>

        {selectedNode && !showTestRunner && (
          <AgentNodeInspector
            node={selectedNode}
            onConfigChange={handleConfigChange}
            onClose={() => setSelectedNodeId(null)}
            onDelete={handleDeleteNode}
          />
        )}

        {showTestRunner && (
          <InlineTestRunner
            agentId={agentId || null}
            onClose={() => setShowTestRunner(false)}
          />
        )}
      </div>

      {/* Templates picker */}
      <CanvasTemplatesPicker
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelect={handleLoadTemplate}
      />

      {/* Wizard */}
      <AgentCanvasWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
