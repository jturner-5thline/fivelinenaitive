import { ReactNode, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutGrid, Check, RotateCcw, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  DEAL_GRID_LABELS, HEIGHT_LABELS, HEIGHT_PX, WIDTH_LABELS, WIDTH_SPAN, moveDealGridItem, resizeDealGridItem,
  type DealGridHeight, type DealGridItem, type DealGridWidgetId, type DealGridWidth,
} from '@/lib/dealGridLayout';

const SPAN_CLASS: Record<number, string> = { 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 6: 'lg:col-span-6' };

interface Props {
  items: DealGridItem[];
  widgets: Partial<Record<DealGridWidgetId, ReactNode>>;
  onChange: (next: DealGridItem[]) => void;
  onReset: () => void;
}

function Tile({ item, node, editing, onResize }: { item: DealGridItem; node: ReactNode; editing: boolean; onResize: (p: Partial<DealGridItem>) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editing });
  const px = HEIGHT_PX[item.h];
  return (
    <div
      ref={setNodeRef}
      data-widget-id={item.id}
      style={{ transform: CSS.Transform.toString(transform), transition, height: px ?? undefined }}
      className={cn(
        'relative min-w-0 col-span-1', SPAN_CLASS[WIDTH_SPAN[item.w]],
        px && 'overflow-auto [&>*]:!h-full',
        editing && 'rounded-lg outline outline-1 outline-dashed outline-primary/50',
        isDragging && 'z-20 opacity-80 shadow-xl',
      )}
    >
      {editing && (
        <div className="absolute top-1 right-1 z-30 flex items-center gap-1 rounded-md bg-card/95 p-0.5 shadow">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Resize ${DEAL_GRID_LABELS[item.id]}`}><Maximize2 className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-xs">Width</DropdownMenuLabel>
              {(Object.keys(WIDTH_LABELS) as DealGridWidth[]).map((w) => (
                <DropdownMenuItem key={w} onClick={() => onResize({ w })} className="text-xs justify-between">
                  {WIDTH_LABELS[w]}{item.w === w && <Check className="h-3 w-3" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Height</DropdownMenuLabel>
              {(Object.keys(HEIGHT_LABELS) as DealGridHeight[]).map((h) => (
                <DropdownMenuItem key={h} onClick={() => onResize({ h })} className="text-xs justify-between">
                  {HEIGHT_LABELS[h]}{item.h === h && <Check className="h-3 w-3" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" {...attributes} {...listeners} className="h-6 w-6 grid place-items-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" aria-label={`Drag ${DEAL_GRID_LABELS[item.id]}`}>
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {node}
    </div>
  );
}

/** Drag-to-reorder, preset-resizable grid of Deal Space widgets. */
export function DealWidgetGrid({ items, widgets, onChange, onReset }: Props) {
  const [editing, setEditing] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visible = items.filter((i) => widgets[i.id]);

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) onChange(moveDealGridItem(items, String(e.active.id), String(e.over.id)));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-1">
        {editing && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onReset}><RotateCcw className="h-3 w-3" />Reset</Button>
        )}
        <Button variant={editing ? 'default' : 'ghost'} size="sm" className="h-7 text-xs gap-1" onClick={() => setEditing((v) => !v)}>
          {editing ? <><Check className="h-3 w-3" />Done</> : <><LayoutGrid className="h-3 w-3" />Edit layout</>}
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-start">
            {visible.map((item) => (
              <Tile key={item.id} item={item} node={widgets[item.id]} editing={editing} onResize={(p) => onChange(resizeDealGridItem(items, item.id, p))} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
