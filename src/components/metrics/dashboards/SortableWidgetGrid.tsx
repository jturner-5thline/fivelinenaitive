import React, { useEffect, useMemo, useState } from 'react';
import { GripVertical } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUiPreference } from '@/hooks/useUiPreference';

export type SortableItem = {
  id: string;
  /** Optional grid column span override (e.g. '1 / -1' for full width). */
  gridColumn?: string;
  render: () => React.ReactNode;
};

function SortableCard({ id, gridColumn, children }: { id: string; gridColumn?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn,
    position: 'relative',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* Drag handle pinned to top-right of card */}
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...listeners}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 5,
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 6,
          background: 'rgba(20,35,55,0.6)',
          border: '1px solid rgba(120,170,255,0.18)',
          color: 'rgba(170,205,225,0.6)',
          cursor: 'grab',
          touchAction: 'none',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical size={12} />
      </button>
      {children}
    </div>
  );
}

export function SortableWidgetGrid({
  storageKey,
  items,
  style,
  className,
}: {
  /** Stable key used to persist the user's order in user_ui_preferences. */
  storageKey: string;
  items: SortableItem[];
  style?: React.CSSProperties;
  className?: string;
}) {
  const defaultOrder = useMemo(() => items.map(i => i.id), [items]);
  const [savedOrder, persistOrder] = useUiPreference<string[]>(storageKey, defaultOrder);

  // Local order — reconciled with the items + saved preference (keeps any new items appended).
  const [order, setOrder] = useState<string[]>(defaultOrder);
  useEffect(() => {
    const present = new Set(items.map(i => i.id));
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const id of savedOrder || []) {
      if (present.has(id) && !seen.has(id)) { merged.push(id); seen.add(id); }
    }
    for (const id of defaultOrder) {
      if (!seen.has(id)) { merged.push(id); seen.add(id); }
    }
    setOrder(merged);
  }, [savedOrder, defaultOrder, items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    persistOrder(next);
  };

  const byId = useMemo(() => {
    const m = new Map<string, SortableItem>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className={className} style={style}>
          {order.map(id => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <SortableCard key={id} id={id} gridColumn={item.gridColumn}>
                {item.render()}
              </SortableCard>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}