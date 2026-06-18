import { useEffect, useState, useSyncExternalStore } from 'react';
import { useVisibilityAwareInterval } from "@/hooks/useVisibilityAwareInterval";
import {
  subscribeEmailPrefetchStatus,
  getEmailPrefetchStatus,
  type EmailPrefetchStatus,
} from './useFullEmailMessage';

/**
 * Subtle "Last synced X ago" indicator for the email thread list.
 *
 * Renders only when there is something useful to show:
 *   - background prefetches are still queued/in flight (spinner)
 *   - we've synced at least once and >1m has passed (relative timestamp)
 *   - the most recent fetch failed (subtle warning tone)
 *
 * Stays invisible while everything is fresh (<60s) and idle so it does
 * not add visual noise.
 */
function formatRelative(ts: number, now: number): string {
  const diffMs = Math.max(0, now - ts);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs === 1) return '1 hr ago';
  return `${hrs} hr ago`;
}

export function EmailSyncIndicator({ className }: { className?: string }) {
  const status: EmailPrefetchStatus = useSyncExternalStore(
    subscribeEmailPrefetchStatus,
    getEmailPrefetchStatus,
    getEmailPrefetchStatus,
  );

  // Tick once a minute so the relative timestamp updates without
  // re-rendering the whole list. Pauses while the tab is hidden.
  const [now, setNow] = useState(() => Date.now());
  useVisibilityAwareInterval(() => setNow(Date.now()), 60_000);

  const { pending, lastFetchAt, ok } = status;
  // Background body prefetches are intentionally hidden from the user:
  // the message list itself is already loaded from the inbox cache, and
  // surfacing a "Syncing N messages…" banner on every cold open felt
  // like the inbox was still loading when it wasn't. We still expose
  // sync issues + the relative last-synced timestamp below.
  const syncing = false;
  const ageMs = lastFetchAt ? now - lastFetchAt : null;

  // Body prefetch failures are best-effort and should never surface as an
  // inbox-level "sync issue" on first open. The message list/read state has
  // its own refresh path, so hide prefetch errors completely.
  if (!ok) return null;

  // Nothing useful to display.
  if (!syncing && (!lastFetchAt || (ok && (ageMs ?? 0) < 60_000))) {
    return null;
  }

  let label = '';
  if (!ok) {
    label = lastFetchAt
      ? `Sync issue · last synced ${formatRelative(lastFetchAt, now)}`
      : 'Unable to sync';
  } else if (lastFetchAt) {
    label = `Last synced ${formatRelative(lastFetchAt, now)}`;
  }

  const tone = !ok && !syncing ? 'text-warning' : 'text-muted-foreground';

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1 text-[11px] ${tone} ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="truncate">{label}</span>
    </div>
  );
}
