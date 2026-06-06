import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { CalendarPlus } from 'lucide-react';
import { useAddToDealCalendar, type CalendarSourceCtx } from './AddToDealCalendarProvider';
import { cn } from '@/lib/utils';

interface Props {
  sourceCtx: CalendarSourceCtx;
  children: ReactNode;
  className?: string;
  /** Render as a span instead of div (useful inline). */
  as?: 'div' | 'span';
  /**
   * When true, the wrapper does NOT install a right-click context menu
   * (which would otherwise hijack the browser/native context menu on
   * editable surfaces like Tiptap). The floating pill still appears when
   * the user actively selects text — clicks/edits pass through untouched.
   */
  editableMode?: boolean;
}

/**
 * Wrap any narrative text region. When the user highlights text inside
 * and either right-clicks or uses the floating pill, opens the
 * Add to Deal Calendar dialog prefilled from the selection.
 *
 * Surfaces still own their own text rendering — this is layout-neutral.
 */
export function HighlightCalendarMenu({ sourceCtx, children, className, as = 'div', editableMode = false }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const { openFromSelection } = useAddToDealCalendar();

  // Capture the current selection if it falls inside our region.
  const readSelection = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!ref.current || !ref.current.contains(range.commonAncestorContainer)) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    return { text, rect: range.getBoundingClientRect() };
  }, []);

  useEffect(() => {
    const onUp = () => {
      // Defer so the selection is finalized.
      setTimeout(() => setSelection(readSelection()), 0);
    };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keyup', onUp);
    };
  }, [readSelection]);

  const handleAdd = useCallback(() => {
    const current = selection?.text || readSelection()?.text || '';
    if (!current) return;
    openFromSelection(current, sourceCtx);
    setSelection(null);
    window.getSelection?.()?.removeAllRanges();
  }, [selection, readSelection, openFromSelection, sourceCtx]);

  const Trigger = as === 'span' ? 'span' : 'div';

  const pill = selection && typeof document !== 'undefined'
    ? createPortal(
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          style={{
            position: 'fixed',
            top: Math.max(8, selection.rect.top - 36),
            left: Math.min(
              window.innerWidth - 200,
              Math.max(8, selection.rect.left + selection.rect.width / 2 - 90),
            ),
            zIndex: 2147483600,
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-popover text-popover-foreground shadow-md text-xs hover:bg-accent"
        >
          <CalendarPlus className="h-3.5 w-3.5 text-primary" />
          Add to Deal Calendar
        </button>,
        document.body,
      )
    : null;

  if (editableMode) {
    return (
      <>
        <Trigger ref={ref as never} className={cn(className)}>
          {children}
        </Trigger>
        {pill}
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Trigger ref={ref as never} className={cn(className)}>
            {children}
          </Trigger>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              handleAdd();
            }}
            disabled={!readSelection()}
          >
            <CalendarPlus className="h-4 w-4 mr-2" />
            Add to Deal Calendar
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {pill}
    </>
  );
}
