import { useEffect } from 'react';
import { useInboxCacheStore } from '@/stores/inboxCacheStore';
import { useGmail } from '@/hooks/useGmail';
import { prefetchFullEmailMessage } from '@/components/deal/email/useFullEmailMessage';
import { preloadThreadWorkflowAnalysis } from '@/hooks/useThreadWorkflowAnalysis';
import { useDealsContext } from '@/contexts/DealsContext';
import { rankDealsForThread } from '@/lib/dealEvidenceMatcher';
import { useAuth } from '@/contexts/AuthContext';

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
const BODY_PREWARM_COUNT = 50;
const AI_ASSIST_PREWARM_COUNT = 8;

function prewarmBodies(messages: any[]) {
  if (!messages?.length) return;
  for (const m of messages.slice(0, BODY_PREWARM_COUNT)) {
    const id = m?.id || m?.gmail_message_id;
    if (id) prefetchFullEmailMessage(id);
  }
}

function prewarmAiAssist(messages: any[], deals: any[]) {
  if (!messages?.length) return;
  const run = async () => {
    for (const m of messages.slice(0, AI_ASSIST_PREWARM_COUNT)) {
      const messageId = m?.id || m?.gmail_message_id;
      if (!messageId) continue;
      const threadData = {
        subject: m?.subject || '(no subject)',
        threadId: messageId,
        latestEmail: {
          id: messageId,
          gmail_message_id: messageId,
          from_name: m?.from_name || m?.from_email || 'Unknown',
          from_email: m?.from_email || '',
          subject: m?.subject || '(no subject)',
          body_preview: m?.body_text || m?.body_html || m?.snippet || '',
          received_at: m?.received_at,
        },
        emails: [{
          id: messageId,
          gmail_message_id: messageId,
          from_name: m?.from_name || m?.from_email || 'Unknown',
          from_email: m?.from_email || '',
          subject: m?.subject || '(no subject)',
          body_preview: m?.body_text || m?.body_html || m?.snippet || '',
          received_at: m?.received_at,
        }],
      };
      const ranked = deals?.length
        ? rankDealsForThread(deals, {
            subject: threadData.subject,
            messages: [{
              subject: threadData.subject,
              fromEmail: m?.from_email,
              fromName: m?.from_name,
              toEmails: Array.isArray(m?.to_emails) ? m.to_emails : undefined,
              isLatest: true,
            }],
          })
        : null;
      const dealId = ranked?.best && ranked.best.confidence !== 'low' ? ranked.best.deal.id : null;
      await preloadThreadWorkflowAnalysis({ dealId, threadData, deals });
    }
  };
  const schedule = (window as any).requestIdleCallback
    ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 2500 })
    : (cb: () => void) => window.setTimeout(cb, 1200);
  schedule(() => void run());
}

export function useInboxPrefetch() {
  const { user, session, isLoading } = useAuth();
  const { status } = useGmail();
  const { deals } = useDealsContext();
  const prefetch = useInboxCacheStore((s) => s.prefetch);
  const refresh = useInboxCacheStore((s) => s.refresh);

  useEffect(() => {
    if (isLoading || !user || !session?.access_token || !status.connected) return;

    // Kick off the initial prefetch right away, then prewarm bodies.
    void prefetch().then(() => {
      const messages = useInboxCacheStore.getState().inboxMessages;
      prewarmBodies(messages);
      prewarmAiAssist(messages, deals || []);
    });

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh().then(() => {
        const messages = useInboxCacheStore.getState().inboxMessages;
        prewarmBodies(messages);
        prewarmAiAssist(messages, deals || []);
      });
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh().then(() => {
          const messages = useInboxCacheStore.getState().inboxMessages;
          prewarmBodies(messages);
          prewarmAiAssist(messages, deals || []);
        });
      }
    };
    const onFocus = () => {
      void refresh().then(() => {
        const messages = useInboxCacheStore.getState().inboxMessages;
        prewarmBodies(messages);
        prewarmAiAssist(messages, deals || []);
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [isLoading, user, session?.access_token, status.connected, prefetch, refresh, deals]);
}