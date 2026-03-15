import { ReactNode, useMemo } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DraggableGridLayoutProps {
  layout: Layout[];
  onLayoutChange: (layout: Layout[]) => void;
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
          if (isEditMode) onLayoutChange(currentLayout);
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
