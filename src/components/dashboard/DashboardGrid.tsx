import { Suspense, useCallback, useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WIDGET_REGISTRY } from './widgetRegistry';
import { GridItem, WidgetConfig } from '@/hooks/useDashboardPresets';
import { cn } from '@/lib/utils';

interface DashboardGridProps {
  gridConfig: GridItem[];
  widgetsConfig: WidgetConfig[];
  isEditing: boolean;
  onLayoutChange: (layout: GridItem[]) => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function WidgetFallback() {
  return (
    <div className="h-full p-4">
      <Skeleton className="h-5 w-32 mb-3" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function DashboardGrid({ gridConfig, widgetsConfig, isEditing, onLayoutChange, onRemoveWidget, onReorder }: DashboardGridProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    if (!isEditing) return;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!isEditing) return;
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Map grid items to their widget configs in order
  const orderedWidgets = gridConfig
    .sort((a, b) => (a.y * 12 + a.x) - (b.y * 12 + b.x))
    .map(g => {
      const widget = widgetsConfig.find(w => w.id === g.i);
      return widget ? { grid: g, widget } : null;
    })
    .filter(Boolean) as { grid: GridItem; widget: WidgetConfig }[];

  return (
    <div className="grid grid-cols-12 gap-4 auto-rows-[60px]">
      {orderedWidgets.map(({ grid, widget }, index) => {
        const def = WIDGET_REGISTRY[widget.type];
        if (!def) return null;
        const WidgetComponent = def.component;

        const colSpan = Math.min(grid.w, 12);
        const rowSpan = grid.h;

        return (
          <div
            key={widget.id}
            className={cn(
              'relative group min-h-0 overflow-hidden',
              isEditing && 'ring-1 ring-border/50 rounded-lg',
              isEditing && dragOverIndex === index && dragIndex !== index && 'ring-2 ring-primary',
              isEditing && dragIndex === index && 'opacity-50',
            )}
            style={{
              gridColumn: `span ${colSpan}`,
              gridRow: `span ${rowSpan}`,
            }}
            draggable={isEditing}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={() => handleDrop(index)}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          >
            {isEditing && (
              <div className="absolute top-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="h-6 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing bg-background/80 rounded-md">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 bg-background/80 hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveWidget(widget.id);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <div className="h-full overflow-hidden rounded-lg">
              <Suspense fallback={<WidgetFallback />}>
                <WidgetComponent config={widget.config} />
              </Suspense>
            </div>
          </div>
        );
      })}
    </div>
  );
}
