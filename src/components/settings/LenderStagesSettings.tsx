import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Layers, ChevronDown, ChevronRight } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { useLenderStages, StageOption, SubstageOption } from '@/contexts/LenderStagesContext';

interface SortableSubstageItemProps {
  substage: SubstageOption;
  stageId: string;
  index: number;
  onEdit: (stageId: string, substage: SubstageOption) => void;
  onDelete: (stageId: string, substage: SubstageOption) => void;
}

function SortableSubstageItem({ substage, stageId, index, onEdit, onDelete }: SortableSubstageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: substage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 bg-background rounded-md border ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </button>
        <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
        <p className="text-sm">{substage.label}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(stageId, substage)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{substage.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the substage from available options.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(stageId, substage)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

interface SortableStageItemProps {
  stage: StageOption;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: (stage: StageOption) => void;
  onDelete: (stage: StageOption) => void;
  onAddSubstage: (stageId: string) => void;
  onEditSubstage: (stageId: string, substage: SubstageOption) => void;
  onDeleteSubstage: (stageId: string, substage: SubstageOption) => void;
  onReorderSubstages: (stageId: string, substages: SubstageOption[]) => void;
}

function SortableStageItem({ 
  stage, 
  index, 
  isExpanded,
  onToggleExpand,
  onEdit, 
  onDelete,
  onAddSubstage,
  onEditSubstage,
  onDeleteSubstage,
  onReorderSubstages,
}: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSubstageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = stage.substages.findIndex((s) => s.id === active.id);
      const newIndex = stage.substages.findIndex((s) => s.id === over.id);
      const newSubstages = arrayMove(stage.substages, oldIndex, newIndex);
      onReorderSubstages(stage.id, newSubstages);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
      <div
        ref={setNodeRef}
        style={style}
        className={`bg-muted/50 rounded-lg ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
      >
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
            <p className="font-medium">{stage.label}</p>
            {stage.substages.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {stage.substages.length} substage{stage.substages.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => onAddSubstage(stage.id)}
            >
              <Plus className="h-3 w-3" />
              Substage
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(stage)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{stage.label}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the stage and all its substages from available options.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(stage)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <CollapsibleContent>
          <div className="px-3 pb-3 pl-14">
            {stage.substages.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSubstageDragEnd}
              >
                <SortableContext 
                  items={stage.substages.map(s => s.id)} 
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1">
                    {stage.substages.map((substage, idx) => (
                      <SortableSubstageItem
                        key={substage.id}
                        substage={substage}
                        stageId={stage.id}
                        index={idx}
                        onEdit={onEditSubstage}
                        onDelete={onDeleteSubstage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                No substages. Click "+ Substage" to add one.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function LenderStagesSettings() {
  const { 
    stages, 
    addStage, 
    updateStage, 
    deleteStage, 
    reorderStages,
    addSubstage,
    updateSubstage,
    deleteSubstage,
    reorderSubstages,
  } = useLenderStages();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'stage' | 'substage'>('stage');
  const [editingStage, setEditingStage] = useState<StageOption | null>(null);
  const [editingSubstage, setEditingSubstage] = useState<{ stageId: string; substage: SubstageOption } | null>(null);
  const [targetStageId, setTargetStageId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleExpand = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const openAddStageDialog = () => {
    setDialogMode('stage');
    setEditingStage(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditStageDialog = (stage: StageOption) => {
    setDialogMode('stage');
    setEditingStage(stage);
    setLabel(stage.label);
    setIsDialogOpen(true);
  };

  const openAddSubstageDialog = (stageId: string) => {
    setDialogMode('substage');
    setTargetStageId(stageId);
    setEditingSubstage(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditSubstageDialog = (stageId: string, substage: SubstageOption) => {
    setDialogMode('substage');
    setTargetStageId(stageId);
    setEditingSubstage({ stageId, substage });
    setLabel(substage.label);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }

    if (dialogMode === 'stage') {
      if (editingStage) {
        updateStage(editingStage.id, { label: label.trim() });
        toast({ title: 'Stage updated', description: `${label.trim()} has been updated.` });
      } else {
        const exists = stages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
        if (exists) {
          toast({ title: 'Error', description: 'A stage with this name already exists', variant: 'destructive' });
          return;
        }
        addStage({ label: label.trim() });
        toast({ title: 'Stage added', description: `${label.trim()} has been added.` });
      }
    } else {
      if (!targetStageId) return;
      const stage = stages.find(s => s.id === targetStageId);
      if (!stage) return;

      if (editingSubstage) {
        updateSubstage(targetStageId, editingSubstage.substage.id, { label: label.trim() });
        toast({ title: 'Substage updated', description: `${label.trim()} has been updated.` });
      } else {
        const exists = stage.substages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
        if (exists) {
          toast({ title: 'Error', description: 'A substage with this name already exists in this stage', variant: 'destructive' });
          return;
        }
        addSubstage(targetStageId, { label: label.trim() });
        setExpandedStages(prev => new Set(prev).add(targetStageId));
        toast({ title: 'Substage added', description: `${label.trim()} has been added.` });
      }
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingStage(null);
    setEditingSubstage(null);
    setTargetStageId(null);
  };

  const handleDeleteStage = (stage: StageOption) => {
    deleteStage(stage.id);
    toast({ title: 'Stage deleted', description: `${stage.label} has been removed.` });
  };

  const handleDeleteSubstage = (stageId: string, substage: SubstageOption) => {
    deleteSubstage(stageId, substage.id);
    toast({ title: 'Substage deleted', description: `${substage.label} has been removed.` });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((s) => s.id === active.id);
      const newIndex = stages.findIndex((s) => s.id === over.id);
      const newStages = arrayMove(stages, oldIndex, newIndex);
      reorderStages(newStages);
    }
  };

  const getDialogTitle = () => {
    if (dialogMode === 'stage') {
      return editingStage ? 'Edit Stage' : 'Add Stage';
    }
    return editingSubstage ? 'Edit Substage' : 'Add Substage';
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Lender Stages
            </CardTitle>
            <CardDescription>Configure stages and substages for tracking lender progress. Drag to reorder.</CardDescription>
          </div>
          <Button onClick={openAddStageDialog} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add Stage
          </Button>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {stages.map((stage, index) => (
                  <SortableStageItem
                    key={stage.id}
                    stage={stage}
                    index={index}
                    isExpanded={expandedStages.has(stage.id)}
                    onToggleExpand={() => toggleExpand(stage.id)}
                    onEdit={openEditStageDialog}
                    onDelete={handleDeleteStage}
                    onAddSubstage={openAddSubstageDialog}
                    onEditSubstage={openEditSubstageDialog}
                    onDeleteSubstage={handleDeleteSubstage}
                    onReorderSubstages={reorderSubstages}
                  />
                ))}
                {stages.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No stages configured. Add one to get started.
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="itemName">{dialogMode === 'stage' ? 'Stage' : 'Substage'} Name *</Label>
              <Input
                id="itemName"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Enter ${dialogMode} name`}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingStage || editingSubstage ? 'Save Changes' : `Add ${dialogMode === 'stage' ? 'Stage' : 'Substage'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
