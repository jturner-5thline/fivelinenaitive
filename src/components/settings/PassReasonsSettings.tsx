import { useState } from 'react';
import { Plus, GripVertical, Pencil, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
}

function SortableReasonItem({ reason, onEdit, onDelete }: SortableReasonItemProps) {
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
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <span className="font-medium">{reason.label}</span>
      </div>
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
    </div>
  );
}

export function PassReasonsSettings() {
  const { passReasons, addPassReason, updatePassReason, deletePassReason, reorderPassReasons } = useLenderStages();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
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
      const oldIndex = passReasons.findIndex((r) => r.id === active.id);
      const newIndex = passReasons.findIndex((r) => r.id === over.id);
      reorderPassReasons(arrayMove(passReasons, oldIndex, newIndex));
    }
  };

  const handleAddReason = () => {
    if (!newReasonLabel.trim()) return;
    addPassReason({ label: newReasonLabel.trim() });
    setNewReasonLabel('');
    setIsAddDialogOpen(false);
    toast({ title: "Pass reason added" });
  };

  const handleUpdateReason = () => {
    if (!editingReason || !newReasonLabel.trim()) return;
    updatePassReason(editingReason.id, { label: newReasonLabel.trim() });
    setNewReasonLabel('');
    setEditingReason(null);
    toast({ title: "Pass reason updated" });
  };

  const handleDeleteReason = (id: string) => {
    deletePassReason(id);
    toast({ title: "Pass reason deleted" });
  };

  const openEditDialog = (reason: PassReasonOption) => {
    setEditingReason(reason);
    setNewReasonLabel(reason.label);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <CardTitle>Pass Reasons</CardTitle>
          </div>
          <Button variant="gradient" size="sm" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Reason
          </Button>
        </div>
        <CardDescription>
          Configure the reasons shown when marking a lender as passed
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={passReasons.map(r => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {passReasons.map((reason) => (
                <SortableReasonItem
                  key={reason.id}
                  reason={reason}
                  onEdit={openEditDialog}
                  onDelete={handleDeleteReason}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {passReasons.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No pass reasons configured. Add one to get started.
          </p>
        )}
      </CardContent>

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
    </Card>
  );
}