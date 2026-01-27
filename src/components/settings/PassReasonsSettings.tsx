import { useState, useEffect } from 'react';
import { Plus, GripVertical, Pencil, Trash2, XCircle, ChevronDown, Save, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useLenderStages, PassReasonOption } from '@/contexts/LenderStagesContext';
import { toast } from '@/hooks/use-toast';
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

interface SortableReasonItemProps {
  reason: PassReasonOption;
  onEdit: (reason: PassReasonOption) => void;
  onDelete: (id: string) => void;
  isAdmin: boolean;
}

function SortableReasonItem({ reason, onEdit, onDelete, isAdmin }: SortableReasonItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: reason.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-3 bg-card border rounded-lg group"
    >
      {isAdmin && (
        <button
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="flex-1">
        <span className="font-medium">{reason.label}</span>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(reason)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete pass reason?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{reason.label}". This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(reason.id)}>
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

interface PassReasonsSettingsProps {
  isAdmin?: boolean;
}

export function PassReasonsSettings({ isAdmin = true }: PassReasonsSettingsProps) {
  const { passReasons: contextPassReasons, addPassReason, updatePassReason, deletePassReason, reorderPassReasons, isSaving: contextSaving } = useLenderStages();
  
  // Local state for pending changes
  const [localPassReasons, setLocalPassReasons] = useState<PassReasonOption[]>(contextPassReasons);
  const [savedPassReasons, setSavedPassReasons] = useState<PassReasonOption[]>(contextPassReasons);
  const [isSaving, setIsSaving] = useState(false);
  
  // Sync local state when context changes
  useEffect(() => {
    setLocalPassReasons(contextPassReasons);
    setSavedPassReasons(contextPassReasons);
  }, [contextPassReasons]);

  const hasUnsavedChanges = JSON.stringify(localPassReasons) !== JSON.stringify(savedPassReasons);

  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('settings-pass-reasons-open');
    return saved !== null ? saved === 'true' : false;
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    localStorage.setItem('settings-pass-reasons-open', String(open));
  };
  const [editingReason, setEditingReason] = useState<PassReasonOption | null>(null);
  const [newReasonLabel, setNewReasonLabel] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localPassReasons.findIndex((r) => r.id === active.id);
      const newIndex = localPassReasons.findIndex((r) => r.id === over.id);
      setLocalPassReasons(arrayMove(localPassReasons, oldIndex, newIndex));
    }
  };

  const handleAddReason = () => {
    if (!newReasonLabel.trim()) return;
    const newReason: PassReasonOption = {
      id: crypto.randomUUID(),
      label: newReasonLabel.trim(),
    };
    setLocalPassReasons([...localPassReasons, newReason]);
    setNewReasonLabel('');
    setIsAddDialogOpen(false);
  };

  const handleUpdateReason = () => {
    if (!editingReason || !newReasonLabel.trim()) return;
    setLocalPassReasons(localPassReasons.map(r => r.id === editingReason.id ? { ...r, label: newReasonLabel.trim() } : r));
    setNewReasonLabel('');
    setEditingReason(null);
  };

  const handleDeleteReason = (id: string) => {
    setLocalPassReasons(localPassReasons.filter(r => r.id !== id));
  };

  const openEditDialog = (reason: PassReasonOption) => {
    setEditingReason(reason);
    setNewReasonLabel(reason.label);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Apply all changes to context (which saves to database)
      reorderPassReasons(localPassReasons);
      setSavedPassReasons(localPassReasons);
      toast({ title: 'Pass reasons saved', description: 'Your changes have been saved successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save pass reasons', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalPassReasons(savedPassReasons);
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
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-left flex-1">
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  Pass Reasons
                </CardTitle>
                <CardDescription>Configure the reasons shown when marking a lender as passed. Changes sync to your entire team.</CardDescription>
              </div>
            </button>
          </CollapsibleTrigger>
          {isAdmin && (
            <Button variant="gradient" size="sm" onClick={(e) => { e.stopPropagation(); setIsAddDialogOpen(true); }} className="gap-1">
              <Plus className="h-4 w-4" />
              Add Reason
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
              <SortableContext
                items={localPassReasons.map(r => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {localPassReasons.map((reason) => (
                    <SortableReasonItem
                      key={reason.id}
                      reason={reason}
                      onEdit={openEditDialog}
                      onDelete={handleDeleteReason}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {localPassReasons.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No pass reasons configured. Add one to get started.
              </p>
            )}
            
            {/* Bottom Save Bar */}
            <SaveBar />
          </CardContent>
        </CollapsibleContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Pass Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reason-label">Reason</Label>
              <Input
                id="reason-label"
                value={newReasonLabel}
                onChange={(e) => setNewReasonLabel(e.target.value)}
                placeholder="e.g., Too Small"
                onKeyDown={(e) => e.key === 'Enter' && handleAddReason()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleAddReason} disabled={!newReasonLabel.trim()}>
              Add Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingReason} onOpenChange={(open) => !open && setEditingReason(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Pass Reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-reason-label">Reason</Label>
              <Input
                id="edit-reason-label"
                value={newReasonLabel}
                onChange={(e) => setNewReasonLabel(e.target.value)}
                placeholder="e.g., Too Small"
                onKeyDown={(e) => e.key === 'Enter' && handleUpdateReason()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReason(null)}>
              Cancel
            </Button>
            <Button variant="gradient" onClick={handleUpdateReason} disabled={!newReasonLabel.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}
