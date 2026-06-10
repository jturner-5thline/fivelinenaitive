import { ReactNode, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface EditableDashboardWrapperProps {
  isEditMode: boolean;
  onCardEdit: (cardTitle: string) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps any dashboard and makes ALL nested Card elements clickable.
 * Uses event delegation — no changes needed inside dashboard components.
 *
 * How it works:
 * 1. On click, walks up the DOM to find the nearest card-like element (role="article" or [data-slot="card"]).
 * 2. Extracts a title from the first heading-like child.
 * 3. Calls onCardEdit with that title so the widget editor opens.
 *
 * Styling:
 * - Adds a hover ring + pointer cursor to every card via CSS descendant selectors.
 * - In edit mode, shows a dashed ring on all cards.
 */
export function EditableDashboardWrapper({
  isEditMode,
  onCardEdit,
  children,
  className,
}: EditableDashboardWrapperProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Only treat clicks as widget-edit affordances when the user has
      // explicitly entered layout edit mode via the header pencil button.
      // Outside edit mode, normal chart/tile interactions (drilldowns,
      // tooltips, links) must pass through untouched.
      if (!isEditMode) return;
      // Walk up from the click target to find the nearest Card element
      let el = e.target as HTMLElement | null;
      let cardEl: HTMLElement | null = null;

      while (el && el !== e.currentTarget) {
        // shadcn Card uses data-slot="card" or role can vary; check common patterns
        if (
          el.getAttribute('data-slot') === 'card' ||
          el.classList.contains('rounded-xl') && el.classList.contains('border')
        ) {
          cardEl = el;
          break;
        }
        el = el.parentElement;
      }

      if (!cardEl) return;

      // Extract the title from the card
      const titleEl =
        cardEl.querySelector('[data-slot="card-title"]') ||
        cardEl.querySelector('.text-sm.font-medium') ||
        cardEl.querySelector('.font-bold') ||
        cardEl.querySelector('.font-semibold') ||
        cardEl.querySelector('p');

      const title = titleEl?.textContent?.trim() || 'Untitled Widget';
      onCardEdit(title);
    },
    [onCardEdit, isEditMode]
  );

  return (
    <div
      className={cn(
        'editable-dashboard-wrapper',
        isEditMode && 'editable-dashboard-edit-mode',
        className
      )}
      onClick={handleClick}
    >
      <style>{`
        /* Hover/click affordances only appear while the user is in
           layout edit mode. Outside edit mode the wrapper is inert so
           charts, drilldowns and tables behave normally. */
        .editable-dashboard-edit-mode [data-slot="card"] {
          cursor: pointer;
          transition: box-shadow 0.2s, ring 0.2s;
          position: relative;
          outline: 1px dashed hsl(var(--muted-foreground) / 0.3);
          outline-offset: -1px;
        }
        .editable-dashboard-edit-mode [data-slot="card"]:hover {
          box-shadow: 0 0 0 1px hsl(var(--primary) / 0.4);
          outline-color: hsl(var(--primary) / 0.5);
        }
      `}</style>
      {children}
    </div>
  );
}
