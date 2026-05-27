import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, GripVertical, Signal, ChevronDown, Save, Loader2, RotateCcw } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useLenderStages, TrackingStatusOption } from '@/contexts/LenderStagesContext';

const COLOR_OPTIONS = [
  { value: 'bg-green-500', label: 'Green' },
  { value: 'bg-yellow-500', label: 'Yellow' },
  { value: 'bg-blue-500', label: 'Blue' },
  { value: 'bg-red-500', label: 'Red' },
  { value: 'bg-orange-500', label: 'Orange' },
  { value: 'bg-purple-500', label: 'Purple' },
  { value: 'bg-cyan-500', label: 'Cyan' },
  { value: 'bg-muted', label: 'Muted' },
];

function SortableStatusItem({
  status,
  index,
  onEdit,
  onDelete,
  isAdmin,
}: {
  status: TrackingStatusOption;
  index: number;
  onEdit: (s: TrackingStatusOption) => void;
  onDelete: (s: TrackingStatusOption) => void;
  isAdmin: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: status.id });

  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {isAdmin && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
        <span className={`h-3 w-3 rounded-full ${status.color}`} />
        <p className="font-medium truncate">{status.label}</p>
      </div>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(status)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{status.label}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the classification from available options. Existing lenders using this classification won't be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(status)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

interface TrackingStatusSettingsProps {
  isAdmin?: boolean;
}

export function TrackingStatusSettings({ isAdmin = true }: TrackingStatusSettingsProps) {
  const { trackingStatuses: contextStatuses, reorderTrackingStatuses, isSaving: contextSaving } = useLenderStages();

  const [localStatuses, setLocalStatuses] = useState<TrackingStatusOption[]>(contextStatuses);
  const [savedStatuses, setSavedStatuses] = useState<TrackingStatusOption[]>(contextStatuses);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalStatuses(contextStatuses);
    setSavedStatuses(contextStatuses);
  }, [contextStatuses]);

  const hasUnsavedChanges = JSON.stringify(localStatuses) !== JSON.stringify(savedStatuses);

  const [isOpen, setIsOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TrackingStatusOption | null>(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('bg-green-500');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const openAddDialog = () => {
    setEditingStatus(null);
    setLabel('');
    setColor('bg-green-500');
    setIsDialogOpen(true);
  };

  const openEditDialog = (status: TrackingStatusOption) => {
    setEditingStatus(status);
    setLabel(status.label);
    setColor(status.color);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }

    if (editingStatus) {
      setLocalStatuses(localStatuses.map(s => s.id === editingStatus.id ? { ...s, label: label.trim(), color } : s));
    } else {
      const exists = localStatuses.some(s => s.label.toLowerCase() === label.trim().toLowerCase());
      if (exists) {
        toast({ title: 'Error', description: 'A classification with this name already exists', variant: 'destructive' });
        return;
      }
      const id = label.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      setLocalStatuses([...localStatuses, { id, label: label.trim(), color }]);
    }

    setIsDialogOpen(false);
  };

  const handleDelete = (status: TrackingStatusOption) => {
    setLocalStatuses(localStatuses.filter(s => s.id !== status.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localStatuses.findIndex(s => s.id === active.id);
      const newIndex = localStatuses.findIndex(s => s.id === over.id);
      setLocalStatuses(arrayMove(localStatuses, oldIndex, newIndex));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      reorderTrackingStatuses(localStatuses);
      setSavedStatuses(localStatuses);
      toast({ title: 'Tracking statuses saved', description: 'Your changes have been saved successfully.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save tracking statuses', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => setLocalStatuses(savedStatuses);

  const SaveBar = () => {
    if (!hasUnsavedChanges && !isSaving) return null;
    return (
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg border">
        <p className="text-sm text-muted-foreground">{isSaving ? 'Saving changes...' : 'You have unsaved changes'}</p>
        <div className="flex items-center gap-2">
          {!isSaving && (
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          )}
          <Button variant="gradient" size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Changes
          </Button>
        </div>
      </div>
    );
  };

  return (
    <>
      
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            
              <button className="flex items-center gap-2 text-left flex-1">
                
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Signal className="h-5 w-5" />
                    Lender Tracking Statuses
                  </CardTitle>
                  <CardDescription>Configure classifications like Active, On Hold, On Deck, Passed, etc.</CardDescription>
                </div>
              </button>
            
            {isAdmin && (
              <Button variant="gradient" onClick={(e) => { e.stopPropagation(); openAddDialog(); }} size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Add Status
              </Button>
            )}
          </CardHeader>
          
            <CardContent className="space-y-4">
              <SaveBar />
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localStatuses.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {localStatuses.map((status, index) => (
                      <SortableStatusItem
                        key={status.id}
                        status={status}
                        index={index}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                        isAdmin={isAdmin}
                      />
                    ))}
                    {localStatuses.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">No tracking statuses configured. Add one to get started.</p>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
              <SaveBar />
            </CardContent>
          
        </Card>
      

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStatus ? 'Edit Tracking Status' : 'Add Tracking Status'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="statusName">Name *</Label>
              <Input id="statusName" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Enter status name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusColor">Color</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-3 rounded-full ${opt.value}`} />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button variant="gradient" onClick={handleSubmit}>{editingStatus ? 'Save Changes' : 'Add Status'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
