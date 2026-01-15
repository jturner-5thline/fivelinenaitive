import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Flag, ChevronDown } from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { useLenderStages, SubstageOption } from '@/contexts/LenderStagesContext';
import { SaveIndicator } from '@/components/ui/save-indicator';

interface SortableSubstageItemProps {
  substage: SubstageOption;
  index: number;
  onEdit: (substage: SubstageOption) => void;
  onDelete: (substage: SubstageOption) => void;
  isAdmin: boolean;
}

function SortableSubstageItem({ substage, index, onEdit, onDelete, isAdmin }: SortableSubstageItemProps) {
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
        {isAdmin && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
        <p className="font-medium">{substage.label}</p>
      </div>
      {isAdmin && (
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
                  This will remove the milestone from available options. Existing deals using this milestone won't be affected.
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
      )}
    </div>
  );
}

interface LenderSubstagesSettingsProps {
  isAdmin?: boolean;
}

export function LenderSubstagesSettings({ isAdmin = true }: LenderSubstagesSettingsProps) {
  const { substages, addSubstage, updateSubstage, deleteSubstage, reorderSubstages, isSaving } = useLenderStages();
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('settings-lender-milestones-open');
    return saved !== null ? saved === 'true' : false;
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('settings-lender-milestones-open', String(open));
  };
  const [editingSubstage, setEditingSubstage] = useState<SubstageOption | null>(null);
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

  const openEditDialog = (substage: SubstageOption) => {
    setEditingSubstage(substage);
    setLabel(substage.label);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Milestone name is required', variant: 'destructive' });
      return;
    }

    if (editingSubstage) {
      updateSubstage(editingSubstage.id, { label: label.trim() });
      toast({ title: 'Milestone updated', description: `${label.trim()} has been updated.` });
    } else {
      const exists = substages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
      if (exists) {
        toast({ title: 'Error', description: 'A milestone with this name already exists', variant: 'destructive' });
        return;
      }
      addSubstage({ label: label.trim() });
      toast({ title: 'Milestone added', description: `${label.trim()} has been added.` });
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingSubstage(null);
  };

  const handleDelete = (substage: SubstageOption) => {
    deleteSubstage(substage.id);
    toast({ title: 'Milestone deleted', description: `${substage.label} has been removed.` });
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
      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-left flex-1">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Flag className="h-5 w-5" />
                    Lender Milestones
                    <SaveIndicator isSaving={isSaving} showSuccess={!isSaving} teamSync />
                  </CardTitle>
                  <CardDescription>Configure milestone options for detailed lender tracking. Changes sync to your entire team.</CardDescription>
                </div>
              </button>
            </CollapsibleTrigger>
            {isAdmin && (
              <Button variant="gradient" onClick={(e) => { e.stopPropagation(); openAddDialog(); }} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Add Milestone
              </Button>
            )}
          </CardHeader>
          <CollapsibleContent>
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
                        isAdmin={isAdmin}
                      />
                    ))}
                    {substages.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No milestones configured. Add one to get started.
                      </p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubstage ? 'Edit Milestone' : 'Add Milestone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="substageName">Milestone Name *</Label>
              <Input
                id="substageName"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Enter milestone name"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit}>
              {editingSubstage ? 'Save Changes' : 'Add Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}