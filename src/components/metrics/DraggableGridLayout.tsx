import { ReactNode, useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { cn } from '@/lib/utils';
import { GridLayoutItem } from '@/hooks/useGridLayout';

export interface WidgetConstraint {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  /** When false, item can be dragged/reordered but not resized. */
  isResizable?: boolean;
  /** When false, item is locked in place (no drag, no resize). */
  isDraggable?: boolean;
}

interface DraggableGridLayoutProps {
  layout: GridLayoutItem[];
  onLayoutChange: (layout: GridLayoutItem[], immediate?: boolean) => void;
  isEditMode: boolean;
  children: ReactNode;
  rowHeight?: number;
  className?: string;
  /** Per-widget constraints keyed by layout item id (`i`). */
  constraints?: Record<string, WidgetConstraint>;
  /** CSS selector for drag handles (defaults to .widget-drag-handle). */
  draggableHandle?: string;
  /** CSS selector for elements that should never trigger dragging. */
  draggableCancel?: string;
  /** Allows temporarily disabling drag without leaving edit mode. */
  isDraggableEnabled?: boolean;
  /** Allows temporarily disabling resize without leaving edit mode. */
  isResizableEnabled?: boolean;
  /** Called when a drag or resize interaction begins. */
  onInteractionStart?: () => void;
  /** Called when a drag or resize interaction ends or is cancelled. */
  onInteractionEnd?: () => void;
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
  constraints,
  draggableHandle = '.widget-drag-handle',
  draggableCancel,
  isDraggableEnabled,
  isResizableEnabled,
  onInteractionStart,
  onInteractionEnd,
}: DraggableGridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const latestLayoutRef = useRef<GridLayoutItem[]>(layout);
  // Suppresses click events fired immediately after a drag or resize,
  // so dragging/resizing a widget never triggers a drilldown or widget editor.
  const suppressClickUntilRef = useRef<number>(0);

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

  const applyConstraints = useCallback((items: GridLayoutItem[]) => {
    if (!constraints) return items;
    return items.map(l => {
      const c = constraints[l.i];
      if (!c) return l;
      const minW = Math.max(l.minW ?? 1, c.minW ?? 1);
      const minH = Math.max(l.minH ?? 1, c.minH ?? 1);
      const next: any = {
        ...l,
        minW,
        minH,
        maxW: c.maxW,
        maxH: c.maxH,
        // Enforce minimums on the item's own dimensions so saved layouts
        // can't violate them after a constraint change.
        w: Math.max(l.w, minW),
        h: Math.max(l.h, minH),
      };
      if (c.isResizable === false) next.isResizable = false;
      if (c.isDraggable === false) next.isDraggable = false;
      return next;
    });
  }, [constraints]);

  const layouts = useMemo(() => {
    const constrained = applyConstraints(layout);
    // Use a single breakpoint with a fixed 12-column grid so widgets keep
    // their assigned positions across all desktop/tablet widths. Widget
    // widths/heights scale with the container; positions never reflow.
    return {
      lg: constrained,
    };
  }, [layout, applyConstraints]);

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
    suppressClickUntilRef.current = Date.now() + 400;
    onLayoutChange(mapped, true); // immediate save
  }, [onLayoutChange]);

  const handleResizeStop = useCallback((_layout: any[], _oldItem: any, _newItem: any, _placeholder: any, _e: any, _element: any) => {
    const mapped = mapLayout(_layout);
    latestLayoutRef.current = mapped;
    suppressClickUntilRef.current = Date.now() + 400;
    onLayoutChange(mapped, true); // immediate save
  }, [onLayoutChange]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() < suppressClickUntilRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('draggable-grid-wrapper', className)}
      onClickCapture={handleClickCapture}
    >
      <Responsive
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 0 }}
        cols={{ lg: 12 }}
        rowHeight={rowHeight}
        width={containerWidth}
        isDraggable={isEditMode && (isDraggableEnabled ?? true)}
        isResizable={isEditMode && (isResizableEnabled ?? true)}
        draggableHandle={draggableHandle}
        draggableCancel={draggableCancel}
        onDragStart={onInteractionStart}
        onDragStop={(layout, oldItem, newItem, placeholder, e, element) => {
          onInteractionEnd?.();
          handleDragStop(layout, oldItem, newItem, placeholder, e, element);
        }}
        onResizeStart={onInteractionStart}
        onResizeStop={(layout, oldItem, newItem, placeholder, e, element) => {
          onInteractionEnd?.();
          handleResizeStop(layout, oldItem, newItem, placeholder, e, element);
        }}
        onLayoutChange={handleLayoutChange}
        margin={[16, 16] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        useCSSTransforms
      >
        {children}
      </Responsive>
    </div>
  );
}
