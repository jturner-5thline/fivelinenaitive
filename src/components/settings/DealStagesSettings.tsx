import { useState, useEffect } from 'react';
import { GripVertical, Plus, Pencil, Trash2, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
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
import { useDealStages, DealStageOption } from '@/contexts/DealStagesContext';

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

interface SortableStageItemProps {
  stage: DealStageOption;
  onEdit: (stage: DealStageOption) => void;
  onDelete: (id: string) => void;
}

function SortableStageItem({ stage, onEdit, onDelete }: SortableStageItemProps) {
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
      className={`flex items-center gap-2 p-2 bg-muted/50 rounded-lg ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        className="cursor-grab hover:bg-muted p-1 rounded"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className={`w-3 h-3 rounded-full ${stage.color}`} />
      <span className="flex-1 text-sm">{stage.label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => onEdit(stage)}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={() => onDelete(stage.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function DealStagesSettings() {
  const { stages, addStage, updateStage, deleteStage, reorderStages } = useDealStages();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<DealStageOption | null>(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('bg-slate-500');
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('dealStagesSettingsOpen');
    return saved ? JSON.parse(saved) : true;
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    localStorage.setItem('dealStagesSettingsOpen', JSON.stringify(isOpen));
  }, [isOpen]);

  const openAddDialog = () => {
    setEditingStage(null);
    setLabel('');
    setColor('bg-slate-500');
    setIsDialogOpen(true);
  };

  const openEditDialog = (stage: DealStageOption) => {
    setEditingStage(stage);
    setLabel(stage.label);
    setColor(stage.color);
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!label.trim()) {
      toast.error('Stage name is required');
      return;
    }

    if (editingStage) {
      updateStage(editingStage.id, { label: label.trim(), color });
      toast.success('Stage updated');
    } else {
      addStage({ label: label.trim(), color });
      toast.success('Stage added');
    }
    setIsDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (stages.length <= 1) {
      toast.error('You must have at least one stage');
      return;
    }
    deleteStage(id);
    toast.success('Stage deleted');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = stages.findIndex((s) => s.id === active.id);
      const newIndex = stages.findIndex((s) => s.id === over.id);
      reorderStages(arrayMove(stages, oldIndex, newIndex));
    }
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GitBranch className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-lg">Deal Stages</CardTitle>
                    <CardDescription>Configure the stages in your deal pipeline</CardDescription>
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={stages.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {stages.map((stage) => (
                      <SortableStageItem
                        key={stage.id}
                        stage={stage}
                        onEdit={openEditDialog}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button
                variant="outline"
                size="sm"
                onClick={openAddDialog}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stage
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStage ? 'Edit Stage' : 'Add Stage'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-label">Stage Name</Label>
              <Input
                id="stage-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., In Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="grid grid-cols-6 gap-2">
                {STAGE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-8 h-8 rounded-full ${c.value} ${
                      color === c.value
                        ? 'ring-2 ring-offset-2 ring-primary'
                        : ''
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingStage ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
