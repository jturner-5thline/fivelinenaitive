import { ReactNode, useMemo, useRef, useState, useEffect } from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { GridLayoutItem } from '@/hooks/useGridLayout';

interface DraggableGridLayoutProps {
  layout: GridLayoutItem[];
  onLayoutChange: (layout: GridLayoutItem[]) => void;
  isEditMode: boolean;
  children: ReactNode;
  rowHeight?: number;
  className?: string;
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
  const [RGL, setRGL] = useState<{ Responsive: any } | null>(null);

  useEffect(() => {
    import('react-grid-layout').then((mod) => {
      setRGL({ Responsive: mod.Responsive || (mod.default as any)?.Responsive });
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const layouts = useMemo(() => ({
    lg: layout,
    md: layout.map(l => ({ ...l, w: Math.min(l.w, 8) })),
    sm: layout.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 })),
  }), [layout]);

  if (!RGL?.Responsive) {
    return <div ref={containerRef} className={cn('draggable-grid-wrapper', className)}>{children}</div>;
  }

  const ResponsiveGrid = RGL.Responsive;

  return (
    <div ref={containerRef} className={cn('draggable-grid-wrapper', className)}>
      <ResponsiveGrid
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 900, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={rowHeight}
        width={containerWidth}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={(currentLayout: any[]) => {
          if (isEditMode) {
            const mapped: GridLayoutItem[] = currentLayout.map(l => ({
              i: l.i,
              x: l.x,
              y: l.y,
              w: l.w,
              h: l.h,
              minW: l.minW,
              minH: l.minH,
            }));
            onLayoutChange(mapped);
          }
        }}
        margin={[16, 16] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        useCSSTransforms
      >
        {children}
      </ResponsiveGrid>
    </div>
  );
}
