import { useEffect } from 'react';
import { useInboxCacheStore } from '@/stores/inboxCacheStore';
import { useGmail } from '@/hooks/useGmail';

/**
 * Eagerly populate the inbox cache as soon as the Dashboard mounts and keep
 * it warm via a 2-minute poll. Mounting `<InboxDialog>` after this becomes a
 * pure render of cached data — no spinner, no blank state.
 *
 * Visibility-aware: skips polls while the tab is hidden so we don't burn
 * Gmail/Nylas quota in the background. Re-fires immediately on tab focus to
 * close the gap users notice when returning to the dashboard.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useInboxPrefetch() {
  const { status } = useGmail();
  const prefetch = useInboxCacheStore((s) => s.prefetch);
  const refresh = useInboxCacheStore((s) => s.refresh);

  useEffect(() => {
    if (!status.connected) return;

    // Kick off the initial prefetch right away.
    prefetch();

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refresh();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refresh);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refresh);
    };
  }, [status.connected, prefetch, refresh]);
}