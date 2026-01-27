import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Flag, ChevronDown, Save, Loader2, RotateCcw } from 'lucide-react';
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
  const { substages: contextSubstages, addSubstage, updateSubstage, deleteSubstage, reorderSubstages, isSaving: contextSaving } = useLenderStages();
  
  // Local state for pending changes
  const [localSubstages, setLocalSubstages] = useState<SubstageOption[]>(contextSubstages);
  const [savedSubstages, setSavedSubstages] = useState<SubstageOption[]>(contextSubstages);
  const [isSaving, setIsSaving] = useState(false);
  
  // Sync local state when context changes
  useEffect(() => {
    setLocalSubstages(contextSubstages);
    setSavedSubstages(contextSubstages);
  }, [contextSubstages]);

  const hasUnsavedChanges = JSON.stringify(localSubstages) !== JSON.stringify(savedSubstages);

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
      setLocalSubstages(localSubstages.map(s => s.id === editingSubstage.id ? { ...s, label: label.trim() } : s));
    } else {
      const exists = localSubstages.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
      if (exists) {
        toast({ title: 'Error', description: 'A milestone with this name already exists', variant: 'destructive' });
        return;
      }
      const newSubstage: SubstageOption = {
        id: crypto.randomUUID(),
        label: label.trim(),
      };
      setLocalSubstages([...localSubstages, newSubstage]);
    }

    setIsDialogOpen(false);
    setLabel('');
    setEditingSubstage(null);
  };

  const handleDelete = (substage: SubstageOption) => {
    setLocalSubstages(localSubstages.filter(s => s.id !== substage.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localSubstages.findIndex((s) => s.id === active.id);
      const newIndex = localSubstages.findIndex((s) => s.id === over.id);
      setLocalSubstages(arrayMove(localSubstages, oldIndex, newIndex));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Apply all changes to context (which saves to database)
      reorderSubstages(localSubstages);
      setSavedSubstages(localSubstages);
      toast({ title: 'Lender milestones saved', description: 'Your changes have been saved successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save lender milestones', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalSubstages(savedSubstages);
  };

  const SaveBar = () => {
    if (!hasUnsavedChanges && !isSaving) return null;
    
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground">
          {isSaving ? 'Saving changes...' : 'You have unsaved changes'}
        </p>
        <div className="flex items-center gap-2">
          {!isSaving && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button
            variant="gradient"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    );
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
            <CardContent className="space-y-4">
              {/* Top Save Bar */}
              <SaveBar />
              
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={localSubstages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {localSubstages.map((substage, index) => (
                      <SortableSubstageItem
                        key={substage.id}
                        substage={substage}
                        index={index}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                        isAdmin={isAdmin}
                      />
                    ))}
                    {localSubstages.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        No milestones configured. Add one to get started.
                      </p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
              
              {/* Bottom Save Bar */}
              <SaveBar />
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
