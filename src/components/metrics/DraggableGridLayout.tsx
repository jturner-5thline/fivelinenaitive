import { ReactNode, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { GridLayoutItem } from '@/hooks/useGridLayout';

interface DraggableGridLayoutProps {
  layout: GridLayoutItem[];
  onLayoutChange: (layout: GridLayoutItem[], immediate?: boolean) => void;
  isEditMode: boolean;
  children: ReactNode;
  rowHeight?: number;
  className?: string;
}

function mapLayout(currentLayout: any[]): GridLayoutItem[] {
  return currentLayout.map(l => ({
    i: l.i,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    minW: l.minW,
    minH: l.minH,
  }));
}

export function DraggableGridLayout({
  layout,
  onLayoutChange,
  isEditMode,
  children,
  rowHeight = 150,
  className,
}: DraggableGridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const latestLayoutRef = useRef<GridLayoutItem[]>(layout);

  useEffect(() => {
    if (!containerRef.current) return;
    setContainerWidth(containerRef.current.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Flush any pending layout when exiting edit mode
  const prevEditMode = useRef(isEditMode);
  useEffect(() => {
    if (prevEditMode.current && !isEditMode) {
      // Was in edit mode, now leaving — flush immediately
      onLayoutChange(latestLayoutRef.current, true);
    }
    prevEditMode.current = isEditMode;
  }, [isEditMode, onLayoutChange]);

  const layouts = useMemo(() => ({
    lg: layout,
    md: layout.map(l => ({ ...l, w: Math.min(l.w, 8) })),
    sm: layout.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 })),
  }), [layout]);

  const handleLayoutChange = useCallback((currentLayout: any[]) => {
    if (isEditMode) {
      const mapped = mapLayout(currentLayout);
      latestLayoutRef.current = mapped;
      onLayoutChange(mapped); // debounced backup save
    }
  }, [isEditMode, onLayoutChange]);

  const handleDragStop = useCallback((_layout: any[], _oldItem: any, _newItem: any, _placeholder: any, _e: any, _element: any) => {
    const mapped = mapLayout(_layout);
    latestLayoutRef.current = mapped;
    onLayoutChange(mapped, true); // immediate save
  }, [onLayoutChange]);

  const handleResizeStop = useCallback((_layout: any[], _oldItem: any, _newItem: any, _placeholder: any, _e: any, _element: any) => {
    const mapped = mapLayout(_layout);
    latestLayoutRef.current = mapped;
    onLayoutChange(mapped, true); // immediate save
  }, [onLayoutChange]);

  return (
    <div ref={containerRef} className={cn('draggable-grid-wrapper', className)}>
      <Responsive
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 900, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={rowHeight}
        width={containerWidth}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        onDragStop={handleDragStop}
        onResizeStop={handleResizeStop}
        margin={[16, 16] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        useCSSTransforms
      >
        {children}
      </Responsive>
    </div>
  );
}
