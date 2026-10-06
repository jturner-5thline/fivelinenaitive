import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEAL_WIDGET_LABELS, type DealWidgetKey } from '@/hooks/useDealWidgetVisibility';

interface Props {
  order: DealWidgetKey[];
  onReorder: (next: DealWidgetKey[]) => void;
  renderToggle: (key: DealWidgetKey) => ReactNode;
}

const labelOf = (k: DealWidgetKey) => DEAL_WIDGET_LABELS.find((w) => w.key === k)?.label ?? k;

function Row({ id, idx, total, onMove, toggle }: {
  id: DealWidgetKey; idx: number; total: number; onMove: (to: number) => void; toggle: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const label = labelOf(id);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-1.5 text-sm rounded-md px-1 py-1 hover:bg-muted/40',
        isDragging && 'opacity-30 border border-dashed border-primary/60 bg-primary/5',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${label}`}
        className="touch-none cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="flex-1 truncate">{label}</span>
      <button type="button" aria-label={`Move ${label} up`} disabled={idx === 0} onClick={() => onMove(idx - 1)} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label={`Move ${label} down`} disabled={idx === total - 1} onClick={() => onMove(idx + 1)} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {toggle}
    </div>
  );
}

const FIXED: DealWidgetKey[] = ['statusReport'];

export function DealWidgetOrderList({ order: fullOrder, onReorder: saveOrder, renderToggle }: Props) {
  // Status Report is a header action, not a column widget — it can be toggled but not reordered.
  const order = fullOrder.filter((k) => !FIXED.includes(k));
  const onReorder = (next: DealWidgetKey[]) => saveOrder([...next, ...fullOrder.filter((k) => FIXED.includes(k))]);
  const [active, setActive] = useState<DealWidgetKey | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onStart = (e: DragStartEvent) => setActive(e.active.id as DealWidgetKey);
  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const from = order.indexOf(a.id as DealWidgetKey);
    const to = order.indexOf(over.id as DealWidgetKey);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(order, from, to));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onStart}
      onDragEnd={onEnd}
      onDragCancel={() => setActive(null)}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="space-y-1 relative">
          {order.map((k, idx) => (
            <Row
              key={k}
              id={k}
              idx={idx}
              total={order.length}
              onMove={(to) => { if (to >= 0 && to < order.length) onReorder(arrayMove(order, idx, to)); }}
              toggle={renderToggle(k)}
            />
          ))}
          {fullOrder.filter((k) => FIXED.includes(k)).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-sm rounded-md px-1 py-1 pl-6">
              <span className="flex-1 truncate">{labelOf(k)} <span className="text-[10px] text-muted-foreground">(header button)</span></span>
              {renderToggle(k)}
            </div>
          ))}
        </div>
      </SortableContext>
      {/* Portal to body: the popover wrapper is transformed, which breaks the
          overlay's fixed positioning and makes collisions land on the last row. */}
      {typeof document !== 'undefined' && createPortal(
        <DragOverlay zIndex={2000}>
          {active ? (
            <div className="flex items-center gap-1.5 text-sm rounded-md px-1 py-1 bg-popover border border-primary/70 shadow-lg ring-1 ring-primary/30 cursor-grabbing">
              <GripVertical className="h-3.5 w-3.5 text-primary" />
              <span className="flex-1 truncate font-medium">{labelOf(active)}</span>
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
