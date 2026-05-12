import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Allowlist of users whose finance edits are broadcast live to all other
 * viewers of the same company's finance experience. This is INTENTIONALLY
 * narrow: only Mark Kaleniecki and James Turner are privileged publishers.
 *
 * Every other authenticated user can still edit and persist changes
 * normally — their edits simply do NOT trigger the live broadcast pipeline.
 *
 * Match by stable user_id first; emails are kept as a safety fallback so a
 * future profile re-key wouldn't silently drop the privilege.
 */
const ALLOWLISTED_USER_IDS = new Set<string>([
  'e3e13611-b7b7-4d2d-b52b-141434219e09', // James Turner — jturner@5thline.co
  '4833ea2a-5a4b-455b-8fa8-77337982707a', // Mark Kaleniecki — mkaleniecki@5thline.co
]);

const ALLOWLISTED_EMAILS = new Set<string>([
  'jturner@5thline.co',
  'mkaleniecki@5thline.co',
]);

export type FinanceLiveResource =
  | 'scheduled'
  | 'cash_in'
  | 'sidebar'
  | 'daily';

export interface FinanceLiveHandlers {
  onScheduledChange?: () => void;
  onCashInChange?: () => void;
  onSidebarChange?: () => void;
  onDailyChange?: () => void;
}

export interface FinanceLiveSync {
  /** True iff the current user is in the allowlist. */
  isPrivilegedPublisher: boolean;
  /**
   * Emit a live-update event for `resource`. No-ops unless the current
   * user is in the allowlist AND the channel is connected. Safe to call
   * unconditionally from save paths.
   */
  broadcast: (resource: FinanceLiveResource) => void;
}

function shortName(email: string | null | undefined): string {
  if (!email) return 'a teammate';
  const local = email.split('@')[0];
  if (local === 'mkaleniecki') return 'Mark';
  if (local === 'jturner') return 'James';
  return local;
}

/**
 * Subscribe to allowlisted live finance edits scoped to a single company,
 * and expose a `broadcast` helper for the privileged publishers (Mark and
 * James) to emit edit events after a successful persist.
 *
 * Design notes:
 *  - Non-allowlisted users still subscribe (so they receive events from
 *    Mark/James) but their `broadcast` calls are no-ops.
 *  - Self-events are filtered both by `broadcast.self = false` AND by an
 *    explicit senderId check, to avoid the originator double-applying
 *    state from their own emit.
 *  - We do NOT subscribe to Postgres `postgres_changes` because not every
 *    finance table has an editor column we could trust; using a broadcast
 *    channel keeps the allowlist gating purely client-side at the
 *    publisher, which is also exactly the requested semantics.
 */
export function useFinanceLiveSync(
  companyId: string | undefined | null,
  handlers: FinanceLiveHandlers,
): FinanceLiveSync {
  const [me, setMe] = useState<{ id: string | null; email: string | null }>({
    id: null,
    email: null,
  });

  // Resolve current user once per mount. We pull email separately because
  // the JWT may not always contain it on auth.getUser() in all flows, and
  // the allowlist accepts either match.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setMe({
        id: data.user?.id ?? null,
        email: data.user?.email?.toLowerCase() ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPrivilegedPublisher = useMemo(() => {
    if (me.id && ALLOWLISTED_USER_IDS.has(me.id)) return true;
    if (me.email && ALLOWLISTED_EMAILS.has(me.email)) return true;
    return false;
  }, [me.id, me.email]);

  // Latest handlers ref so the effect doesn't re-subscribe on every render.
  const handlersRef = useRef<FinanceLiveHandlers>(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Debounce subtle "updated by Mark/James" toast so a burst of changes
  // (e.g. scheduled saveAll touching scheduled + daily) does not stack.
  const lastToastRef = useRef<{ at: number; sender: string }>({ at: 0, sender: '' });
  const maybeToast = useCallback((senderName: string) => {
    const now = Date.now();
    if (now - lastToastRef.current.at < 4000 && lastToastRef.current.sender === senderName) {
      return;
    }
    lastToastRef.current = { at: now, sender: senderName };
    toast(`${senderName} updated this view`, {
      duration: 2200,
      // Subtle, non-blocking — no action button, no destructive styling.
    });
  }, []);

  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase.channel(`finance:${companyId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on('broadcast', { event: 'finance_edit' }, ({ payload }) => {
      const senderId = payload?.senderId as string | undefined;
      const senderEmail = (payload?.senderEmail as string | undefined)?.toLowerCase();
      // Hard gate: only honor events from the allowlist (defense in depth
      // against any stray client emitting the same event).
      const senderAllowed =
        (senderId && ALLOWLISTED_USER_IDS.has(senderId)) ||
        (senderEmail && ALLOWLISTED_EMAILS.has(senderEmail));
      if (!senderAllowed) return;
      // Loop prevention: ignore our own emits even if {self:false} missed.
      if (senderId && me.id && senderId === me.id) return;

      const resource = payload?.resource as FinanceLiveResource | undefined;
      const h = handlersRef.current;
      switch (resource) {
        case 'scheduled':
          h.onScheduledChange?.();
          break;
        case 'cash_in':
          h.onCashInChange?.();
          break;
        case 'sidebar':
          h.onSidebarChange?.();
          break;
        case 'daily':
          h.onDailyChange?.();
          break;
        default:
          // Unknown resource — fan out to all to be safe.
          h.onScheduledChange?.();
          h.onCashInChange?.();
          h.onSidebarChange?.();
          h.onDailyChange?.();
      }

      maybeToast(shortName(senderEmail ?? null));
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [companyId, me.id, maybeToast]);

  const broadcast = useCallback(
    (resource: FinanceLiveResource) => {
      if (!isPrivilegedPublisher) return;
      const ch = channelRef.current;
      if (!ch) return;
      try {
        ch.send({
          type: 'broadcast',
          event: 'finance_edit',
          payload: {
            resource,
            senderId: me.id,
            senderEmail: me.email,
            at: Date.now(),
          },
        });
      } catch (err) {
        console.warn('[financeLiveSync] broadcast failed', err);
      }
    },
    [isPrivilegedPublisher, me.id, me.email],
  );

  return { isPrivilegedPublisher, broadcast };
}
