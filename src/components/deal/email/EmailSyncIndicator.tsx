import { useEffect, useState, useSyncExternalStore } from 'react';
import { Loader2 } from 'lucide-react';
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
  const syncing = pending > 0;
  const ageMs = lastFetchAt ? now - lastFetchAt : null;

  // Nothing useful to display.
  if (!syncing && (!lastFetchAt || (ok && (ageMs ?? 0) < 60_000))) {
    return null;
  }

  let label = '';
  if (syncing) {
    label = pending === 1 ? 'Syncing 1 message…' : `Syncing ${pending} messages…`;
  } else if (!ok) {
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
      {syncing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </div>
  );
}