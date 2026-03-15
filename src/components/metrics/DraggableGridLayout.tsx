import { ReactNode, useMemo } from 'react';
import ReactGridLayout from 'react-grid-layout';
const { Responsive, WidthProvider } = ReactGridLayout;
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { GridLayoutItem } from '@/hooks/useGridLayout';

const ResponsiveGridLayout = WidthProvider(Responsive);

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
  const layouts = useMemo(() => ({
    lg: layout,
    md: layout.map(l => ({ ...l, w: Math.min(l.w, 8) })),
    sm: layout.map(l => ({ ...l, w: Math.min(l.w, 4), x: 0 })),
  }), [layout]);

  return (
    <div className={cn('draggable-grid-wrapper', className)}>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 900, sm: 0 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={rowHeight}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={(currentLayout) => {
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
        margin={[16, 16]}
        containerPadding={[0, 0]}
        useCSSTransforms
      >
        {children}
      </ResponsiveGridLayout>
    </div>
  );
}
