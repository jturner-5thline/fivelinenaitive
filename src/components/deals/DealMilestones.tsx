import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { format, isPast, isToday } from 'date-fns';
import { DealMilestone, MilestoneStatus, MILESTONE_STATUS_CONFIG } from '@/types/deal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  /**
   * Collapsed-timeline marker style.
   * - `diamond` (default): the classic diamond markers on a connector line.
   * - `pill`: rounded pills with the milestone title inline (used by the
   *   context-rail deal detail layout).
   */
  markerVariant?: 'diamond' | 'pill';
}

export function DealMilestones({ milestones, onAdd, onUpdate, onDelete, onReorder, markerVariant = 'diamond' }: DealMilestonesProps) {
  const [isAdding, setIsAdding] = useState(false);
  // Always start collapsed on every page load/refresh. Do not persist
  // expanded state across reloads — manual expansion only lasts for the
  // current session of this component instance.
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [isNewDateOpen, setIsNewDateOpen] = useState(false);

  const sensors = useSensors(
    // Require a small drag distance before starting a sort, otherwise the
    // PointerSensor can swallow plain clicks on row controls (Date button,
    // Edit, Delete, Popover triggers) and they appear "broken".
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
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
      dueDate: editDate ? editDate.toISOString() : undefined,
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
    <div className="pt-0">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
            <button
              type="button"
              onClick={() => setIsDialogOpen(true)}
              className={cn(
                "flex items-center gap-2 flex-1 px-3 py-0.5 -mx-3 rounded-lg",
                "cursor-pointer transition-all duration-200",
                "border border-transparent",
                "bg-primary/[0.06] hover:bg-primary/[0.12] hover:border-primary/30 hover:shadow-[0_0_16px_rgba(126,184,247,0.18)]",
                "active:scale-[0.99]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
              aria-haspopup="dialog"
            >
              <span className="text-xs font-semibold leading-none bg-brand-gradient bg-clip-text text-transparent dark:bg-none dark:text-white">Deal Milestones</span>
              {milestones.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="ml-1 text-[10px] px-1 py-0 h-4 leading-none font-semibold border-primary/30 text-primary cursor-help"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {completedCount}/{totalCount}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="max-w-[240px]">
                    <p className="text-xs font-medium">
                      {completedCount} of {totalCount} milestones completed
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      The first number is how many milestones are marked done; the second is the total for this deal.
                      {' Click the section to open the milestones editor.'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="ml-auto text-[10px] leading-none text-primary/80 font-medium">
                Click to edit
              </span>
            </button>
        </div>

        {/* Collapsed View — pill markers */}
        {milestones.length > 0 && markerVariant === 'pill' && (
          <div className="grid gap-2 py-1" style={{ gridTemplateColumns: `repeat(${milestones.length}, minmax(0, 1fr))` }}>
            {milestones.map((milestone) => (
              <Tooltip key={milestone.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onUpdate(milestone.id, {
                      completed: !milestone.completed,
                      completedAt: !milestone.completed ? new Date().toISOString() : undefined,
                    })}
                    className={cn(
                      "group flex w-full flex-col items-center gap-1.5 text-center",
                      "transition-all duration-150 active:scale-95 hover:brightness-110",
                    )}
                  >
                    <span
                      className={cn(
                        "block w-full h-2.5 rounded-full border transition-all",
                        milestone.completed
                          ? "border-transparent bg-brand-gradient shadow-[0_2px_10px_hsl(272,100%,60%,0.35)]"
                          : isOverdue(milestone)
                          ? "border-destructive/60 bg-transparent"
                          : "border-primary/40 bg-transparent",
                      )}
                    />
                    <span
                      className={cn(
                        "w-full truncate text-[11px] font-medium leading-tight",
                        milestone.completed
                          ? "text-foreground"
                          : isOverdue(milestone)
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {milestone.title}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <p className="font-medium">{milestone.title}</p>
                  {milestone.dueDate && (
                    <p className={isOverdue(milestone) ? "text-destructive" : "text-muted-foreground"}>
                      Due: {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                      {isOverdue(milestone) && " (Overdue)"}
                    </p>
                  )}
                  {milestone.completed && milestone.completedAt && (
                    <p className="text-primary">
                      Completed: {format(new Date(milestone.completedAt), 'MMM d, yyyy')}
                    </p>
                  )}
                  <p className="text-muted-foreground/70 mt-0.5">Click to {milestone.completed ? 'uncheck' : 'complete'}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {/* Collapsed View - Diamond Icons with Connecting Lines and Labels */}
        {milestones.length > 0 && markerVariant === 'diamond' && (
          <div className="relative py-0 pb-0 overflow-hidden">
            {/* Connecting line that spans the full width */}
            <div className="absolute top-[22px] left-0 right-0 h-0.5 bg-muted-foreground/30" />
            
            {/* Progress line overlay */}
            {completedCount > 0 && (
              <div
                className="absolute top-[22px] left-0 h-0.5 bg-brand-gradient transition-all"
                style={{
                  width: totalCount > 1 ? `${((completedCount - 0.5) / (totalCount - 1)) * 100}%` : '100%',
                }}
              />
            )}
            
            <div className="relative flex justify-between min-w-0 w-full overflow-hidden">
              {milestones.map((milestone) => (
                <div key={milestone.id} className="flex flex-col items-center min-w-0 flex-shrink-0" style={{ maxWidth: `${100 / milestones.length}%` }}>
                  {/* Diamond Icon — click to toggle completion */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "transition-colors cursor-pointer p-0.5 flex-shrink-0 hover:scale-110 active:scale-95 transition-transform",
                          getMilestoneColor(milestone)
                        )}
                        onClick={() => onUpdate(milestone.id, {
                          completed: !milestone.completed,
                          completedAt: !milestone.completed ? new Date().toISOString() : undefined,
                        })}
                      >
                        {milestone.completed ? (
                          <svg 
                            className="h-10 w-10" 
                            viewBox="0 0 24 24"
                          >
                            <defs>
                              <linearGradient id={`diamond-grad-${milestone.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#1a1025" />
                                <stop offset="25%" stopColor="#7C3AED" />
                                <stop offset="65%" stopColor="#A78BFA" />
                                <stop offset="100%" stopColor="#38BDF8" />
                              </linearGradient>
                              <linearGradient id={`diamond-border-${milestone.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#9333EA" />
                                <stop offset="100%" stopColor="#7C3AED" />
                              </linearGradient>
                            </defs>
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" fill={`url(#diamond-grad-${milestone.id})`} stroke={`url(#diamond-border-${milestone.id})`} strokeWidth="1" />
                          </svg>
                        ) : isOverdue(milestone) ? (
                          <svg 
                            className="h-10 w-10" 
                            viewBox="0 0 24 24"
                          >
                            <defs>
                              <linearGradient id={`diamond-overdue-${milestone.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#7f1d1d" />
                                <stop offset="50%" stopColor="#dc2626" />
                                <stop offset="100%" stopColor="#ef4444" />
                              </linearGradient>
                            </defs>
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" fill={`url(#diamond-overdue-${milestone.id})`} />
                          </svg>
                        ) : (
                          <svg 
                            className="h-10 w-10" 
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <defs>
                              <linearGradient id={`diamond-grad-stroke-${milestone.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.3" />
                              </linearGradient>
                            </defs>
                            <path d="M12 2L22 12L12 22L2 12L12 2Z" stroke={`url(#diamond-grad-stroke-${milestone.id})`} strokeWidth="1.5" />
                          </svg>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      <p className="font-medium">{milestone.title}</p>
                      {milestone.dueDate && (
                        <p className={isOverdue(milestone) ? "text-destructive" : "text-muted-foreground"}>
                          Due: {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
                          {isOverdue(milestone) && " (Overdue)"}
                        </p>
                      )}
                      {milestone.completed && milestone.completedAt && (
                        <p className="text-primary">
                          Completed: {format(new Date(milestone.completedAt), 'MMM d, yyyy')}
                        </p>
                      )}
                      <p className="text-muted-foreground/70 mt-0.5">Click to {milestone.completed ? 'uncheck' : 'complete'}</p>
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
                      "text-[11px] mt-0 text-center leading-tight truncate w-full px-0.5",
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

        <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) { setIsAdding(false); handleCancelEdit(); } }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Deal Milestones</DialogTitle>
              <DialogDescription>Add, edit, reorder, or delete milestones for this deal.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              {!isAdding && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setIsAdding(true)}>
                  <Plus className="h-3 w-3" />
                  Add milestone
                </Button>
              )}
            </div>
          {milestones.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Progress</span>
                <span className="text-xs font-medium">{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-1.5" />
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
              <div className="space-y-1">
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
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-dashed border-border">
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
                     <Popover open={isNewDateOpen} onOpenChange={setIsNewDateOpen} modal>
                       <PopoverTrigger asChild>
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           className="h-7 text-xs"
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             setIsNewDateOpen((v) => !v);
                           }}
                         >
                           {newDate ? format(newDate, 'MMM d') : 'Date'}
                         </Button>
                       </PopoverTrigger>
                       <PopoverContent
                         className="w-auto p-0 pointer-events-auto"
                         align="end"
                         onOpenAutoFocus={(e) => e.preventDefault()}
                       >
                        <Calendar
                           mode="single"
                           selected={newDate}
                           onSelect={(d) => {
                            setNewDate(d);
                            setIsNewDateOpen(false);
                          }}
                           fixedWeeks
                           showOutsideDays
                           defaultMonth={newDate ?? undefined}
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
                  <p className="text-xs text-muted-foreground text-center py-1.5">
                    No milestones yet
                  </p>
                )}
              </div>
            </SortableContext>
          </DndContext>
          </DialogContent>
        </Dialog>
      </div>
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
  const [isEditDateOpen, setIsEditDateOpen] = useState(false);
  const [isReadDateOpen, setIsReadDateOpen] = useState(false);
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

  // Stop pointer events from bubbling up to dnd-kit's sortable wrapper —
  // otherwise the PointerSensor can capture pointerdown on Radix triggers
  // (Checkbox, Popover, DropdownMenu) and swallow the click.
  const stopPointer = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-lg group",
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
            onPointerDown={stopPointer}
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            className="h-7 text-sm flex-1"
            placeholder="Milestone title"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <Popover open={isEditDateOpen} onOpenChange={setIsEditDateOpen} modal>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onPointerDown={stopPointer}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsEditDateOpen((v) => !v);
                }}
              >
                {editDate ? format(editDate, 'MMM d') : 'Date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 pointer-events-auto"
              align="end"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Calendar
                           mode="single"
                           selected={editDate}
                           onSelect={(d) => {
                  onEditDateChange(d);
                  if (d) setIsEditDateOpen(false);
                }}
                           fixedWeeks
                           showOutsideDays
                           defaultMonth={editDate ?? undefined}
                           className={cn("p-3 pointer-events-auto")}
                         />
              {editDate && (
                <div className="px-3 pb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground"
                    onClick={() => onEditDateChange(undefined)}
                  >
                    Clear date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onPointerDown={stopPointer}
            onClick={onSaveEdit}
          >
            <Check className="h-3.5 w-3.5 text-success" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onPointerDown={stopPointer}
            onClick={onCancelEdit}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Checkbox
            onPointerDown={stopPointer}
            checked={milestone.completed}
            onCheckedChange={(checked) => {
              if (typeof checked !== 'boolean') return;
              onUpdate(milestone.id, {
                completed: checked,
                completedAt: checked ? new Date().toISOString() : undefined,
              });
            }}
          />
          <span
            className={cn(
              "flex-1 min-w-0 truncate text-sm leading-tight",
              milestone.completed && "line-through text-muted-foreground",
              isOverdue && "text-red-500 font-medium"
            )}
            title={milestone.title}
          >
            {milestone.title}
          </span>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <Popover open={isReadDateOpen} onOpenChange={setIsReadDateOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-7 text-xs",
                    isOverdue && "border-red-500/40 text-red-500"
                  )}
                  onPointerDown={stopPointer}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsReadDateOpen((v) => !v);
                  }}
                >
                  {milestone.dueDate
                    ? `${format(new Date(milestone.dueDate), 'MMM d')}${isOverdue ? ' (Overdue)' : ''}`
                    : 'Date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 pointer-events-auto"
                align="end"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Calendar
                  mode="single"
                  selected={milestone.dueDate ? new Date(milestone.dueDate) : undefined}
                  onSelect={(d) => {
                    onUpdate(milestone.id, { dueDate: d ? d.toISOString() : undefined });
                    if (d) setIsReadDateOpen(false);
                  }}
                  fixedWeeks
                  showOutsideDays
                  defaultMonth={milestone.dueDate ? new Date(milestone.dueDate) : undefined}
                  className={cn("p-3 pointer-events-auto")}
                />
                {milestone.dueDate && (
                  <div className="px-3 pb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        onUpdate(milestone.id, { dueDate: undefined });
                        setIsReadDateOpen(false);
                      }}
                    >
                      Clear date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            {milestone.completed && milestone.completedAt && (
              <span className="text-xs text-emerald-600">
                Completed: {format(new Date(milestone.completedAt), 'MMM d, yyyy')}
              </span>
            )}
          </div>
          {/* Status tag */}
          {!milestone.completed && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onPointerDown={stopPointer}
                  className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-md border cursor-pointer transition-colors",
                    milestone.status && MILESTONE_STATUS_CONFIG[milestone.status]
                      ? `${MILESTONE_STATUS_CONFIG[milestone.status].bgClass} ${MILESTONE_STATUS_CONFIG[milestone.status].textClass} ${MILESTONE_STATUS_CONFIG[milestone.status].borderClass}`
                      : "bg-muted text-muted-foreground border-border hover:bg-accent"
                  )}
                >
                  {milestone.status ? MILESTONE_STATUS_CONFIG[milestone.status].label : 'Set Status'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.entries(MILESTONE_STATUS_CONFIG) as [MilestoneStatus, typeof MILESTONE_STATUS_CONFIG[MilestoneStatus]][]).map(([key, config]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onUpdate(milestone.id, { status: key })}
                    className={cn(milestone.status === key && "bg-accent")}
                  >
                    <span className={cn("h-2 w-2 rounded-full mr-2", config.color)} />
                    {config.label}
                  </DropdownMenuItem>
                ))}
                {milestone.status && (
                  <DropdownMenuItem onClick={() => onUpdate(milestone.id, { status: null })}>
                    <span className="h-2 w-2 rounded-full mr-2 bg-muted-foreground/30" />
                    Clear Status
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onPointerDown={stopPointer}
              onClick={onStartEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onPointerDown={stopPointer}
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
