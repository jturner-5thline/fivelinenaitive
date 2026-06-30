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
  type EdgeTypes,
  Panel,
  EdgeLabelRenderer,
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Loader2, X, Undo2, Redo2, LayoutGrid, FileText, Play, Copy, Keyboard, Download, Upload, Settings2, Package, Shield, BookOpen, History } from 'lucide-react';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';
import { toast } from 'sonner';

import { AgentNode } from './AgentNode';
import { AgentNodePalette } from './AgentNodePalette';
import { EnhancedInspector } from './EnhancedInspector';
import { GraphValidationPanel } from './GraphValidationPanel';
import { CanvasTemplatesPicker } from './CanvasTemplatesPicker';
import { AgentCanvasWizard } from './AgentCanvasWizard';
import { EnhancedTestRunner } from './EnhancedTestRunner';
import { GlobalContextPanel } from './GlobalContextPanel';
import { ConvertToModuleDialog, useModuleManager } from './ModuleManager';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { PromptLibrary } from './PromptLibrary';
import { AdminConfigModal, loadAdminConfig, type AdminBuilderConfig } from './AdminConfigModal';
import { RunHistoryPanel } from './RunHistoryPanel';
import { InlineAddButton } from './InlineAddButton';
import { AGENT_NODE_REGISTRY } from './agentNodeRegistry';
import { useGraphValidation } from './useGraphValidation';
import { useAutoLayout } from './useAutoLayout';
import { useAdminRole } from '@/hooks/useAdminRole';
import type { AgentCanvasNodeData, AgentNodePaletteItem, GlobalContext, ModuleDefinition, TestRunResult } from './types';
import type { CanvasTemplate } from './canvasTemplates';

interface AgentCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  agentName?: string;
  agentId?: string;
  onSave: (data: { name: string; nodes: Node[]; edges: Edge[]; globalContext?: GlobalContext }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

// Custom edge with label
function LabeledEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, targetHandleId, style, ...props }: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const label = sourceHandleId || '';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ ...style, stroke: 'hsl(var(--primary))', strokeWidth: 2 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="px-1.5 py-0.5 rounded bg-card border border-border text-[9px] text-muted-foreground font-medium shadow-sm"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = {
  agentNode: AgentNode as any,
};

const edgeTypes: EdgeTypes = {
  labeled: LabeledEdge as any,
};

type RightPanel = 'none' | 'inspector' | 'test' | 'globals' | 'history';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(agentName);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showModuleDialog, setShowModuleDialog] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showAdminConfig, setShowAdminConfig] = useState(false);
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const [runHistory, setRunHistory] = useState<TestRunResult[]>([]);
  const [adminConfig, setAdminConfig] = useState<AdminBuilderConfig>(loadAdminConfig);
  const [inlineAdd, setInlineAdd] = useState<{ position: { x: number; y: number }; sourceNodeId: string; sourceHandleId: string } | null>(null);
  const [globalContext, setGlobalContext] = useState<GlobalContext>({
    envVars: [],
    sharedContext: { company_id: '', user_id: '', environment: 'development', default_llm: 'anthropic/claude-sonnet-4-5', default_temperature: 0.7 },
    authBindings: [],
  });

  const { isAdmin } = useAdminRole();

  // Module management
  const { modules, updateModules } = useModuleManager();

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

  // Multi-select tracking
  const selectedNodeIds = useMemo(() => {
    return nodes.filter(n => n.selected).map(n => n.id);
  }, [nodes]);

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

  // Connection validation with type checking
  const isValidConnection = useCallback((connection: Connection) => {
    if (connection.source === connection.target) return false;
    const exists = edges.some(
      e => e.source === connection.source && e.target === connection.target &&
           e.sourceHandle === connection.sourceHandle && e.targetHandle === connection.targetHandle
    );
    if (exists) return false;

    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (sourceNode && targetNode) {
      const sourceData = sourceNode.data as unknown as AgentCanvasNodeData;
      const targetData = targetNode.data as unknown as AgentCanvasNodeData;
      const sourcePort = sourceData.outputs?.find(o => o.key === connection.sourceHandle);
      const targetPort = targetData.inputs?.find(i => i.key === connection.targetHandle);
      if (sourcePort && targetPort) {
        if (sourcePort.type !== 'any' && targetPort.type !== 'any' && sourcePort.type !== targetPort.type) {
          toast.warning(`Type mismatch: ${sourcePort.type} → ${targetPort.type}`, { duration: 2000 });
        }
      }
    }

    return true;
  }, [edges, nodes]);

  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory();
      setEdges(eds => addEdge({
        ...params,
        type: 'labeled',
        animated: true,
        style: { stroke: 'hsl(var(--primary))' },
      }, eds));
    },
    [setEdges, pushHistory]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setRightPanel('inspector');
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setInlineAdd(null);
    if (rightPanel === 'inspector') setRightPanel('none');
  }, [rightPanel]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const createNodeFromItem = useCallback((item: AgentNodePaletteItem, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: `anode_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'agentNode',
      position,
      data: {
        label: item.label,
        nodeType: item.type,
        icon: item.icon,
        category: item.category,
        inputs: item.inputs,
        outputs: item.outputs,
        configSchema: item.configSchema,
        config: {},
        description: item.description,
        tags: item.tags,
      } satisfies AgentCanvasNodeData as unknown as Record<string, unknown>,
    };
    return newNode;
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
      const newNode = createNodeFromItem(registryItem, position);
      setNodes(nds => [...nds, newNode]);
    },
    [setNodes, pushHistory, createNodeFromItem]
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

  const handleLabelChange = useCallback(
    (nodeId: string, label: string) => {
      setNodes(nds =>
        nds.map(n =>
          n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
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
      setRightPanel('none');
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

  // Inline add node from "+" button
  const handleInlineAddNode = useCallback((item: AgentNodePaletteItem, sourceNodeId: string, sourceHandleId: string) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    pushHistory();
    const position = { x: sourceNode.position.x + 320, y: sourceNode.position.y };
    const newNode = createNodeFromItem(item, position);
    setNodes(nds => [...nds, newNode]);

    // Auto-connect
    const targetInput = item.inputs[0];
    if (targetInput) {
      setEdges(eds => addEdge({
        source: sourceNodeId,
        sourceHandle: sourceHandleId,
        target: newNode.id,
        targetHandle: targetInput.key,
        type: 'labeled',
        animated: true,
        style: { stroke: 'hsl(var(--primary))' },
      }, eds));
    }

    setSelectedNodeId(newNode.id);
    setRightPanel('inspector');
    toast.success(`Added "${item.label}"`);
  }, [nodes, setNodes, setEdges, pushHistory, createNodeFromItem]);

  // Module creation
  const handleConvertToModule = useCallback((module: ModuleDefinition) => {
    updateModules([...modules, module]);
  }, [modules, updateModules]);

  const handleDeleteModule = useCallback((id: string) => {
    updateModules(modules.filter(m => m.id !== id));
    toast.success('Module deleted');
  }, [modules, updateModules]);

  const handleInsertModule = useCallback((module: ModuleDefinition) => {
    toast.info(`Module "${module.name}" — use as reference template`);
  }, []);

  // Run history callback
  const handleRunComplete = useCallback((result: TestRunResult) => {
    setRunHistory(prev => [result, ...prev].slice(0, 20));
  }, []);

  // Export graph JSON
  const handleExport = useCallback(() => {
    const graphData = { name, nodes, edges, globalContext };
    const blob = new Blob([JSON.stringify(graphData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'agent-graph'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Graph exported');
  }, [name, nodes, edges, globalContext]);

  // Import graph JSON
  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.nodes && Array.isArray(data.nodes)) {
          pushHistory();
          setNodes(data.nodes);
          setEdges(data.edges || []);
          if (data.name) setName(data.name);
          if (data.globalContext) setGlobalContext(data.globalContext);
          toast.success('Graph imported');
        } else {
          toast.error('Invalid graph file');
        }
      } catch {
        toast.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [setNodes, setEdges, pushHistory]);

  // Toggle right panel
  const togglePanel = useCallback((panel: RightPanel) => {
    setRightPanel(prev => prev === panel ? 'none' : panel);
    if (panel !== 'inspector') setSelectedNodeId(null);
  }, []);

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
      if (isMeta && e.key === 'Enter') {
        e.preventDefault();
        setRightPanel('test');
      }
      // Select all with Ctrl+A
      if (isMeta && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
      }
      // Zoom shortcuts
      if (isMeta && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        // handled by ReactFlow controls
      }
      if (isMeta && e.key === '-') {
        e.preventDefault();
        // handled by ReactFlow controls
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedNodeId, nodes, copiedNode, duplicateNode, setNodes]);

  const handleSave = () => {
    onSave({ name, nodes, edges, globalContext });
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
    toast.success('Solution created');
  };

  // Handle selecting a run from history
  const handleSelectRun = useCallback((run: TestRunResult) => {
    setRightPanel('test');
  }, []);

  // Filter palette based on admin config
  const filteredModules = useMemo(() => {
    if (isAdmin) return modules;
    return modules.filter(m => !adminConfig.lockedModules.includes(m.id) || adminConfig.cloneableModules.includes(m.id));
  }, [modules, adminConfig, isAdmin]);

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />

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
          {(isAdmin || adminConfig.wizardVisible) && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowWizard(true)} title="Wizard / AI Generate">
              <Sparkles className="h-4 w-4" />
            </Button>
          )}
          {(isAdmin || adminConfig.templatesVisible) && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTemplates(true)} title="Templates">
              <FileText className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPromptLibrary(true)} title="Prompt & Schema Library">
            <BookOpen className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => autoLayout(nodes, edges)} title="Auto Layout">
            <LayoutGrid className="h-4 w-4" />
          </Button>
          {selectedNodeIds.length >= 2 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowModuleDialog(true)} title="Convert to Module">
              <Package className="h-4 w-4" />
            </Button>
          )}
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport} title="Export JSON" disabled={nodes.length === 0}>
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Import JSON">
            <Upload className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            variant={rightPanel === 'globals' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => togglePanel('globals')}
            title="Global Context"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            variant={rightPanel === 'test' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => togglePanel('test')}
            title="Test Console (Ctrl+Enter)"
          >
            <Play className="h-4 w-4" />
          </Button>
          <Button
            variant={rightPanel === 'history' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => togglePanel('history')}
            title="Run History"
          >
            <History className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAdminConfig(true)} title="Admin Config">
              <Shield className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts">
            <Keyboard className="h-4 w-4" />
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
        <AgentNodePalette
          onDragStart={onDragStart}
          modules={filteredModules}
          onDeleteModule={handleDeleteModule}
          onInsertModule={handleInsertModule}
          adminConfig={adminConfig}
          isAdmin={isAdmin}
        />

        <div className="flex-1 flex flex-col relative">
          <div className="flex-1" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodesWithValidation}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode="Shift"
              snapToGrid
              snapGrid={[16, 16]}
              className="bg-background"
              defaultEdgeOptions={{
                type: 'labeled',
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
                      Start with a Trigger node, add processing steps, and end with an Output node.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
                        <Sparkles className="h-4 w-4 mr-1" /> AI Generate
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

          {/* Inline add popover */}
          {inlineAdd && (
            <InlineAddButton
              position={inlineAdd.position}
              sourceNodeId={inlineAdd.sourceNodeId}
              sourceHandleId={inlineAdd.sourceHandleId}
              onAddNode={handleInlineAddNode}
              onClose={() => setInlineAdd(null)}
            />
          )}
        </div>

        {/* Right panels */}
        {rightPanel === 'inspector' && selectedNode && (
          <EnhancedInspector
            node={selectedNode}
            onConfigChange={handleConfigChange}
            onLabelChange={handleLabelChange}
            onClose={() => { setSelectedNodeId(null); setRightPanel('none'); }}
            onDelete={handleDeleteNode}
            onOpenPromptLibrary={() => setShowPromptLibrary(true)}
          />
        )}

        {rightPanel === 'test' && (
          <EnhancedTestRunner
            agentId={agentId || null}
            nodes={nodes}
            edges={edges}
            onClose={() => setRightPanel('none')}
            onHighlightNode={(nodeId) => {
              setSelectedNodeId(nodeId);
            }}
            onRunComplete={handleRunComplete}
          />
        )}

        {rightPanel === 'globals' && (
          <GlobalContextPanel
            context={globalContext}
            onChange={setGlobalContext}
            onClose={() => setRightPanel('none')}
          />
        )}

        {rightPanel === 'history' && (
          <RunHistoryPanel
            runs={runHistory}
            onSelectRun={handleSelectRun}
            onClose={() => setRightPanel('none')}
          />
        )}
      </div>

      {/* Templates picker */}
      <CanvasTemplatesPicker
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelect={handleLoadTemplate}
      />

      {/* Wizard with AI generation */}
      <AgentCanvasWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        onComplete={handleWizardComplete}
      />

      {/* Keyboard shortcuts help */}
      <KeyboardShortcutsHelp
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />

      {/* Prompt & Schema Library */}
      <PromptLibrary
        open={showPromptLibrary}
        onOpenChange={setShowPromptLibrary}
      />

      {/* Admin Config Modal */}
      {isAdmin && (
        <AdminConfigModal
          open={showAdminConfig}
          onOpenChange={setShowAdminConfig}
          modules={modules}
          onConfigChange={setAdminConfig}
        />
      )}

      {/* Convert to module dialog */}
      <ConvertToModuleDialog
        open={showModuleDialog}
        onOpenChange={setShowModuleDialog}
        selectedNodes={nodes.filter(n => selectedNodeIds.includes(n.id))}
        selectedEdges={edges.filter(e => selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target))}
        onConvert={handleConvertToModule}
      />
    </div>
  );
}
