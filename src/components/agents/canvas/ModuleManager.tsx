import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';
import type { ModuleDefinition, AgentCanvasNodeData } from './types';

interface ModuleManagerProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeIds: string[];
  modules: ModuleDefinition[];
  onModulesChange: (modules: ModuleDefinition[]) => void;
  onInsertModule: (module: ModuleDefinition) => void;
}

const STORAGE_KEY = 'agent-canvas-modules';

function loadModules(): ModuleDefinition[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveModules(modules: ModuleDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
}

export function useModuleManager() {
  const [modules, setModules] = useState<ModuleDefinition[]>(loadModules);

  const updateModules = useCallback((newModules: ModuleDefinition[]) => {
    setModules(newModules);
    saveModules(newModules);
  }, []);

  return { modules, updateModules };
}

export function ConvertToModuleDialog({
  open,
  onOpenChange,
  selectedNodes,
  selectedEdges,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNodes: Node[];
  selectedEdges: Edge[];
  onConvert: (module: ModuleDefinition) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📦');

  const handleConvert = () => {
    if (!name.trim()) {
      toast.error('Module name is required');
      return;
    }

    // Determine module I/O from unconnected ports
    const nodeIds = new Set(selectedNodes.map(n => n.id));
    const internalEdges = selectedEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    
    // External inputs: target handles of selected nodes connected from outside
    const externalInputEdges = selectedEdges.filter(e => !nodeIds.has(e.source) && nodeIds.has(e.target));
    const inputs = externalInputEdges.map(e => {
      const targetNode = selectedNodes.find(n => n.id === e.target);
      const nodeData = targetNode?.data as unknown as AgentCanvasNodeData;
      const port = nodeData?.inputs?.find(i => i.key === e.targetHandle);
      return port || { key: e.targetHandle || 'input', type: 'any' as const };
    });

    // External outputs: source handles of selected nodes connected to outside  
    const externalOutputEdges = selectedEdges.filter(e => nodeIds.has(e.source) && !nodeIds.has(e.target));
    const outputs = externalOutputEdges.map(e => {
      const sourceNode = selectedNodes.find(n => n.id === e.source);
      const nodeData = sourceNode?.data as unknown as AgentCanvasNodeData;
      const port = nodeData?.outputs?.find(o => o.key === e.sourceHandle);
      return port || { key: e.sourceHandle || 'output', type: 'any' as const };
    });

    const module: ModuleDefinition = {
      id: `module_${Date.now()}`,
      name,
      description,
      icon,
      nodeIds: selectedNodes.map(n => n.id),
      edgeIds: internalEdges.map(e => e.id),
      inputs: inputs.length > 0 ? inputs : [{ key: 'input', type: 'any' }],
      outputs: outputs.length > 0 ? outputs : [{ key: 'output', type: 'any' }],
      createdAt: new Date().toISOString(),
    };

    onConvert(module);
    onOpenChange(false);
    setName('');
    setDescription('');
    toast.success(`Module "${name}" created`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Convert to Module
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {selectedNodes.length} node{selectedNodes.length !== 1 ? 's' : ''} selected.
            This creates a reusable module you can drag onto any canvas.
          </p>
          <div className="flex gap-2">
            <div className="space-y-1 w-16">
              <label className="text-xs font-medium">Icon</label>
              <Input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                className="h-8 text-center text-lg"
                maxLength={2}
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Research Pipeline"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this module do?"
              className="text-xs min-h-[60px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleConvert} disabled={!name.trim()}>
            <Package className="h-4 w-4 mr-1" /> Create Module
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ModuleLibraryPanel({
  modules,
  onDelete,
  onInsert,
}: {
  modules: ModuleDefinition[];
  onDelete: (id: string) => void;
  onInsert: (module: ModuleDefinition) => void;
}) {
  if (modules.length === 0) return null;

  return (
    <div className="space-y-1">
      {modules.map(mod => (
        <div
          key={mod.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors group cursor-pointer"
          onClick={() => onInsert(mod)}
        >
          <span className="text-base">{mod.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">{mod.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{mod.description || 'Custom module'}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={e => { e.stopPropagation(); onDelete(mod.id); }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}
