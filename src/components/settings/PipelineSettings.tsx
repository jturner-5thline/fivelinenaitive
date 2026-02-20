import { useState } from 'react';
import { Plus, Pencil, Trash2, Star, Layers, ChevronDown, ChevronRight, GripVertical, Loader2, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { DealStageOption } from '@/contexts/DealStagesContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STAGE_COLORS = [
  { value: 'bg-slate-500', label: 'Slate' },
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-indigo-500', label: 'Indigo' },
  { value: 'bg-violet-500', label: 'Violet' },
  { value: 'bg-purple-500', label: 'Purple' },
  { value: 'bg-fuchsia-500', label: 'Fuchsia' },
  { value: 'bg-amber-500', label: 'Amber' },
  { value: 'bg-cyan-500', label: 'Cyan' },
  { value: 'bg-green-500', label: 'Green' },
  { value: 'bg-red-500', label: 'Red' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-yellow-500', label: 'Yellow' },
];

const DEFAULT_STAGES: DealStageOption[] = [
  { id: 'new', label: 'New', color: 'bg-blue-500' },
  { id: 'in-progress', label: 'In Progress', color: 'bg-amber-500' },
  { id: 'closed', label: 'Closed', color: 'bg-green-500' },
];

interface PipelineSettingsProps {
  isAdmin?: boolean;
}

function SortableStageItem({ stage, onEdit, onDelete }: {
  stage: DealStageOption;
  onEdit: (stage: DealStageOption) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={`flex items-center gap-2 p-2 bg-muted/50 rounded-lg ${isDragging ? 'opacity-50' : ''}`}>
      <button className="cursor-grab hover:bg-muted p-1 rounded" {...attributes} {...listeners}>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className={`w-3 h-3 rounded-full ${stage.color}`} />
      <span className="flex-1 text-sm">{stage.label}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(stage)}>
        <Pencil className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(stage.id)}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function PipelineSettings({ isAdmin = true }: PipelineSettingsProps) {
  const { pipelines, createPipeline, updatePipeline, deletePipeline, refetch, isLoading } = usePipelineContext();

  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('pipelineSettingsOpen');
    return saved ? JSON.parse(saved) : true;
  });

  // Pipeline create/edit dialog
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null);
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineStages, setPipelineStages] = useState<DealStageOption[]>(DEFAULT_STAGES);
  const [pipelineIsDefault, setPipelineIsDefault] = useState(false);
  const [isSavingPipeline, setIsSavingPipeline] = useState(false);

  // Original state for unsaved changes detection
  const [originalName, setOriginalName] = useState('');
  const [originalStages, setOriginalStages] = useState<DealStageOption[]>([]);
  const [originalIsDefault, setOriginalIsDefault] = useState(false);

  // Unsaved changes confirmation
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);

  // Stage add/edit dialog
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<DealStageOption | null>(null);
  const [stageLabel, setStageLabel] = useState('');
  const [stageColor, setStageColor] = useState('bg-slate-500');

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPipelineId, setDeletingPipelineId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Expanded pipeline cards
  const [expandedPipelines, setExpandedPipelines] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleExpanded = (id: string) => {
    setExpandedPipelines(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasPipelineChanges = () => {
    return pipelineName !== originalName ||
      JSON.stringify(pipelineStages) !== JSON.stringify(originalStages) ||
      pipelineIsDefault !== originalIsDefault;
  };

  const handlePipelineDialogClose = (open: boolean) => {
    if (!open && hasPipelineChanges()) {
      setUnsavedConfirmOpen(true);
      return;
    }
    setPipelineDialogOpen(open);
  };

  const handleDiscardChanges = () => {
    setUnsavedConfirmOpen(false);
    setPipelineDialogOpen(false);
  };

  const handleSaveFromConfirm = async () => {
    setUnsavedConfirmOpen(false);
    await handleSavePipeline();
  };

  // Open create pipeline dialog
  const handleCreatePipeline = () => {
    setEditingPipelineId(null);
    setPipelineName('');
    setPipelineStages(DEFAULT_STAGES);
    setPipelineIsDefault(pipelines.length === 0);
    setOriginalName('');
    setOriginalStages(DEFAULT_STAGES);
    setOriginalIsDefault(pipelines.length === 0);
    setPipelineDialogOpen(true);
  };

  // Open edit pipeline dialog
  const handleEditPipeline = (pipeline: typeof pipelines[0]) => {
    setEditingPipelineId(pipeline.id);
    setPipelineName(pipeline.name);
    setPipelineStages([...pipeline.stages]);
    setPipelineIsDefault(pipeline.isDefault);
    setOriginalName(pipeline.name);
    setOriginalStages([...pipeline.stages]);
    setOriginalIsDefault(pipeline.isDefault);
    setPipelineDialogOpen(true);
  };

  // Save pipeline (create or update)
  const handleSavePipeline = async () => {
    if (!pipelineName.trim()) {
      toast.error('Pipeline name is required');
      return;
    }
    if (pipelineStages.length === 0) {
      toast.error('Pipeline must have at least one stage');
      return;
    }

    setIsSavingPipeline(true);
    try {
      if (editingPipelineId) {
        await updatePipeline(editingPipelineId, {
          name: pipelineName.trim(),
          stages: pipelineStages,
          isDefault: pipelineIsDefault,
        });
        toast.success('Pipeline updated');
      } else {
        const pipeline = await createPipeline(pipelineName.trim(), pipelineStages, pipelineIsDefault);
        if (pipeline) {
          toast.success('Pipeline created');
        }
      }
      setPipelineDialogOpen(false);
      await refetch();
    } catch {
      toast.error('Failed to save pipeline');
    } finally {
      setIsSavingPipeline(false);
    }
  };

  // Delete pipeline
  const handleDeletePipeline = async () => {
    if (!deletingPipelineId) return;
    setIsDeleting(true);
    try {
      await deletePipeline(deletingPipelineId);
      toast.success('Pipeline deleted');
      setDeleteDialogOpen(false);
      setDeletingPipelineId(null);
    } catch {
      toast.error('Failed to delete pipeline');
    } finally {
      setIsDeleting(false);
    }
  };

  // Stage management within pipeline dialog
  const openAddStageDialog = () => {
    setEditingStage(null);
    setStageLabel('');
    setStageColor('bg-slate-500');
    setStageDialogOpen(true);
  };

  const openEditStageDialog = (stage: DealStageOption) => {
    setEditingStage(stage);
    setStageLabel(stage.label);
    setStageColor(stage.color);
    setStageDialogOpen(true);
  };

  const handleSaveStage = () => {
    if (!stageLabel.trim()) {
      toast.error('Stage name is required');
      return;
    }
    if (editingStage) {
      setPipelineStages(prev => prev.map(s => s.id === editingStage.id ? { ...s, label: stageLabel.trim(), color: stageColor } : s));
    } else {
      const id = stageLabel.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now();
      setPipelineStages(prev => [...prev, { id, label: stageLabel.trim(), color: stageColor }]);
    }
    setStageDialogOpen(false);
  };

  const handleDeleteStage = (id: string) => {
    if (pipelineStages.length <= 1) {
      toast.error('Pipeline must have at least one stage');
      return;
    }
    setPipelineStages(prev => prev.filter(s => s.id !== id));
  };

  const handleStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = pipelineStages.findIndex(s => s.id === active.id);
      const newIndex = pipelineStages.findIndex(s => s.id === over.id);
      setPipelineStages(arrayMove(pipelineStages, oldIndex, newIndex));
    }
  };

  // Quick inline update for pipeline stages (from expanded view)
  const handleQuickSaveStages = async (pipelineId: string, stages: DealStageOption[]) => {
    try {
      await updatePipeline(pipelineId, { stages });
      toast.success('Stages updated');
      await refetch();
    } catch {
      toast.error('Failed to update stages');
    }
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Pipelines</CardTitle>
              <CardDescription>Only company admins can manage pipelines</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {pipelines.map(p => (
              <div key={p.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{p.name}</span>
                {p.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{p.stages.length} stages</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={(v) => { setIsOpen(v); localStorage.setItem('pipelineSettingsOpen', JSON.stringify(v)); }}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Layers className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Pipelines</CardTitle>
                    <CardDescription>Manage your deal pipelines and their stages</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{pipelines.length}</Badge>
                  {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {pipelines.map(pipeline => (
                    <div key={pipeline.id} className="border rounded-lg">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => toggleExpanded(pipeline.id)}
                      >
                        <div className="flex items-center gap-2">
                          {expandedPipelines.has(pipeline.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-medium text-sm">{pipeline.name}</span>
                          {pipeline.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                        </div>
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          <span className="text-xs text-muted-foreground mr-2">{pipeline.stages.length} stages</span>
                          {!pipeline.isDefault && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { updatePipeline(pipeline.id, { isDefault: true }); toast.success('Set as default'); refetch(); }} title="Set as default">
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {pipeline.isDefault && (
                            <Star className="h-3.5 w-3.5 text-primary fill-current mx-1.5" />
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditPipeline(pipeline)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => { setDeletingPipelineId(pipeline.id); setDeleteDialogOpen(true); }}
                            disabled={pipelines.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {expandedPipelines.has(pipeline.id) && (
                        <div className="px-3 pb-3 pt-1 border-t space-y-1.5">
                          {pipeline.stages.map(stage => (
                            <div key={stage.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded">
                              <div className={`w-2.5 h-2.5 rounded-full ${stage.color}`} />
                              <span className="text-sm">{stage.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <Button variant="outline" size="sm" onClick={handleCreatePipeline} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Pipeline
                  </Button>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Create/Edit Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={handlePipelineDialogClose}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{editingPipelineId ? 'Edit Pipeline' : 'Create Pipeline'}</DialogTitle>
                <DialogDescription>
                  {editingPipelineId ? 'Modify pipeline name and stages' : 'Set up a new pipeline with custom stages'}
                </DialogDescription>
              </div>
              <div className="flex items-center shrink-0 mr-6">
                <Button variant="gradient" size="sm" onClick={handleSavePipeline} disabled={isSavingPipeline} className="gap-1.5">
                  {isSavingPipeline ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingPipelineId ? 'Save' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pipeline-name">Pipeline Name</Label>
              <Input
                id="pipeline-name"
                value={pipelineName}
                onChange={e => setPipelineName(e.target.value)}
                placeholder="e.g., Commercial Real Estate"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Set as Default Pipeline</Label>
              <Button
                variant={pipelineIsDefault ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPipelineIsDefault(!pipelineIsDefault)}
                className="gap-1.5"
              >
                <Star className={`h-3.5 w-3.5 ${pipelineIsDefault ? 'fill-current' : ''}`} />
                {pipelineIsDefault ? 'Default' : 'Not Default'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stages ({pipelineStages.length})</Label>
                <Button variant="outline" size="sm" onClick={openAddStageDialog}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Stage
                </Button>
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
                <SortableContext items={pipelineStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {pipelineStages.map(stage => (
                      <SortableStageItem
                        key={stage.id}
                        stage={stage}
                        onEdit={openEditStageDialog}
                        onDelete={handleDeleteStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* Add/Edit Stage Dialog */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>{editingStage ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-label">Stage Name</Label>
              <Input
                id="stage-label"
                value={stageLabel}
                onChange={e => setStageLabel(e.target.value)}
                placeholder="e.g., In Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {STAGE_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setStageColor(c.value)}
                    className={`w-8 h-8 rounded-full ${c.value} transition-all ${stageColor === c.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : 'hover:scale-110'}`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>Cancel</Button>
            <Button variant="gradient" onClick={handleSaveStage}>{editingStage ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this pipeline? Deals assigned to it will not be deleted but will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePipeline} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Confirmation */}
      <AlertDialog open={unsavedConfirmOpen} onOpenChange={setUnsavedConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Would you like to save them before closing?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardChanges}>Discard</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveFromConfirm}>Save Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
