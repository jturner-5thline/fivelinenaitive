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
import { Save, Loader2, X, Undo2, Redo2, Wand2 } from 'lucide-react';

import { WorkflowNode } from './WorkflowNode';
import { NodePalette } from './NodePalette';
import { NodeInspector } from './NodeInspector';
import { AiPromptBar } from './AiPromptBar';
import { TestRunPanel } from './TestRunPanel';
import { WorkflowWizard } from './WorkflowWizard';
import { useNodeValidation } from './useNodeValidation';
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
  const [showWizard, setShowWizard] = useState(false);

  // Undo/redo stacks
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Validation
  const validationResults = useNodeValidation(nodes, edges);

  // Inject validation data into nodes for rendering
  const nodesWithValidation = useMemo(() => {
    return nodes.map(n => {
      const v = validationResults[n.id];
      if (!v) return n;
      return {
        ...n,
        data: { ...n.data, _validation: v.issues },
      };
    });
  }, [nodes, validationResults]);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) as (Node & { data: CanvasNodeData }) | undefined,
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
        } satisfies CanvasNodeData as unknown as Record<string, unknown>,
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

  const getNodeData = useCallback((nodeType: string): CanvasNodeData => {
    const reg = NODE_REGISTRY.find(n => n.type === nodeType)!;
    return {
      label: reg.label,
      nodeType: reg.type,
      icon: reg.icon,
      category: reg.category,
      inputs: reg.inputs,
      outputs: reg.outputs,
      configSchema: reg.configSchema,
      config: {},
      description: reg.description,
    };
  }, []);

  const loadTemplate = useCallback((templateId: string) => {
    const templates: Record<string, { nodes: Node[]; edges: Edge[]; name: string }> = {
      lender_passed: {
        name: 'Lender Passed Notification',
        nodes: [
          { id: 'tpl_trigger', type: 'workflowNode', position: { x: 50, y: 150 }, data: { ...getNodeData('trigger/lender_event'), config: { event: 'stage_change' } } as unknown as Record<string, unknown> },
          { id: 'tpl_condition', type: 'workflowNode', position: { x: 320, y: 150 }, data: { ...getNodeData('condition/equals'), config: { operator: 'equals', compareTo: 'Passed' } } as unknown as Record<string, unknown> },
          { id: 'tpl_slack', type: 'workflowNode', position: { x: 590, y: 100 }, data: { ...getNodeData('integration/slack'), config: { channel: '#deals' } } as unknown as Record<string, unknown> },
          { id: 'tpl_log', type: 'workflowNode', position: { x: 590, y: 250 }, data: { ...getNodeData('integration/database_insert'), config: { table: 'activity_logs', activity_type: 'lender_passed' } } as unknown as Record<string, unknown> },
        ],
        edges: [
          { id: 'e1', source: 'tpl_trigger', target: 'tpl_condition', animated: true },
          { id: 'e2', source: 'tpl_condition', target: 'tpl_slack', sourceHandle: 'true', animated: true },
          { id: 'e3', source: 'tpl_condition', target: 'tpl_log', sourceHandle: 'true', animated: true },
        ],
      },
      deal_stage_change: {
        name: 'Deal Stage Change Email',
        nodes: [
          { id: 'tpl_trigger', type: 'workflowNode', position: { x: 50, y: 150 }, data: { ...getNodeData('trigger/deal_event'), config: { event: 'stage_change' } } as unknown as Record<string, unknown> },
          { id: 'tpl_email', type: 'workflowNode', position: { x: 350, y: 150 }, data: { ...getNodeData('integration/email'), config: { subject: 'Deal stage updated' } } as unknown as Record<string, unknown> },
        ],
        edges: [
          { id: 'e1', source: 'tpl_trigger', target: 'tpl_email', animated: true },
        ],
      },
      scheduled_report: {
        name: 'Scheduled Report',
        nodes: [
          { id: 'tpl_trigger', type: 'workflowNode', position: { x: 50, y: 150 }, data: { ...getNodeData('trigger/schedule'), config: { frequency: 'daily', time: '09:00' } } as unknown as Record<string, unknown> },
          { id: 'tpl_lookup', type: 'workflowNode', position: { x: 320, y: 150 }, data: { ...getNodeData('data/lookup'), config: { table: 'deals' } } as unknown as Record<string, unknown> },
          { id: 'tpl_slack', type: 'workflowNode', position: { x: 590, y: 150 }, data: { ...getNodeData('integration/slack'), config: { channel: '#reports' } } as unknown as Record<string, unknown> },
        ],
        edges: [
          { id: 'e1', source: 'tpl_trigger', target: 'tpl_lookup', animated: true },
          { id: 'e2', source: 'tpl_lookup', target: 'tpl_slack', animated: true },
        ],
      },
    };

    const tpl = templates[templateId];
    if (!tpl) return;
    setName(tpl.name);
    setNodes(tpl.nodes);
    setEdges(tpl.edges);
  }, [setNodes, setEdges, getNodeData]);

  const handleAiGenerate = useCallback((aiName: string, aiNodes: Node[], aiEdges: Edge[]) => {
    pushHistory();
    setName(aiName);
    setNodes(aiNodes);
    setEdges(aiEdges);
  }, [setNodes, setEdges, pushHistory]);

  const handleWizardComplete = useCallback((wizName: string, wizNodes: Node[], wizEdges: Edge[]) => {
    pushHistory();
    setName(wizName);
    setNodes(wizNodes);
    setEdges(wizEdges);
    setShowWizard(false);
  }, [setNodes, setEdges, pushHistory]);

  const handleSave = () => {
    onSave({ name, description, isActive: active, nodes, edges });
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Wizard overlay */}
      {showWizard && (
        <WorkflowWizard onComplete={handleWizardComplete} onCancel={() => setShowWizard(false)} />
      )}

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
          {nodes.length === 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowWizard(true)}>
              <Wand2 className="h-3.5 w-3.5" />
              Guided Setup
            </Button>
          )}
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

        {/* Canvas + bottom panels */}
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
                    <div className="text-4xl mb-3">🧩</div>
                    <h3 className="text-base font-semibold text-foreground mb-1">Build your first workflow</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Drag a node from the left panel, use the AI bar below, or try the guided wizard.
                    </p>
                    <div className="flex flex-col gap-2 items-center">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick start templates</p>
                      <div className="flex gap-2 flex-wrap justify-center">
                        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => loadTemplate('lender_passed')}>
                          🔔 Lender Passed → Slack
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => loadTemplate('deal_stage_change')}>
                          📋 Deal Stage → Email
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => loadTemplate('scheduled_report')}>
                          ⏰ Scheduled Report
                        </Button>
                      </div>
                      <Button variant="secondary" size="sm" className="text-xs gap-1.5 mt-2" onClick={() => setShowWizard(true)}>
                        <Wand2 className="h-3.5 w-3.5" />
                        Use Guided Wizard
                      </Button>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">①</span>
                        <span>Drag a trigger</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">②</span>
                        <span>Add actions</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/50">
                        <span className="text-lg">③</span>
                        <span>Connect & save</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* AI prompt bar */}
          <AiPromptBar onGenerate={handleAiGenerate} />

          {/* Test run panel */}
          {nodes.length > 0 && <TestRunPanel nodes={nodes} edges={edges} />}
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
