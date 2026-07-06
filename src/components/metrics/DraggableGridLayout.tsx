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
  /** Exposes the last layout known by react-grid-layout to the parent. */
  onLatestLayoutRef?: (getLayout: () => GridLayoutItem[]) => void;
  /**
   * Controls react-grid-layout's auto-compaction.
   * Default 'vertical' preserves legacy behavior; pass `null` to keep widgets
   * locked at their saved x/y coordinates with no automatic reflow.
   */
  compactType?: 'vertical' | 'horizontal' | null;
  /** When true, prevents items from swapping/displacing each other. */
  preventCollision?: boolean;
  /** When false, drag/resize completion queues the save instead of immediate save. */
  saveImmediatelyOnInteractionEnd?: boolean;
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
    maxW: l.maxW,
    maxH: l.maxH,
  }));
}

function layoutSignature(items: GridLayoutItem[]): string {
  return JSON.stringify(items.map(item => ({ i: item.i, x: item.x, y: item.y, w: item.w, h: item.h })));
}

function readTranslate(style: CSSStyleDeclaration): { left: number; top: number } {
  const transform = style.transform;
  if (transform && transform !== 'none') {
    const matrix = transform.match(/^matrix\(([^)]+)\)$/);
    if (matrix) {
      const parts = matrix[1].split(',').map(v => Number(v.trim()));
      if (parts.length >= 6) return { left: parts[4] || 0, top: parts[5] || 0 };
    }
    const translate = transform.match(/translate(?:3d)?\(([-\d.]+)px,\s*([-\d.]+)px/);
    if (translate) return { left: Number(translate[1]) || 0, top: Number(translate[2]) || 0 };
  }
  return { left: parseFloat(style.left || '0') || 0, top: parseFloat(style.top || '0') || 0 };
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
  onLatestLayoutRef,
  compactType = 'vertical',
  preventCollision = false,
  saveImmediatelyOnInteractionEnd = true,
}: DraggableGridLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const latestLayoutRef = useRef<GridLayoutItem[]>(layout);
  // Suppresses click events fired immediately after a drag or resize,
  // so dragging/resizing a widget never triggers a drilldown or widget editor.
  const suppressClickUntilRef = useRef<number>(0);
  const isPointerInteractingRef = useRef(false);

  useEffect(() => {
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    onLatestLayoutRef?.(() => latestLayoutRef.current.map(item => ({ ...item })));
    return () => onLatestLayoutRef?.(() => latestLayoutRef.current.map(item => ({ ...item })));
  }, [onLatestLayoutRef]);

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

  const readRenderedLayout = useCallback((): GridLayoutItem[] | null => {
    const container = containerRef.current;
    if (!container) return null;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('.react-grid-item:not(.react-grid-placeholder)'));
    if (!nodes.length) return null;
    const base = latestLayoutRef.current;
    const marginX = 16;
    const marginY = 16;
    const cols = 12;
    const colWidth = (containerWidth - marginX * (cols - 1)) / cols;
    if (!Number.isFinite(colWidth) || colWidth <= 0) return null;

    return base.map((item, index) => {
      const node = nodes.find(el => el.dataset.gridItemId === item.i) ?? nodes[index];
      if (!node) return { ...item };
      const style = window.getComputedStyle(node);
      const { left, top } = readTranslate(style);
      const width = parseFloat(style.width || '0') || node.offsetWidth;
      const height = parseFloat(style.height || '0') || node.offsetHeight;
      const x = Math.max(0, Math.min(cols - 1, Math.round(left / (colWidth + marginX))));
      const y = Math.max(0, Math.round(top / (rowHeight + marginY)));
      const w = Math.max(item.minW ?? 1, Math.min(cols - x, Math.round((width + marginX) / (colWidth + marginX))));
      const h = Math.max(item.minH ?? 1, Math.round((height + marginY) / (rowHeight + marginY)));
      return { ...item, x, y, w, h };
    });
  }, [containerWidth, rowHeight]);

  const flushRenderedLayout = useCallback((immediate = true) => {
    if (!isEditMode) return;
    const rendered = readRenderedLayout();
    if (!rendered) return;
    const mapped = mapLayout(rendered);
    if (layoutSignature(mapped) === layoutSignature(latestLayoutRef.current)) return;
    latestLayoutRef.current = mapped;
    onLayoutChange(mapped, immediate);
  }, [isEditMode, onLayoutChange, readRenderedLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isEditMode) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFlush = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => flushRenderedLayout(false), 120);
    };

    const mutationObserver = new MutationObserver(scheduleFlush);
    mutationObserver.observe(container, {
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const resizeObserver = new ResizeObserver(scheduleFlush);
    container.querySelectorAll<HTMLElement>('.react-grid-item').forEach(node => resizeObserver.observe(node));

    return () => {
      if (timer) clearTimeout(timer);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      flushRenderedLayout(true);
    };
  }, [flushRenderedLayout, isEditMode]);

  useEffect(() => {
    if (!isEditMode) return;
    const finish = () => {
      if (!isPointerInteractingRef.current) return;
      isPointerInteractingRef.current = false;
      flushRenderedLayout(saveImmediatelyOnInteractionEnd);
      onInteractionEnd?.();
    };
    window.addEventListener('mouseup', finish, true);
    window.addEventListener('touchend', finish, true);
    window.addEventListener('touchcancel', finish, true);
    return () => {
      finish();
      window.removeEventListener('mouseup', finish, true);
      window.removeEventListener('touchend', finish, true);
      window.removeEventListener('touchcancel', finish, true);
    };
  }, [flushRenderedLayout, isEditMode, onInteractionEnd, saveImmediatelyOnInteractionEnd]);

  useEffect(() => {
    return () => flushRenderedLayout(true);
  }, [flushRenderedLayout]);

  const layouts = useMemo(() => {
    const constrained = applyConstraints(layout);
    // Use a single breakpoint with a fixed 12-column grid so widgets keep
    // their assigned positions across all desktop/tablet widths. Widget
    // widths/heights scale with the container; positions never reflow.
    return {
      lg: constrained,
      md: constrained.map(item => ({ ...item })),
      sm: constrained.map(item => ({ ...item })),
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
    // Defensive guard: react-grid-layout should already block drags when
    // isDraggable is false, but never persist a layout mutation unless the
    // user has explicitly entered edit mode via the header pencil button.
    if (!isEditMode) return;
    const mapped = mapLayout(_layout);
    latestLayoutRef.current = mapped;
    suppressClickUntilRef.current = Date.now() + 400;
    onLayoutChange(mapped, saveImmediatelyOnInteractionEnd);
  }, [onLayoutChange, isEditMode, saveImmediatelyOnInteractionEnd]);

  const handleResizeStop = useCallback((_layout: any[], _oldItem: any, _newItem: any, _placeholder: any, _e: any, _element: any) => {
    if (!isEditMode) return;
    const mapped = mapLayout(_layout);
    latestLayoutRef.current = mapped;
    suppressClickUntilRef.current = Date.now() + 400;
    onLayoutChange(mapped, saveImmediatelyOnInteractionEnd);
  }, [onLayoutChange, isEditMode, saveImmediatelyOnInteractionEnd]);

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (Date.now() < suppressClickUntilRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  const matchesInteractionSelector = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    const selectors = [draggableHandle, '.react-resizable-handle'].filter(Boolean).join(', ');
    return selectors.length > 0 && !!target.closest(selectors);
  }, [draggableHandle]);

  return (
    <div
      ref={containerRef}
      className={cn('draggable-grid-wrapper', className)}
      onClickCapture={handleClickCapture}
      onMouseDownCapture={(e) => {
        if (matchesInteractionSelector(e.target)) {
          isPointerInteractingRef.current = true;
          onInteractionStart?.();
        }
      }}
      onTouchStartCapture={(e) => {
        if (matchesInteractionSelector(e.target)) {
          isPointerInteractingRef.current = true;
          onInteractionStart?.();
        }
      }}
      onMouseUpCapture={() => {
        flushRenderedLayout(saveImmediatelyOnInteractionEnd);
        onInteractionEnd?.();
      }}
      onTouchEndCapture={() => {
        flushRenderedLayout(saveImmediatelyOnInteractionEnd);
        onInteractionEnd?.();
      }}
      onTouchCancelCapture={() => {
        flushRenderedLayout(saveImmediatelyOnInteractionEnd);
        onInteractionEnd?.();
      }}
    >
      <Responsive
        className="layout"
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 768, sm: 0 }}
        cols={{ lg: 12, md: 12, sm: 12 }}
        rowHeight={rowHeight}
        width={containerWidth}
        isDraggable={isEditMode && (isDraggableEnabled ?? true)}
        isResizable={isEditMode && (isResizableEnabled ?? true)}
        draggableHandle={draggableHandle}
        draggableCancel={draggableCancel}
        onDragStop={(layout, oldItem, newItem, placeholder, e, element) => {
          onInteractionEnd?.();
          handleDragStop(layout, oldItem, newItem, placeholder, e, element);
        }}
        onResizeStop={(layout, oldItem, newItem, placeholder, e, element) => {
          onInteractionEnd?.();
          handleResizeStop(layout, oldItem, newItem, placeholder, e, element);
        }}
        onLayoutChange={handleLayoutChange}
        margin={[16, 16] as [number, number]}
        containerPadding={[0, 0] as [number, number]}
        useCSSTransforms
        {...({ compactType, preventCollision } as any)}
      >
        {children}
      </Responsive>
    </div>
  );
}
