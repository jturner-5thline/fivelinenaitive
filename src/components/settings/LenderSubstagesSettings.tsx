import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, GitBranch } from 'lucide-react';
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

interface SortableSubstageItemProps {
  substage: StageOption;
  index: number;
  onEdit: (substage: StageOption) => void;
  onDelete: (substage: StageOption) => void;
}

function SortableSubstageItem({ substage, index, onEdit, onDelete }: SortableSubstageItemProps) {
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
        <p className="font-medium">{substage.label}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(substage)}
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
              <AlertDialogTitle>Delete "{substage.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the substage from available options. Existing deals using this substage won't be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(substage)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function LenderSubstagesSettings() {
  const { substages, addSubstage, updateSubstage, deleteSubstage, reorderSubstages } = useLenderStages();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubstage, setEditingSubstage] = useState<StageOption | null>(null);
  const [label, setLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const openAddDialog = () => {
    setEditingSubstage(null);
    setLabel('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (substage: StageOption) => {
    setEditingSubstage(substage);
    setLabel(substage.label);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Substage name is required', variant: 'destructive' });
      return;
    }

    if (editingSubstage) {
      updateSubstage(editingSubstage.id, { label: label.trim() });
      toast({ title: 'Substage updated', description: `${label.trim()} has been updated.` });
    } else {
      const exists = substages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
      if (exists) {
        toast({ title: 'Error', description: 'A substage with this name already exists', variant: 'destructive' });
        return;
      }
      addSubstage({ label: label.trim() });
      toast({ title: 'Substage added', description: `${label.trim()} has been added.` });
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingSubstage(null);
  };

  const handleDelete = (substage: StageOption) => {
    deleteSubstage(substage.id);
    toast({ title: 'Substage deleted', description: `${substage.label} has been removed.` });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = substages.findIndex((s) => s.id === active.id);
      const newIndex = substages.findIndex((s) => s.id === over.id);
      const newSubstages = arrayMove(substages, oldIndex, newIndex);
      reorderSubstages(newSubstages);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Lender Substages
            </CardTitle>
            <CardDescription>Configure substage options for more detailed lender tracking. Drag to reorder.</CardDescription>
          </div>
          <Button onClick={openAddDialog} size="sm" className="gap-1">
            <Plus className="h-4 w-4" />
            Add Substage
          </Button>
        </CardHeader>
        <CardContent>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={substages.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {substages.map((substage, index) => (
                  <SortableSubstageItem
                    key={substage.id}
                    substage={substage}
                    index={index}
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                  />
                ))}
                {substages.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No substages configured. Add one to get started.
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
            <DialogTitle>{editingSubstage ? 'Edit Substage' : 'Add Substage'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="substageName">Substage Name *</Label>
              <Input
                id="substageName"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter substage name"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingSubstage ? 'Save Changes' : 'Add Substage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}