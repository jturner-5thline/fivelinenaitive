import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Layers } from 'lucide-react';
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
import { toast } from '@/hooks/use-toast';
import { useLenderStages, StageOption } from '@/contexts/LenderStagesContext';

interface SortableStageItemProps {
  stage: StageOption;
  index: number;
  onEdit: (stage: StageOption) => void;
  onDelete: (stage: StageOption) => void;
}

function SortableStageItem({ stage, index, onEdit, onDelete }: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
        <p className="font-medium">{stage.label}</p>
      </div>
      <div className="flex items-center gap-1">
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
                This will remove the stage from available options. Existing deals using this stage won't be affected.
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
  );
}

export function LenderStagesSettings() {
  const { stages, addStage, updateStage, deleteStage, reorderStages } = useLenderStages();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<StageOption | null>(null);
  const [label, setLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const openAddDialog = () => {
    setEditingStage(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (stage: StageOption) => {
    setEditingStage(stage);
    setLabel(stage.label);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Stage name is required', variant: 'destructive' });
      return;
    }

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

    setIsDialogOpen(false);
    setLabel('');
    setEditingStage(null);
  };

  const handleDelete = (stage: StageOption) => {
    deleteStage(stage.id);
    toast({ title: 'Stage deleted', description: `${stage.label} has been removed.` });
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

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Lender Stages
            </CardTitle>
            <CardDescription>Configure the stages for tracking lender progress. Drag to reorder.</CardDescription>
          </div>
          <Button onClick={openAddDialog} size="sm" className="gap-1">
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
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
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
            <DialogTitle>{editingStage ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="stageName">Stage Name *</Label>
              <Input
                id="stageName"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter stage name"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingStage ? 'Save Changes' : 'Add Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
