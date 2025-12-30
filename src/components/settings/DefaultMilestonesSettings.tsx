import { useState } from 'react';
import { Plus, Pencil, Trash2, Flag, ChevronDown, GripVertical } from 'lucide-react';
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
import { useDefaultMilestones, DefaultMilestone } from '@/contexts/DefaultMilestonesContext';
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

interface SortableMilestoneItemProps {
  milestone: DefaultMilestone;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}

function SortableMilestoneItem({ milestone, onEdit, onDelete, isAdmin }: SortableMilestoneItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg ${isDragging ? 'opacity-50' : ''}`}
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
        <div>
          <span className="font-medium">{milestone.title}</span>
          <p className="text-sm text-muted-foreground">
            {milestone.daysFromCreation} days after deal creation
          </p>
        </div>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(milestone.id)}
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
                <AlertDialogTitle>Delete "{milestone.title}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the default milestone. Existing deals will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(milestone.id)}>
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

interface DefaultMilestonesSettingsProps {
  isAdmin?: boolean;
}

export function DefaultMilestonesSettings({ isAdmin = true }: DefaultMilestonesSettingsProps) {
  const {
    defaultMilestones,
    addDefaultMilestone,
    updateDefaultMilestone,
    deleteDefaultMilestone,
    reorderDefaultMilestones,
  } = useDefaultMilestones();

  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('settings-default-milestones-open');
    return saved !== null ? saved === 'true' : false;
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [daysFromCreation, setDaysFromCreation] = useState(7);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('settings-default-milestones-open', String(open));
  };

  const openAddDialog = () => {
    setEditingId(null);
    setTitle('');
    setDaysFromCreation(7);
    setIsDialogOpen(true);
  };

  const openEditDialog = (id: string) => {
    const milestone = defaultMilestones.find(m => m.id === id);
    if (milestone) {
      setEditingId(id);
      setTitle(milestone.title);
      setDaysFromCreation(milestone.daysFromCreation);
      setIsDialogOpen(true);
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: 'Error', description: 'Milestone title is required', variant: 'destructive' });
      return;
    }

    if (daysFromCreation < 0) {
      toast({ title: 'Error', description: 'Days must be 0 or greater', variant: 'destructive' });
      return;
    }

    if (editingId) {
      updateDefaultMilestone(editingId, { title: title.trim(), daysFromCreation });
      toast({ title: 'Default milestone updated' });
    } else {
      addDefaultMilestone({ title: title.trim(), daysFromCreation });
      toast({ title: 'Default milestone added' });
    }

    setIsDialogOpen(false);
    setTitle('');
    setDaysFromCreation(7);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    deleteDefaultMilestone(id);
    toast({ title: 'Default milestone deleted' });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = defaultMilestones.findIndex(m => m.id === active.id);
    const newIndex = defaultMilestones.findIndex(m => m.id === over.id);
    const reordered = arrayMove(defaultMilestones, oldIndex, newIndex);
    reorderDefaultMilestones(reordered);
  };

  const sortedMilestones = [...defaultMilestones].sort((a, b) => a.position - b.position);

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
                    Default Deal Milestones
                  </CardTitle>
                  <CardDescription>Milestones automatically added to new deals</CardDescription>
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
                <SortableContext
                  items={sortedMilestones.map(m => m.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {sortedMilestones.map((milestone) => (
                      <SortableMilestoneItem
                        key={milestone.id}
                        milestone={milestone}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                        isAdmin={isAdmin}
                      />
                    ))}
                    {sortedMilestones.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No default milestones configured. Add one to get started.
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
            <DialogTitle>{editingId ? 'Edit Default Milestone' : 'Add Default Milestone'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="milestoneTitle">Milestone Title *</Label>
              <Input
                id="milestoneTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Due Diligence Complete"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="daysFromCreation">Days After Deal Creation *</Label>
              <Input
                id="daysFromCreation"
                type="number"
                min={0}
                value={daysFromCreation}
                onChange={(e) => setDaysFromCreation(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                The due date will be set this many days after the deal is created
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleSubmit}>
              {editingId ? 'Save Changes' : 'Add Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
