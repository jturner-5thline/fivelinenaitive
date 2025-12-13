import { useState } from 'react';
import { Plus, X, Check, Pencil, Calendar, User, ChevronDown, LayoutGrid, ArrowRight, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface OutstandingItem {
  id: string;
  text: string;
  completed: boolean;
  received: boolean;
  approved: boolean;
  deliveredToLenders: boolean;
  createdAt: string;
  requestedBy: string[];
}

type KanbanStage = 'requested' | 'received' | 'approved' | 'deliveredToLenders';

const KANBAN_STAGES: { key: KanbanStage; label: string; color: string }[] = [
  { key: 'requested', label: 'Requested', color: 'bg-amber-500' },
  { key: 'received', label: 'Received', color: 'bg-blue-500' },
  { key: 'approved', label: 'Approved', color: 'bg-emerald-500' },
  { key: 'deliveredToLenders', label: 'Delivered to Lenders', color: 'bg-purple-500' },
];

interface OutstandingItemsProps {
  items: OutstandingItem[];
  lenderNames: string[];
  onAdd: (text: string, requestedBy: string[]) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  onDelete: (id: string) => void;
}

const getItemStage = (item: OutstandingItem): KanbanStage => {
  if (item.deliveredToLenders) return 'deliveredToLenders';
  if (item.approved) return 'approved';
  if (item.received) return 'received';
  return 'requested';
};

const moveToStage = (stage: KanbanStage): Partial<OutstandingItem> => {
  switch (stage) {
    case 'requested':
      return { received: false, approved: false, deliveredToLenders: false };
    case 'received':
      return { received: true, approved: false, deliveredToLenders: false };
    case 'approved':
      return { received: true, approved: true, deliveredToLenders: false };
    case 'deliveredToLenders':
      return { received: true, approved: true, deliveredToLenders: true };
    default:
      return {};
  }
};

// Draggable Kanban Item
function DraggableKanbanItem({ item }: { item: OutstandingItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg"
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium mb-2">{item.text}</p>
          <div className="text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {Array.isArray(item.requestedBy) ? item.requestedBy.join(', ') : item.requestedBy}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Droppable Kanban Column
function DroppableColumn({ 
  stage, 
  stageItems 
}: { 
  stage: { key: KanbanStage; label: string; color: string }; 
  stageItems: OutstandingItem[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.key,
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn("w-3 h-3 rounded-full", stage.color)} />
        <h3 className="font-medium text-sm">{stage.label}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
          {stageItems.length}
        </span>
      </div>
      <div 
        ref={setNodeRef}
        className={cn(
          "flex-1 bg-muted/30 rounded-lg p-2 min-h-[300px] space-y-2 transition-colors",
          isOver && "bg-primary/10 ring-2 ring-primary/30"
        )}
      >
        {stageItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Drop items here
          </p>
        )}
        {stageItems.map((item) => (
          <DraggableKanbanItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// Kanban Board with DnD
function KanbanBoard({ 
  items, 
  onUpdate, 
  getItemsByStage 
}: { 
  items: OutstandingItem[];
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  getItemsByStage: (stage: KanbanStage) => OutstandingItem[];
}) {
  const [activeItem, setActiveItem] = useState<OutstandingItem | null>(null);
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const item = items.find(i => i.id === active.id);
    if (item) {
      setActiveItem(item);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (over && active.id !== over.id) {
      const targetStage = over.id as KanbanStage;
      if (KANBAN_STAGES.some(s => s.key === targetStage)) {
        onUpdate(active.id as string, moveToStage(targetStage));
      }
    }
  };

  return (
    <DndContext 
      sensors={sensors}
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-4 gap-4 overflow-auto py-4">
        {KANBAN_STAGES.map((stage) => (
          <DroppableColumn 
            key={stage.key} 
            stage={stage} 
            stageItems={getItemsByStage(stage.key)} 
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="bg-card border border-primary rounded-lg p-3 shadow-xl rotate-3">
            <div className="flex items-start gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-2">{activeItem.text}</p>
                <div className="text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {Array.isArray(activeItem.requestedBy) ? activeItem.requestedBy.join(', ') : activeItem.requestedBy}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function OutstandingItems({ items, lenderNames, onAdd, onUpdate, onDelete }: OutstandingItemsProps) {
  const [newItemText, setNewItemText] = useState('');
  const [newRequestedBy, setNewRequestedBy] = useState<string[]>(['5th Line']);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isKanbanOpen, setIsKanbanOpen] = useState(false);

  const requestedByOptions = ['5th Line', ...lenderNames];

  const handleAdd = () => {
    if (newItemText.trim() && newRequestedBy.length > 0) {
      onAdd(newItemText.trim(), newRequestedBy);
      setNewItemText('');
      setNewRequestedBy(['5th Line']);
    }
  };

  const toggleRequestedBy = (option: string) => {
    setNewRequestedBy(prev => 
      prev.includes(option) 
        ? prev.filter(o => o !== option)
        : [...prev, option]
    );
  };

  const getDisplayText = (selected: string[]) => {
    if (selected.length === 0) return 'Select...';
    if (selected.length === 1) return selected[0];
    return `${selected.length} selected`;
  };

  const handleStartEdit = (item: OutstandingItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
  };

  const handleSaveEdit = () => {
    if (editingId && editingText.trim()) {
      onUpdate(editingId, { text: editingText.trim() });
      setEditingId(null);
      setEditingText('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const approvedCount = items.filter(i => i.approved).length;
  const deliveredCount = items.filter(i => i.deliveredToLenders).length;

  const getItemsByStage = (stage: KanbanStage) => {
    return items.filter(item => getItemStage(item) === stage);
  };

  return (
    <>
      <Card 
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setIsKanbanOpen(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Check className="h-5 w-5" />
            Outstanding Items
            {items.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({deliveredCount}/{items.length} delivered)
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            View Board
          </Button>
        </CardHeader>
        <CardContent className="space-y-3" onClick={(e) => e.stopPropagation()}>
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No outstanding items
            </p>
          )}

          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border border-border bg-card",
                item.deliveredToLenders && "opacity-60"
              )}
            >
              {editingId === item.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    autoFocus
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSaveEdit}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "text-sm block",
                        item.deliveredToLenders && "line-through text-muted-foreground"
                      )}
                    >
                      {item.text}
                    </span>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Requested {format(new Date(item.createdAt), 'MMM d, yyyy')}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        by {Array.isArray(item.requestedBy) ? item.requestedBy.join(', ') : item.requestedBy}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
                      item.received && "bg-emerald-500/10"
                    )}>
                      <Checkbox
                        checked={item.received}
                        onCheckedChange={(checked) =>
                          onUpdate(item.id, { received: checked === true })
                        }
                        className={cn(
                          item.received && "border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                        )}
                      />
                      <span className={cn(
                        "text-xs",
                        item.received ? "text-emerald-600 font-medium" : "text-muted-foreground"
                      )}>Received</span>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
                      item.approved && "bg-emerald-500/10"
                    )}>
                      <Checkbox
                        checked={item.approved}
                        onCheckedChange={(checked) =>
                          onUpdate(item.id, { approved: checked === true })
                        }
                        className={cn(
                          item.approved && "border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                        )}
                      />
                      <span className={cn(
                        "text-xs",
                        item.approved ? "text-emerald-600 font-medium" : "text-muted-foreground"
                      )}>Approved</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => handleStartEdit(item)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(item.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}

          {/* Always-visible input for adding new items */}
          <div className={`${items.length > 0 ? 'pt-3 border-t border-border' : ''}`}>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type to add an item..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemText.trim()) {
                    handleAdd();
                  }
                  if (e.key === 'Escape') {
                    setNewItemText('');
                  }
                }}
                className="flex-1"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-48 justify-between gap-2 font-normal',
                      newRequestedBy.length > 0 && 'border-primary/50 bg-primary/5'
                    )}
                  >
                    <span className="truncate">{getDisplayText(newRequestedBy)}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0 bg-popover z-50" align="end">
                  <div className="max-h-[300px] overflow-auto p-1">
                    {requestedByOptions.map((option) => {
                      const isSelected = newRequestedBy.includes(option);
                      return (
                        <div
                          key={option}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors',
                            isSelected && 'bg-accent/50'
                          )}
                          onClick={() => toggleRequestedBy(option)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleRequestedBy(option)}
                            className="pointer-events-none"
                          />
                          <span className="flex-1">{option}</span>
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kanban Board Dialog */}
      <Dialog open={isKanbanOpen} onOpenChange={setIsKanbanOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              Outstanding Items Board
            </DialogTitle>
          </DialogHeader>
          <KanbanBoard 
            items={items} 
            onUpdate={onUpdate} 
            getItemsByStage={getItemsByStage}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}