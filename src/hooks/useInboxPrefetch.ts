import { useEffect } from 'react';
import { useInboxCacheStore } from '@/stores/inboxCacheStore';
import { useGmail } from '@/hooks/useGmail';
import { prefetchFullEmailMessage } from '@/components/deal/email/useFullEmailMessage';

/**
 * Eagerly populate the inbox cache as soon as the Dashboard mounts and keep
 * it warm via a 2-minute poll. Mounting `<InboxDialog>` after this becomes a
 * pure render of cached data — no spinner, no blank state.
 *
 * Visibility-aware: skips polls while the tab is hidden so we don't burn
 * Gmail/Nylas quota in the background. Re-fires immediately on tab focus to
 * close the gap users notice when returning to the dashboard.
 */
// Poll cadence for new mail. 5 minutes left users staring at a stale inbox;
// 45s keeps the badge + dialog tight against the provider while still being
// gentle on Gmail/Nylas quota (visibility-aware below).
const POLL_INTERVAL_MS = 45 * 1000;
// How many top messages to warm full bodies for. Matches the inbox cache
// PAGE_SIZE so the inbox dialog opens with bodies already cached and
// the "Syncing N messages…" indicator never appears for cold opens.
const BODY_PREWARM_COUNT = 25;

function prewarmBodies(messages: any[]) {
  if (!messages?.length) return;
  for (const m of messages.slice(0, BODY_PREWARM_COUNT)) {
    const id = m?.id || m?.gmail_message_id;
    if (id) prefetchFullEmailMessage(id);
  }
}

export function useInboxPrefetch() {
  const { status } = useGmail();
  const prefetch = useInboxCacheStore((s) => s.prefetch);
  const refresh = useInboxCacheStore((s) => s.refresh);

  useEffect(() => {
    if (!status.connected) return;

    // Kick off the initial prefetch right away, then prewarm bodies.
    void prefetch().then(() => {
      prewarmBodies(useInboxCacheStore.getState().inboxMessages);
    });

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh().then(() => {
        prewarmBodies(useInboxCacheStore.getState().inboxMessages);
      });
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh().then(() => {
          prewarmBodies(useInboxCacheStore.getState().inboxMessages);
        });
      }
    };
    const onFocus = () => {
      void refresh().then(() => {
        prewarmBodies(useInboxCacheStore.getState().inboxMessages);
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [status.connected, prefetch, refresh]);
}