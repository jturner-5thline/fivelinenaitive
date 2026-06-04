import * as React from 'react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { useInsertAgendaFootnote } from './useInsertAgendaFootnote';
import type { FootnoteType, InsertFootnoteInput } from './types';

interface Props {
  /** Footnote type for this source item. */
  footnoteType: FootnoteType;
  /** Stable identifier for the underlying source record. */
  sourceType: string;
  sourceId?: string | null;
  sourceAnchor?: string | null;
  /** The text that should be frozen into the footnote at insertion time. */
  snapshotText: string;
  /** Optional deep-link URL back to the originating record. */
  linkUrl?: string | null;
  children: React.ReactNode;
}

/**
 * Reusable right-click menu for Decisions / Notes / Action Items shown
 * anywhere in the app. Wraps the source element and offers the three
 * "Add to Agenda" variants required by the structured footnote workflow.
 */
export function AgendaFootnoteContextMenu({
  footnoteType,
  sourceType,
  sourceId,
  sourceAnchor,
  snapshotText,
  linkUrl,
  children,
}: Props) {
  const insert = useInsertAgendaFootnote();

  const build = (): InsertFootnoteInput => ({
    footnoteType,
    sourceType,
    sourceId: sourceId ?? null,
    sourceAnchor: sourceAnchor ?? null,
    snapshotText,
    linkUrl: linkUrl ?? null,
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>
          {footnoteType === 'decision' ? 'Decision' :
           footnoteType === 'action_item' ? 'Action Item' : 'Note'}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void insert(build(), 'marker')}>
          Add to Agenda
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void insert(build(), 'freetext')}>
          Add to Agenda as Free Text
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void insert(build(), 'footnote_only')}>
          Add as Footnote Only
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}