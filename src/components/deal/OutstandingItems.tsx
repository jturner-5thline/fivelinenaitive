import { useMemo, useRef, useState } from 'react';
import { SearchableRequesterList } from '@/components/deal/SearchableRequesterList';
import { Plus, X, Check, Pencil, Calendar, User, ChevronDown, ChevronRight, LayoutGrid, ArrowRight, GripVertical, CheckSquare, Square, Search, AlertTriangle, ArrowUp, ArrowUpRight, ClipboardPaste, UserPlus, Group } from 'lucide-react';
import { format, isPast, isToday, isTomorrow, differenceInDays } from 'date-fns';

// Parse YYYY-MM-DD as local date to avoid timezone shift
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { OutstandingItem, ItemPriority } from '@/hooks/useOutstandingItems';
import { OutstandingItemDialog } from './OutstandingItemDialog';
import type { ChecklistPhaseControls } from '@/hooks/useChecklistPhaseControls';
import type { ChecklistPhase } from '@/utils/applyDefaultChecklist';
import { Archive } from 'lucide-react';

export type { OutstandingItem };

// Helper to check if item is delivered to all requesters
export const isFullyDelivered = (item: OutstandingItem): boolean => {
  const requesters = Array.isArray(item.requestedBy) ? item.requestedBy : [item.requestedBy];
  if (!item.requestedBy || requesters.length === 0 || (requesters.length === 1 && !requesters[0])) {
    return false;
  }
  return requesters.every(requester => item.deliveredToLenders.includes(requester));
};

type KanbanStage = 'requested' | 'received' | 'approved';
type GroupBy = 'none' | 'requester' | 'status' | 'priority';

const KANBAN_STAGES: { key: KanbanStage; label: string; color: string }[] = [
  { key: 'requested', label: 'Requested', color: 'bg-amber-500' },
  { key: 'received', label: 'Received', color: 'bg-blue-500' },
  { key: 'approved', label: 'Submitted', color: 'bg-emerald-500' },
];

const PRIORITY_CONFIG: Record<ItemPriority, { label: string; color: string; dotColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  urgent: { label: 'Priority', color: 'text-destructive', dotColor: 'bg-destructive', icon: AlertTriangle },
  high: { label: 'Priority', color: 'text-destructive', dotColor: 'bg-destructive', icon: AlertTriangle },
  normal: { label: 'Normal', color: 'text-muted-foreground', dotColor: 'bg-muted-foreground', icon: ArrowUpRight },
};

interface OutstandingItemsProps {
  items: OutstandingItem[];
  lenderNames: string[];
  companyName?: string;
  onAdd: (text: string, requestedBy: string[]) => void;
  onUpdate: (id: string, updates: Partial<OutstandingItem>) => void;
  onDelete: (id: string) => void;
  onBulkAdd?: (texts: string[], requestedBy: string[]) => void;
  onReorder?: (items: OutstandingItem[]) => void;
  teamMembers?: { id: string; display_name: string }[];
  /**
   * Optional handler for the "Apply Checklist" banner shown when the deal
   * has zero outstanding items. Should run the same checklist resolution
   * (deal-type → standard fallback) as the create-deal flow.
   */
  onApplyDefaultChecklist?: () => Promise<void> | void;
  /**
   * Controls for phase-based checklist progression. When provided, renders
   * "+ Add Phase 2/3 Items" buttons and (for over-loaded deals created
   * after the phase rollout) a retroactive bulk-archive banner.
   */
  phaseControls?: ChecklistPhaseControls;
  /**
   * When true, all add/edit/delete affordances are hidden or disabled and
   * a banner is shown at the top explaining why. Existing items remain
   * viewable for record-keeping. Used for closed/archived/inactive deals.
   */
  readOnly?: boolean;
  /** Human-readable reason shown in the read-only banner (e.g. "Closed Won"). */
  readOnlyReason?: string;
}

const getItemStage = (item: OutstandingItem): KanbanStage => {
  if (item.approved) return 'approved';
  if (item.received) return 'received';
  return 'requested';
};

const moveToStage = (stage: KanbanStage, item: OutstandingItem): Partial<OutstandingItem> => {
  switch (stage) {
    case 'requested':
      return { received: false, approved: false };
    case 'received':
      return { received: true, approved: false };
    case 'approved':
      return { received: true, approved: true };
    default:
      return {};
  }
};

// ETA display helper
function EtaBadge({ eta }: { eta?: string }) {
  if (!eta) return null;
  // Parse as local date to avoid timezone shift (eta is YYYY-MM-DD)
  const parts = eta.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const overdue = isPast(date) && !isToday(date);
  const today = isToday(date);
  const tomorrow = isTomorrow(date);
  const daysUntil = differenceInDays(date, new Date());

  let label = format(date, 'M/d');
  if (today) label = 'Today';
  else if (tomorrow) label = 'Tomorrow';
  else if (overdue) label = `${Math.abs(daysUntil)}d overdue`;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md font-medium",
      overdue && "bg-destructive/10 text-destructive",
      today && "bg-orange-500/10 text-orange-600",
      tomorrow && "bg-amber-500/10 text-amber-600",
      !overdue && !today && !tomorrow && "bg-muted text-muted-foreground"
    )}>
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

// Priority dot
function PriorityDot({ priority, size = 'sm' }: { priority: ItemPriority; size?: 'sm' | 'md' }) {
  const config = PRIORITY_CONFIG[priority];
  if (priority === 'normal' || priority === 'high') return null;
  return (
    <span className={cn(
      "rounded-full shrink-0",
      config.dotColor,
      size === 'sm' ? "w-2 h-2" : "w-2.5 h-2.5"
    )} title={config.label} />
  );
}

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
          <div className="flex items-center gap-1.5 mb-1">
            <PriorityDot priority={item.priority} />
            <p className="text-sm font-medium">{item.text}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {(!item.requestedBy || item.requestedBy.length === 0)
                ? 'No requester'
                : Array.isArray(item.requestedBy) ? item.requestedBy.join(', ') : item.requestedBy}
            </span>
            <EtaBadge eta={item.eta} />
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
      const item = items.find(i => i.id === active.id);
      if (item && KANBAN_STAGES.some(s => s.key === targetStage)) {
        onUpdate(active.id as string, moveToStage(targetStage, item));
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
                    {(!activeItem.requestedBy || activeItem.requestedBy.length === 0)
                      ? 'No requester'
                      : Array.isArray(activeItem.requestedBy) ? activeItem.requestedBy.join(', ') : activeItem.requestedBy}
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

export function OutstandingItems({ items, lenderNames, companyName, onAdd: rawOnAdd, onUpdate: rawOnUpdate, onDelete: rawOnDelete, onBulkAdd: rawOnBulkAdd, onReorder: rawOnReorder, teamMembers, onApplyDefaultChecklist, phaseControls, readOnly = false, readOnlyReason }: OutstandingItemsProps) {
  // When readOnly, neuter all mutators so any leftover handler (kanban
  // drag, checkbox toggles, etc.) cannot mutate items. Also disable the
  // top-level add/bulk handlers so banner/empty-state CTAs no-op.
  const onAdd = readOnly ? (() => {}) : rawOnAdd;
  const onUpdate = readOnly ? (() => {}) : rawOnUpdate;
  const onDelete = readOnly ? (() => {}) : rawOnDelete;
  const onBulkAdd = readOnly ? undefined : rawOnBulkAdd;
  const onReorder = readOnly ? undefined : rawOnReorder;
  const [newItemText, setNewItemText] = useState('');
  const [newRequestedBy, setNewRequestedBy] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState<ItemPriority>('normal');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingRequestedBy, setEditingRequestedBy] = useState<string[]>([]);
  const [isKanbanOpen, setIsKanbanOpen] = useState(false);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [filterByLender, setFilterByLender] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<OutstandingItem | null>(null);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [showAllItems, setShowAllItems] = useState(true);
  const [requesterPopoverOpen, setRequesterPopoverOpen] = useState(false);
  const [requesterPopoverKey, setRequesterPopoverKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [bulkImportRequestedBy, setBulkImportRequestedBy] = useState<string[]>([]);
  const bulkImportDialogContentRef = useRef<HTMLDivElement>(null);
  // Individual-add mode rows inside the Bulk Import dialog. Each row has
  // its own text and an optional requester override; if the override is
  // empty, it falls back to the dialog-level "Assign requester to all".
  const [individualRows, setIndividualRows] = useState<Array<{ id: string; text: string; requestedBy: string[] }>>([]);

  const handleItemClick = (item: OutstandingItem) => {
    if (editingId) return;
    setSelectedItem(item);
    setIsItemDialogOpen(true);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllActive = () => setSelectedIds(new Set(activeItems.map(item => item.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkMarkReceived = () => {
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item && !item.received) onUpdate(id, { received: true });
    });
    clearSelection();
  };

  const handleBulkMarkApproved = () => {
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item && !item.approved) onUpdate(id, { approved: true });
    });
    clearSelection();
  };

  const handleBulkMarkBoth = () => {
    selectedIds.forEach(id => onUpdate(id, { received: true, approved: true }));
    clearSelection();
  };

  const requestedByOptions = [
    ...(companyName ? [companyName] : []),
    ...lenderNames,
  ];

  const toggleFilterLender = (option: string) => {
    setFilterByLender(prev => 
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;
    
    if (filterByLender.length > 0) {
      result = result.filter(item => {
        const requesters = Array.isArray(item.requestedBy) ? item.requestedBy : [item.requestedBy];
        return filterByLender.some(lender => requesters.includes(lender));
      });
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.text.toLowerCase().includes(q) ||
        (item.requestedBy && item.requestedBy.some(r => r.toLowerCase().includes(q))) ||
        (item.assignedTo && item.assignedTo.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [items, filterByLender, searchQuery]);

  const isCompleted = (item: OutstandingItem) => item.received && item.approved;
  
  const displayItems = showAllItems ? filteredItems : filteredItems.filter(item => !isCompleted(item));
  
  const sortedItems = [...displayItems].sort((a, b) => {
    const aCompleted = isCompleted(a);
    const bCompleted = isCompleted(b);
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
    // Sort by priority within same completion status
    const priorityOrder: Record<ItemPriority, number> = { urgent: 0, high: 1, normal: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  const activeItems = sortedItems.filter(item => !isCompleted(item));
  const completedItems = sortedItems.filter(item => isCompleted(item));

  // Group items
  const groupedActiveItems = useMemo(() => {
    if (groupBy === 'none') return null;
    
    const groups: Record<string, OutstandingItem[]> = {};
    activeItems.forEach(item => {
      let key: string;
      switch (groupBy) {
        case 'requester':
          key = (!item.requestedBy || item.requestedBy.length === 0) ? 'No Requester' : item.requestedBy.join(', ');
          break;
        case 'status':
          key = item.approved ? 'Submitted' : item.received ? 'Received' : 'Requested';
          break;
        case 'priority':
          key = PRIORITY_CONFIG[item.priority].label;
          break;
        default:
          key = 'Other';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [activeItems, groupBy]);

  const handleAdd = () => {
    if (searchQuery.trim()) {
      onAdd(searchQuery.trim(), newRequestedBy);
      setSearchQuery('');
      setNewRequestedBy([]);
      setNewPriority('normal');
    }
  };

  const toggleRequestedBy = (option: string) => {
    const isRemoving = newRequestedBy.includes(option);
    const updatedRequestedBy = isRemoving
      ? newRequestedBy.filter(o => o !== option)
      : [...newRequestedBy, option];
    
    setNewRequestedBy(updatedRequestedBy);

    if (!isRemoving && searchQuery.trim()) {
      onAdd(searchQuery.trim(), updatedRequestedBy);
      setSearchQuery('');
      setNewRequestedBy([]);
      // Bump key to force-close the uncontrolled Popover after auto-add.
      setRequesterPopoverKey(k => k + 1);
      setRequesterPopoverOpen(false);
    }
  };

  const toggleEditingRequestedBy = (option: string) => {
    setEditingRequestedBy(prev => 
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
    );
  };

  const getDisplayText = (selected: string[], isNew: boolean = false) => {
    if (selected.length === 0) return isNew ? 'Select requester' : 'No requester';
    if (selected.length === 1) return selected[0];
    return `${selected.length} selected`;
  };

  const handleStartEdit = (item: OutstandingItem) => {
    setEditingId(item.id);
    setEditingText(item.text);
    setEditingRequestedBy(Array.isArray(item.requestedBy) ? [...item.requestedBy] : [item.requestedBy]);
  };

  const handleSaveEdit = () => {
    if (editingId && editingText.trim()) {
      onUpdate(editingId, { text: editingText.trim(), requestedBy: editingRequestedBy });
      setEditingId(null);
      setEditingText('');
      setEditingRequestedBy([]);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText('');
    setEditingRequestedBy([]);
  };

  const handleBulkImport = () => {
    const lines = bulkImportText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const rows = individualRows
      .map(r => ({ text: r.text.trim(), requestedBy: r.requestedBy.length > 0 ? r.requestedBy : bulkImportRequestedBy }))
      .filter(r => r.text.length > 0);
    if (lines.length === 0 && rows.length === 0) return;
    if (lines.length > 0 && onBulkAdd) {
      onBulkAdd(lines, bulkImportRequestedBy);
    }
    // Individual rows can have differing requesters, so add them one by one.
    for (const r of rows) {
      onAdd(r.text, r.requestedBy);
    }
    setBulkImportText('');
    setBulkImportRequestedBy([]);
    setIndividualRows([]);
    setIsBulkImportOpen(false);
  };

  const toggleBulkImportRequestedBy = (option: string) => {
    setBulkImportRequestedBy(prev =>
      prev.includes(option) ? prev.filter(r => r !== option) : [...prev, option]
    );
  };

  const deliveredCount = items.filter(i => isFullyDelivered(i)).length;
  const completedCount = items.filter(i => isCompleted(i)).length;
  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  // Count overdue items
  const overdueCount = items.filter(i => {
    if (!i.eta || isCompleted(i)) return false;
    return isPast(new Date(i.eta)) && !isToday(new Date(i.eta));
  }).length;

  const getItemsByStage = (stage: KanbanStage) => {
    return items.filter(item => getItemStage(item) === stage);
  };

  // Render a single item row
  const renderItemRow = (item: OutstandingItem, isCompletedRow: boolean = false) => {
    const hasNoRequester = !item.requestedBy || item.requestedBy.length === 0;
    const isSelected = selectedIds.has(item.id);
    
    return (
      <div
        key={item.id}
        data-outstanding-tile="true"
        data-selected={isSelected ? "true" : undefined}
        className={cn(
          "outstanding-item-tile flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors cursor-pointer",
          isCompletedRow && "opacity-60",
          "border-border hover:border-primary/50",
          isSelected && "border-primary/50 bg-primary/5"
        )}
        onClick={() => {
          if (editingId !== item.id) handleItemClick(item);
        }}
      >
        {/* Selection Checkbox */}
        {!isCompletedRow && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleSelection(item.id)}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "shrink-0",
              isSelected && "border-primary bg-primary text-primary-foreground"
            )}
          />
        )}
        
        {editingId === item.id ? (
          <div className="flex-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-40 justify-between gap-2 font-normal text-xs',
                    editingRequestedBy.length > 0 ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 bg-destructive/5'
                  )}
                >
                  <span className="truncate">{getDisplayText(editingRequestedBy)}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0 bg-popover" align="end">
                <SearchableRequesterList
                  options={requestedByOptions}
                  selected={editingRequestedBy}
                  onToggle={toggleEditingRequestedBy}
                />
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="gradient" onClick={handleSaveEdit}>Save</Button>
            <Button size="sm" variant="ghost" onClick={handleCancelEdit}><X className="h-4 w-4" /></Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                onDelete(item.id);
                handleCancelEdit();
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <>
            {/* Priority dot */}
            <PriorityDot priority={item.priority} />
            
            <div className="flex-1 min-w-0">
              <span className={cn(
                "text-sm block truncate",
                isCompletedRow && "line-through text-muted-foreground"
              )}>
                {item.text}
              </span>
              <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                {isCompletedRow && item.completedAt && (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" />
                    Completed {format(new Date(item.completedAt), 'MMM d, yyyy')}
                  </span>
                )}
                {item.eta ? (
                  <EtaBadge eta={!isCompletedRow ? item.eta : undefined} />
                ) : (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(item.createdAt), 'M/d/yy')}
                  </span>
                )}
                <span className={cn(
                  "flex items-center gap-1 whitespace-nowrap",
                  hasNoRequester && "text-destructive"
                )}>
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {hasNoRequester
                      ? 'No requester assigned'
                      : `by ${Array.isArray(item.requestedBy) ? item.requestedBy.join(', ') : item.requestedBy}`}
                  </span>
                </span>
              </div>
            </div>
            
            {!isCompletedRow && (
              <>
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  <div className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
                    item.received && "bg-emerald-500/10"
                  )}>
                    <Checkbox
                      checked={item.received}
                      onCheckedChange={(checked) =>
                        onUpdate(item.id, { received: checked === true })
                      }
                      disabled={readOnly}
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
                      disabled={readOnly}
                      className={cn(
                        item.approved && "border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                      )}
                    />
                    <span className={cn(
                      "text-xs",
                      item.approved ? "text-emerald-600 font-medium" : "text-muted-foreground"
                    )}>Submitted</span>
                  </div>
                </div>
                {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(item);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                )}
                {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate(item.id, { received: true, approved: true });
                  }}
                  title="Mark as complete"
                >
                  <Check className="h-4 w-4" />
                </Button>
                )}
              </>
            )}
            
            {isCompletedRow && (
              <>
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10">
                    <Checkbox
                      checked={item.received}
                      onCheckedChange={(checked) => onUpdate(item.id, { received: checked === true })}
                      disabled={readOnly}
                      className="border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <span className="text-xs text-emerald-600 font-medium">Received</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10">
                    <Checkbox
                      checked={item.approved}
                      onCheckedChange={(checked) => onUpdate(item.id, { approved: checked === true })}
                      disabled={readOnly}
                      className="border-emerald-500 bg-emerald-500 text-white data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                    />
                    <span className="text-xs text-emerald-600 font-medium">Submitted</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEdit(item);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-y-2 min-h-[44px] py-0 px-4 space-y-0 shrink-0">
          <div className="flex items-center gap-2 min-w-0 shrink-0 order-1">
            <CardTitle className="text-sm font-medium whitespace-nowrap">Outstanding Items</CardTitle>
            {overdueCount > 0 && (
              <span className="text-xs font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md">
                {overdueCount} overdue
              </span>
            )}
          </div>
          {/*
            Responsive toolbar: wraps onto a second line at narrow widths.
            Order classes guarantee Search → All → Bulk Add always come first
            so they stay visible on row 1, and the icon-only / requester
            controls drop to row 2 before anything important is clipped.
          */}
          <div className="flex flex-row flex-wrap items-center gap-2 order-2 justify-end ml-auto min-w-0">
            {/* Filter by requester — wraps to next line first at narrow widths */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'gap-1.5 text-xs h-8 order-6',
                    filterByLender.length > 0 && 'border-primary bg-primary/5'
                  )}
                >
                  <User className="h-3 w-3" />
                  {filterByLender.length === 0 
                    ? 'All' 
                    : filterByLender.length === 1 
                      ? filterByLender[0] 
                      : `${filterByLender.length}`}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0 bg-popover" align="start">
                <SearchableRequesterList
                  options={requestedByOptions}
                  selected={filterByLender}
                  onToggle={toggleFilterLender}
                />
                {filterByLender.length > 0 && (
                  <div className="border-t border-border p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center text-xs"
                      onClick={() => setFilterByLender([])}
                    >
                      Clear filter
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            
            {/* Group by */}
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="h-8 w-8 p-0 flex items-center justify-center text-xs [&>svg:last-child]:hidden order-4" title="Group by">
                <Group className="h-4 w-4" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No grouping</SelectItem>
                <SelectItem value="requester">By requester</SelectItem>
                <SelectItem value="status">By status</SelectItem>
                <SelectItem value="priority">By priority</SelectItem>
              </SelectContent>
            </Select>

            {/* Bulk import */}
            {onBulkAdd && !readOnly && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 gap-1.5 text-xs order-3 whitespace-nowrap shrink-0"
                onClick={() => setIsBulkImportOpen(true)}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Bulk Add
              </Button>
            )}
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 order-5"
              onClick={() => setIsKanbanOpen(true)}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Search */}
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full pl-7 text-xs"
            />
          </div>
        </div>

        {/* Progress Bar */}
        {items.length > 0 && (
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{completedCount}/{items.length}</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}
        
        <CardContent className="space-y-3 flex-1 min-h-0 overflow-y-auto">
          {readOnly && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
              <span aria-hidden>🔒</span>
              <span>
                This deal is <strong>{readOnlyReason || 'inactive'}</strong>. Outstanding items are read-only and cannot be added, edited, or deleted.
              </span>
            </div>
          )}
          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && !readOnly && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{selectedIds.size} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleBulkMarkReceived}>Mark Received</Button>
                <Button size="sm" variant="outline" onClick={handleBulkMarkApproved}>Mark Submitted</Button>
                <Button size="sm" variant="gradient" onClick={handleBulkMarkBoth}>Mark Both</Button>
                <Button size="sm" variant="ghost" onClick={clearSelection}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {/* Select All for Active Items */}
          {activeItems.length > 1 && selectedIds.size === 0 && !readOnly && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={selectAllActive}
              >
                <Square className="h-3.5 w-3.5" />
                Select all ({activeItems.length})
              </Button>
            </div>
          )}

          {/* Add item input */}
          {!readOnly && (
          <div className={`${items.length > 0 ? 'pb-3 border-b border-border' : ''}`}>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Type to add an item..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newItemText.trim()) handleAdd();
                  if (e.key === 'Escape') setNewItemText('');
                }}
                className="flex-1"
              />
              <Popover key={requesterPopoverKey}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-48 justify-between gap-2 font-normal',
                      newRequestedBy.length > 0 ? 'border-primary/50 bg-primary/5' : 'border-destructive/50 text-muted-foreground'
                    )}
                  >
                    <span className="truncate">{getDisplayText(newRequestedBy, true)}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0 bg-popover" align="end">
                  <SearchableRequesterList
                    options={requestedByOptions}
                    selected={newRequestedBy}
                    onToggle={toggleRequestedBy}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          )}

          {filteredItems.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No items match your search' : filterByLender.length > 0 ? 'No items match the filter' : 'No outstanding items yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {!searchQuery && filterByLender.length === 0 && 'Add items above to track what\'s needed from lenders'}
              </p>
              {/* Retroactive bulk-add for legacy deals (Fix 4). Only shown
                  when the deal truly has zero items overall — not when a
                  search/filter merely hides them. */}
              {!searchQuery && filterByLender.length === 0 && items.length === 0 && onApplyDefaultChecklist && !readOnly && (
                <div className="mt-4 mx-auto max-w-md rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground text-left">
                    Apply the default checklist to get started.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => { await onApplyDefaultChecklist(); }}
                  >
                    Apply Checklist
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Grouped or flat active items */}
          {groupBy !== 'none' && groupedActiveItems ? (
            Object.entries(groupedActiveItems).map(([group, groupItems]) => (
              <div key={group} className="space-y-2">
                <div className="flex items-center gap-2 pt-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{groupItems.length}</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                {groupItems.map((item) => renderItemRow(item))}
              </div>
            ))
          ) : (
            activeItems.map((item) => renderItemRow(item))
          )}

          {/* Phase progression controls (Fix 3) and retroactive banner (Fix 4) */}
          {phaseControls && !readOnly && (
            <div className="space-y-2 pt-2">
              {phaseControls.showRetroBanner && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    This deal has all checklist phases loaded.
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    You may want to archive Phase 2 and Phase 3 items until needed. Archiving hides them — nothing is deleted.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(Object.keys(phaseControls.phases) as unknown as ChecklistPhase[])
                      .filter((p) => Number(p) === 2 || Number(p) === 3)
                      .map((p) => {
                        const ph = Number(p) as ChecklistPhase;
                        const present = phaseControls.phases[ph].present;
                        if (present === 0) return null;
                        return (
                          <Button
                            key={`arch-${ph}`}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => phaseControls.archivePhase(ph)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Archive Phase {ph} Items ({present})
                          </Button>
                        );
                      })}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {([2, 3] as ChecklistPhase[]).map((ph) => {
                  const remaining = phaseControls.phases[ph].remaining;
                  if (remaining === 0) return null;
                  // Only show "Add Phase N" once the prior phase has at least one item present.
                  const priorPresent =
                    ph === 2
                      ? phaseControls.phases[1].present + phaseControls.phases[1].archived > 0 ||
                        items.length > 0
                      : phaseControls.phases[2].present + phaseControls.phases[2].archived > 0;
                  if (!priorPresent) return null;
                  return (
                    <Button
                      key={`add-${ph}`}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-dashed"
                      onClick={() => phaseControls.addPhase(ph)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Phase {ph} Items ({remaining})
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Items Section */}
          {completedItems.length > 0 && (
            <Collapsible open={isCompletedExpanded} onOpenChange={setIsCompletedExpanded}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 w-full pt-3 border-t border-border hover:text-primary transition-colors">
                  {isCompletedExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-emerald-600">Completed Items</span>
                  <span className="text-xs text-muted-foreground">({completedItems.length})</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                {completedItems.map((item) => renderItemRow(item, true))}
              </CollapsibleContent>
            </Collapsible>
          )}

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

      {/* Bulk Import Dialog */}
      <Dialog modal={false} open={isBulkImportOpen} onOpenChange={(open) => { setIsBulkImportOpen(open); if (!open) { setBulkImportRequestedBy([]); setIndividualRows([]); setBulkImportText(''); } }}>
        <DialogContent ref={bulkImportDialogContentRef} className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5" />
              Bulk Import Items
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a list of items, one per line. Each line will be added as a separate outstanding item.
            </p>
            <Textarea
              value={bulkImportText}
              onChange={(e) => setBulkImportText(e.target.value)}
              placeholder={"Paste items here, one per line…\n\ne.g.\nFinancial Statements\nTax Returns\nBank Statements"}
              className="min-h-[200px] font-mono text-sm placeholder:text-muted-foreground/60 placeholder:italic"
              autoFocus
            />
            <button
              type="button"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              onClick={() => setIndividualRows(prev => [...prev, { id: `${Date.now()}-${prev.length}`, text: '', requestedBy: [] }])}
            >
              + Add individual item
            </button>
            {/* Individual add mode — alternative to pasting. Each row can
                optionally override the dialog-level requester. */}
            {individualRows.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Individual items</label>
                {individualRows.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.text}
                      placeholder="Item name…"
                      onChange={(e) => setIndividualRows(prev => prev.map((r, i) => i === idx ? { ...r, text: e.target.value } : r))}
                      className="flex-1 h-8 text-sm"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 gap-1.5 text-xs w-40 justify-between font-normal',
                            row.requestedBy.length > 0 ? 'border-primary/50 bg-primary/5' : 'text-muted-foreground'
                          )}
                        >
                          <span className="truncate">{row.requestedBy.length === 0 ? 'Override requester' : getDisplayText(row.requestedBy)}</span>
                          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent container={bulkImportDialogContentRef.current} className="pointer-events-auto z-[100] w-[220px] p-0 bg-popover" align="end">
                        <SearchableRequesterList
                          options={requestedByOptions}
                          selected={row.requestedBy}
                          onToggle={(opt) => setIndividualRows(prev => prev.map((r, i) => i === idx ? { ...r, requestedBy: r.requestedBy.includes(opt) ? r.requestedBy.filter(x => x !== opt) : [...r.requestedBy, opt] } : r))}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setIndividualRows(prev => prev.filter((_, i) => i !== idx))}
                      aria-label="Remove row"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assign requester to all items</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-between gap-2 font-normal',
                      bulkImportRequestedBy.length > 0 ? 'border-primary/50 bg-primary/5' : 'text-muted-foreground'
                    )}
                  >
                    <span className="truncate">{bulkImportRequestedBy.length === 0 ? 'Select requester (optional)' : getDisplayText(bulkImportRequestedBy)}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent container={bulkImportDialogContentRef.current} className="pointer-events-auto z-[100] w-[220px] p-0 bg-popover" align="start">
                  <SearchableRequesterList
                    options={requestedByOptions}
                    selected={bulkImportRequestedBy}
                    onToggle={toggleBulkImportRequestedBy}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {bulkImportText.split('\n').filter(l => l.trim()).length + individualRows.filter(r => r.text.trim()).length} items to import
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsBulkImportOpen(false)}>Cancel</Button>
                <Button onClick={handleBulkImport} disabled={!bulkImportText.trim() && individualRows.every(r => !r.text.trim())}>
                  Import Items
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Outstanding Item Detail Dialog */}
      <OutstandingItemDialog
        item={selectedItem}
        items={sortedItems}
        open={isItemDialogOpen}
        onOpenChange={setIsItemDialogOpen}
        onUpdate={onUpdate}
        onSelectItem={(item) => setSelectedItem(item)}
        lenderNames={lenderNames}
        companyName={companyName}
        teamMembers={teamMembers}
      />
    </>
  );
}
