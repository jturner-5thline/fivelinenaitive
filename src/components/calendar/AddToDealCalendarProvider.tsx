import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AddToDealCalendarDialog, type AddToDealCalendarPrefill } from './AddToDealCalendarDialog';
import { parseRelativeDate } from '@/lib/parseRelativeDate';

/**
 * Source context describing where the highlighted text came from.
 * Every surface that mounts <HighlightCalendarMenu> must supply one.
 */
export interface CalendarSourceCtx {
  module:
    | 'meeting_notes'
    | 'claap_summary'
    | 'rundown_item'
    | 'agenda'
    | 'report'
    | 'comment'
    | 'deal_memo'
    | 'other';
  /** Stable id of the source record (meeting id, claap recording id, comment id, etc.). */
  recordId: string;
  /** ISO timestamp of when the source was created — anchor for relative-date parsing. */
  sourceTimestamp: string;
  /** Preselect this deal when known. Pass null/undefined when the source has no linked deal. */
  dealId?: string | null;
  /** Optional deep link the user can follow back from the created calendar item. */
  deepLinkUrl?: string;
  /** Short human label for the source (shown in the preview block, e.g. "Worthy ↔ 5th Line Sync — Notes"). */
  label?: string;
}

interface ProviderApi {
  openFromSelection: (selectedText: string, ctx: CalendarSourceCtx) => void;
}

const Ctx = createContext<ProviderApi | null>(null);

export function useAddToDealCalendar(): ProviderApi {
  const c = useContext(Ctx);
  if (!c) {
    // No-op fallback so surfaces can mount HighlightCalendarMenu unconditionally
    // even on routes/test renders where the provider isn't mounted yet.
    return {
      openFromSelection: () => {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[AddToDealCalendar] Provider not mounted; ignoring selection.');
        }
      },
    };
  }
  return c;
}

function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  // First sentence (or first 90 chars) — keeps titles scannable.
  const m = clean.match(/^(.{1,90}?[.!?])(\s|$)/);
  if (m) return m[1].replace(/[.!?]$/, '').trim();
  return clean.length > 90 ? clean.slice(0, 87).trimEnd() + '…' : clean;
}

export function AddToDealCalendarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<AddToDealCalendarPrefill | null>(null);

  const openFromSelection = useCallback((selectedText: string, ctx: CalendarSourceCtx) => {
    const trimmed = selectedText.trim();
    if (!trimmed) return;
    const parsed = parseRelativeDate(trimmed, ctx.sourceTimestamp);
    setPrefill({
      sourceText: trimmed,
      title: deriveTitle(trimmed),
      parsed,
      ctx,
    });
    setOpen(true);
  }, []);

  const api = useMemo<ProviderApi>(() => ({ openFromSelection }), [openFromSelection]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <AddToDealCalendarDialog
        open={open}
        onOpenChange={(v) => setOpen(v)}
        prefill={prefill}
      />
    </Ctx.Provider>
  );
}
