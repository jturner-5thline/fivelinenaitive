import { useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Columns3, GripVertical, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { CrmColumnDef } from '@/hooks/useCrmTableColumns';

function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function reorder(ids: string[], e: DragEndEvent) {
  const { active, over } = e;
  if (!over || active.id === over.id) return null;
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  if (from < 0 || to < 0) return null;
  return arrayMove(ids, from, to);
}

/* ---------- Draggable table headers ---------- */

export function SortableHeaderContext({
  visibleIds, fullOrder, onReorder, children,
}: { visibleIds: string[]; fullOrder: string[]; onReorder: (next: string[]) => void; children: React.ReactNode }) {
  const sensors = useDragSensors();
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        // Reorder within the full order so hidden columns keep their slots.
        const next = reorder(fullOrder, e);
        if (next) onReorder(next);
      }}
    >
      <SortableContext items={visibleIds} strategy={horizontalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortableTh({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <TableHead
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 20 : undefined, position: 'relative' }}
      className={cn('group/th', isDragging && 'bg-muted/60 opacity-90', className)}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          data-no-row-nav
          aria-label="Drag to reorder column"
          className="-ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 opacity-0 group-hover/th:opacity-100 focus:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        {children}
      </div>
    </TableHead>
  );
}

/* ---------- Settings popover ---------- */

function SortableItem({ col, visible, onToggle, disabled }: { col: CrmColumnDef; visible: boolean; onToggle: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50', isDragging && 'bg-muted z-10 relative')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${col.label}`}
        className={cn('text-muted-foreground/60', disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing')}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Checkbox id={`col-${col.id}`} checked={visible} onCheckedChange={onToggle} />
      <label htmlFor={`col-${col.id}`} className={cn('flex-1 cursor-pointer truncate', !visible && 'text-muted-foreground')}>{col.label}</label>
    </div>
  );
}

export function ColumnSettingsButton({
  columns, order, hidden, onReorder, onToggle, onShowAll, onReset, className,
}: {
  columns: CrmColumnDef[];
  order: string[];
  hidden: string[];
  onReorder: (next: string[]) => void;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onReset: () => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const sensors = useDragSensors();
  const byId = new Map(columns.map(c => [c.id, c]));
  const ordered = order.map(id => byId.get(id)).filter(Boolean) as CrmColumnDef[];
  const searching = q.trim().length > 0;
  const shown = searching ? ordered.filter(c => c.label.toLowerCase().includes(q.toLowerCase())) : ordered;
  const visibleCount = order.length - hidden.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 shrink-0 gap-1.5', className)} aria-label="Customize columns">
          <Columns3 className="h-4 w-4" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-border/40 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Columns</p>
            <span className="text-xs text-muted-foreground">{visibleCount} of {order.length} shown</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Changes apply to everyone on your account.</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a column" className="h-8 pl-7 text-xs" />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => { const next = reorder(order, e); if (next) onReorder(next); }}
          >
            <SortableContext items={shown.map(c => c.id)} strategy={verticalListSortingStrategy}>
              {shown.map(col => (
                <SortableItem
                  key={col.id}
                  col={col}
                  visible={!hidden.includes(col.id)}
                  onToggle={() => onToggle(col.id)}
                  disabled={searching}
                />
              ))}
            </SortableContext>
          </DndContext>
          {shown.length === 0 && <p className="text-xs text-muted-foreground p-2">No matching columns</p>}
        </div>
        <div className="flex items-center justify-between gap-2 p-2 border-t border-border/40">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onShowAll}>Show all</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onReset}>
            <RotateCcw className="h-3 w-3" /> Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
