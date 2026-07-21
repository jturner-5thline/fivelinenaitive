import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  openManual: (init: { title: string; ctx: CalendarSourceCtx; sourceText?: string }) => void;
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
      openManual: () => {
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[AddToDealCalendar] Provider not mounted; ignoring openManual.');
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

  const openManual = useCallback(
    (init: { title: string; ctx: CalendarSourceCtx; sourceText?: string }) => {
      const text = (init.sourceText ?? init.title).trim();
      const parsed = parseRelativeDate(text || init.title, init.ctx.sourceTimestamp);
      setPrefill({
        sourceText: text || init.title,
        title: init.title,
        parsed,
        ctx: init.ctx,
      });
      setOpen(true);
    },
    [],
  );

  const api = useMemo<ProviderApi>(
    () => ({ openFromSelection, openManual }),
    [openFromSelection, openManual],
  );

  // Deal Admin Agent hand-off: approving a `create_followup_task` with a
  // `schedule_call:` bundle_key in the Approval Queue dispatches this
  // event so the calendar pop-up opens prefilled with the deal + lender.
  // The agent never books the meeting — the deal owner completes the
  // scheduling here.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | {
            dealId?: string | null;
            dealName?: string | null;
            lenderName?: string | null;
            contactEmails?: string[];
            title?: string;
            description?: string | null;
            sourceRecordId?: string;
          }
        | undefined;
      if (!detail?.dealId) return;
      const lender = detail.lenderName ?? 'lender';
      const deal = detail.dealName ?? 'deal';
      const title = detail.title || `Schedule call: ${lender} on ${deal}`;
      const sourceText = [
        detail.description || '',
        detail.contactEmails && detail.contactEmails.length > 0
          ? `Lender contact(s): ${detail.contactEmails.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      openManual({
        title,
        sourceText: sourceText || title,
        ctx: {
          module: 'other',
          recordId: detail.sourceRecordId || `schedule-call:${detail.dealId}`,
          sourceTimestamp: new Date().toISOString(),
          dealId: detail.dealId,
          label: `Schedule call — ${lender}`,
        },
      });
    };
    window.addEventListener('naitive:open-schedule-call', handler);
    return () => window.removeEventListener('naitive:open-schedule-call', handler);
  }, [openManual]);

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
