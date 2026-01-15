import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { DealMilestone } from '@/types/deal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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

interface DealMilestonesProps {
  milestones: DealMilestone[];
  onAdd: (milestone: Omit<DealMilestone, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<DealMilestone>) => void;
  onDelete: (id: string) => void;
  onReorder?: (milestones: DealMilestone[]) => void;
}

export function DealMilestones({ milestones, onAdd, onUpdate, onDelete, onReorder }: DealMilestonesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState<Date | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd({
      title: newTitle.trim(),
      dueDate: newDate?.toISOString(),
      completed: false,
    });
    setNewTitle('');
    setNewDate(undefined);
    setIsAdding(false);
  };

  const handleStartEdit = (milestone: DealMilestone) => {
    setEditingId(milestone.id);
    setEditTitle(milestone.title);
    setEditDate(milestone.dueDate ? new Date(milestone.dueDate) : undefined);
  };

  const handleSaveEdit = (id: string) => {
    if (!editTitle.trim()) return;
    onUpdate(id, {
      title: editTitle.trim(),
      dueDate: editDate?.toISOString(),
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDate(undefined);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = milestones.findIndex((m) => m.id === active.id);
      const newIndex = milestones.findIndex((m) => m.id === over.id);
      const reordered = arrayMove(milestones, oldIndex, newIndex);
      onReorder?.(reordered);
    }
  };

  const completedCount = milestones.filter(m => m.completed).length;
  const totalCount = milestones.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isOverdue = (milestone: DealMilestone) => {
    if (milestone.completed) return false;
    if (!milestone.dueDate) return false;
    const dueDate = new Date(milestone.dueDate);
    return isPast(dueDate) && !isToday(dueDate);
  };

  const getMilestoneColor = (milestone: DealMilestone) => {
    if (milestone.completed) return 'text-purple-600';
    if (isOverdue(milestone)) return 'text-red-500';
    return 'text-purple-600/30';
  };

  return (
    <div className="pt-1">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between mb-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="h-auto p-0 hover:bg-transparent gap-2">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-lg font-semibold bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">Deal Milestones</span>
              {milestones.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({completedCount}/{totalCount})
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
          {isExpanded && !isAdding && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>

        {/* Collapsed View - Diamond Icons with Connecting Lines and Labels */}
        {!isExpanded && milestones.length > 0 && (
          <div className="relative py-1 overflow-hidden">
            {/* Connecting line that spans the full width */}
            <div className="absolute top-[18px] left-0 right-0 h-0.5 bg-muted-foreground/30" />
            
            {/* Progress line overlay */}
            {completedCount > 0 && (
              <div
                className="absolute top-[18px] left-0 h-0.5 bg-purple-600 transition-all"
                style={{
                  width: totalCount > 1 ? `${((completedCount - 0.5) / (totalCount - 1)) * 100}%` : '100%',
                }}
              />
            )}
            
            <div className="relative flex justify-between min-w-0 overflow-hidden">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="flex flex-col items-center min-w-0 flex-shrink-0" style={{ maxWidth: `${100 / milestones.length}%` }}>
                  {/* Diamond Icon */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "transition-colors cursor-pointer bg-background p-0.5 flex-shrink-0",
                          getMilestoneColor(milestone)
                        )}
                      >
                        {milestone.completed ? (
                          <svg 
                            className="h-5 w-5 fill-current" 
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          </svg>
                        ) : isOverdue(milestone) ? (
                          <svg 
                            className="h-5 w-5 fill-current" 
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          </svg>
                        ) : (
                          <svg 
                            className="h-5 w-5" 
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" />
                          </svg>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p className="font-medium">{milestone.title}</p>
                      {milestone.dueDate && (
                        <p className={isOverdue(milestone) ? "text-red-500" : "text-muted-foreground"}>
                          Due: {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                          {isOverdue(milestone) && " (Overdue)"}
                        </p>
                      )}
                      {milestone.completed && milestone.completedAt && (
                        <p className="text-emerald-600">
                          Completed: {format(new Date(milestone.completedAt), 'MMM d, yyyy')}
                        </p>
                      )}
                      {!milestone.completed && (
                        <p className={isOverdue(milestone) ? "text-red-500" : "text-muted-foreground"}>
                          {isOverdue(milestone) ? "Overdue" : "Pending"}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Label below diamond */}
                  <span
                    className={cn(
                      "text-[12px] mt-0.5 text-center leading-tight truncate w-full px-0.5",
                      milestone.completed
                        ? "text-foreground"
                        : isOverdue(milestone)
                        ? "text-red-500"
                        : "text-muted-foreground"
                    )}
                  >
                    {milestone.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <CollapsibleContent>
          {milestones.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={milestones.map(m => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {milestones.map((milestone) => (
                  <SortableMilestoneItem
                    key={milestone.id}
                    milestone={milestone}
                    isEditing={editingId === milestone.id}
                    editTitle={editTitle}
                    editDate={editDate}
                    isOverdue={isOverdue(milestone)}
                    onEditTitleChange={setEditTitle}
                    onEditDateChange={setEditDate}
                    onSaveEdit={() => handleSaveEdit(milestone.id)}
                    onCancelEdit={handleCancelEdit}
                    onStartEdit={() => handleStartEdit(milestone)}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}

                {isAdding && (
                  <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border">
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="h-7 text-sm flex-1"
                      placeholder="New milestone..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAdd();
                        if (e.key === 'Escape') setIsAdding(false);
                      }}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs">
                          {newDate ? format(newDate, 'MMM d') : 'Date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={newDate}
                          onSelect={setNewDate}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleAdd}
                    >
                      <Check className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setIsAdding(false);
                        setNewTitle('');
                        setNewDate(undefined);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {milestones.length === 0 && !isAdding && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No milestones yet
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// Sortable milestone item component
interface SortableMilestoneItemProps {
  milestone: DealMilestone;
  isEditing: boolean;
  editTitle: string;
  editDate: Date | undefined;
  isOverdue: boolean;
  onEditTitleChange: (value: string) => void;
  onEditDateChange: (value: Date | undefined) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onUpdate: (id: string, updates: Partial<DealMilestone>) => void;
  onDelete: (id: string) => void;
}

function SortableMilestoneItem({
  milestone,
  isEditing,
  editTitle,
  editDate,
  isOverdue,
  onEditTitleChange,
  onEditDateChange,
  onSaveEdit,
  onCancelEdit,
  onStartEdit,
  onUpdate,
  onDelete,
}: SortableMilestoneItemProps) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg group",
        isOverdue ? "bg-red-500/10" : "bg-muted/50"
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {isEditing ? (
        <>
          <Input
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            className="h-7 text-sm flex-1"
            placeholder="Milestone title"
            autoFocus
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                {editDate ? format(editDate, 'MMM d') : 'Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={editDate}
                onSelect={onEditDateChange}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSaveEdit}
          >
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCancelEdit}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Checkbox
            checked={milestone.completed}
            onCheckedChange={(checked) =>
              onUpdate(milestone.id, { 
                completed: checked === true,
                completedAt: checked === true ? new Date().toISOString() : undefined
              })
            }
          />
          <span
            className={cn(
              "flex-1 text-lg",
              milestone.completed && "line-through text-muted-foreground",
              isOverdue && "text-red-500 font-medium"
            )}
          >
            {milestone.title}
          </span>
          <div className="flex flex-col items-end gap-0.5">
            {milestone.dueDate && (
              <span className={cn(
                "text-xs",
                isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
              )}>
                Due: {format(new Date(milestone.dueDate), 'MMM d')}
                {isOverdue && " (Overdue)"}
              </span>
            )}
            {milestone.completed && milestone.completedAt && (
              <span className="text-xs text-emerald-600">
                Completed: {format(new Date(milestone.completedAt), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onStartEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(milestone.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
