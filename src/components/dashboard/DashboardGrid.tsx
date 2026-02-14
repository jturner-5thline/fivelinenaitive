import { Suspense, useState, useRef, useCallback } from 'react';
import { X, GripVertical, Maximize2 } from 'lucide-react';
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

const ROW_HEIGHT = 60;
const GAP = 16;

export function DashboardGrid({ gridConfig, widgetsConfig, isEditing, onLayoutChange, onRemoveWidget, onReorder }: DashboardGridProps) {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ w: number; h: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

  const handleResizeStart = useCallback((e: React.MouseEvent, gridItem: GridItem) => {
    if (!isEditing || !gridRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    setResizingId(gridItem.i);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = gridItem.w;
    const startH = gridItem.h;

    const gridRect = gridRef.current.getBoundingClientRect();
    const colWidth = (gridRect.width - GAP * 11) / 12;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      const newW = Math.max(gridItem.minW || 3, Math.min(12, Math.round(startW + dx / (colWidth + GAP))));
      const newH = Math.max(gridItem.minH || 2, Math.min(12, Math.round(startH + dy / (ROW_HEIGHT + GAP))));

      setResizePreview({ w: newW, h: newH });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      setResizingId(null);
      const preview = { w: startW, h: startH };

      // Apply via a timeout so we capture the latest preview
      setTimeout(() => {
        const finalPreview = resizePreviewRef.current;
        if (finalPreview) {
          const updated = gridConfig.map(g =>
            g.i === gridItem.i ? { ...g, w: finalPreview.w, h: finalPreview.h } : g
          );
          onLayoutChange(updated);
        }
        setResizePreview(null);
      }, 0);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isEditing, gridConfig, onLayoutChange]);

  // Keep a ref to the latest resize preview for mouseup handler
  const resizePreviewRef = useRef<{ w: number; h: number } | null>(null);
  resizePreviewRef.current = resizePreview;

  // Map grid items to their widget configs in order
  const orderedWidgets = [...gridConfig]
    .sort((a, b) => (a.y * 12 + a.x) - (b.y * 12 + b.x))
    .map(g => {
      const widget = widgetsConfig.find(w => w.id === g.i);
      return widget ? { grid: g, widget } : null;
    })
    .filter(Boolean) as { grid: GridItem; widget: WidgetConfig }[];

  return (
    <div ref={gridRef} className="grid grid-cols-12 gap-4 auto-rows-[60px]">
      {orderedWidgets.map(({ grid, widget }, index) => {
        const def = WIDGET_REGISTRY[widget.type];
        if (!def) return null;
        const WidgetComponent = def.component;

        const isResizing = resizingId === grid.i;
        const colSpan = Math.min(isResizing && resizePreview ? resizePreview.w : grid.w, 12);
        const rowSpan = isResizing && resizePreview ? resizePreview.h : grid.h;

        return (
          <div
            key={widget.id}
            className={cn(
              'relative group min-h-0 overflow-hidden',
              isEditing && 'ring-1 ring-border/50 rounded-lg',
              isEditing && dragOverIndex === index && dragIndex !== index && 'ring-2 ring-primary',
              isEditing && dragIndex === index && 'opacity-50',
              isResizing && 'ring-2 ring-primary z-10',
            )}
            style={{
              gridColumn: `span ${colSpan}`,
              gridRow: `span ${rowSpan}`,
              transition: isResizing ? 'none' : 'all 0.15s ease',
            }}
            draggable={isEditing && !resizingId}
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

            {/* Resize handle */}
            {isEditing && (
              <div
                className="absolute bottom-0 right-0 z-10 w-5 h-5 cursor-se-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={(e) => handleResizeStart(e, grid)}
              >
                <Maximize2 className="h-3 w-3 text-muted-foreground rotate-90" />
              </div>
            )}

            {/* Size indicator while resizing */}
            {isResizing && resizePreview && (
              <div className="absolute top-1 left-1 z-20 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded font-mono">
                {resizePreview.w}×{resizePreview.h}
              </div>
            )}

            <div className="h-full w-full overflow-auto rounded-lg [&>*]:h-full [&>*]:w-full">
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
