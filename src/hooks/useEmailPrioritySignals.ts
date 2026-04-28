import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserNotificationPreferences } from './useUserNotificationPreferences';
import {
  detectPrioritySignals,
  DEFAULT_ENABLED_SIGNALS,
  type DetectedSignal,
  type EmailPrioritySignalType,
} from '@/lib/emailPrioritySignals';
import type { MockEmail } from '@/components/deal/email/mockEmailData';

const TRIGGER_KEY = 'email_priority_signal';

export interface PriorityFlag {
  messageId: string;
  signal: DetectedSignal;
}

/**
 * Read which signal types the current user wants to be notified about.
 * Stored in `user_notification_preferences.custom_recipients.signal_types`
 * (the same JSONB column used elsewhere for per-trigger custom config).
 */
function readEnabledSignalTypes(prefRow: any): Set<EmailPrioritySignalType> {
  const fromCfg =
    prefRow?.custom_recipients?.signal_types as EmailPrioritySignalType[] | undefined;
  const list = Array.isArray(fromCfg) && fromCfg.length > 0 ? fromCfg : DEFAULT_ENABLED_SIGNALS;
  return new Set(list);
}

/**
 * useEmailPrioritySignals
 * ------------------------
 * Given a flat list of inbox emails, detects high-priority deal signals,
 * fires a single in-app + Slack notification per (message, signal) pair via
 * the existing notification-engine, and exposes a `flagsByThread` map the
 * email list row uses to render the priority flag icon.
 *
 * Dedupe is enforced by the unique index on
 * `email_priority_signal_log(message_id, signal_type)` — if INSERT fails
 * with 23505, we know another tab/session already notified.
 */
export function useEmailPrioritySignals(emails: MockEmail[] | undefined) {
  const { user } = useAuth();
  const { data: userPrefs } = useUserNotificationPreferences();
  const [flagsByThread, setFlagsByThread] = useState<Record<string, DetectedSignal>>({});
  // In-process guard so a single render burst doesn't double-fire before the
  // DB unique constraint kicks in.
  const inFlight = useRef<Set<string>>(new Set());

  const enabledTypes = useMemo(() => {
    const pref = (userPrefs || []).find((p) => p.trigger_key === TRIGGER_KEY);
    // Trigger fully disabled? Skip detection entirely.
    if (pref && pref.is_enabled === false) return new Set<EmailPrioritySignalType>();
    return readEnabledSignalTypes(pref);
  }, [userPrefs]);

  useEffect(() => {
    if (!user || !emails || emails.length === 0) return;
    if (enabledTypes.size === 0) return;

    const nextFlags: Record<string, DetectedSignal> = {};
    const toNotify: Array<{ email: MockEmail; signal: DetectedSignal }> = [];

    for (const email of emails) {
      // Inbound only. Skip our own sent/draft items.
      if (email.folder !== 'inbox') continue;
      if (!email.id || email.id.startsWith('mock-')) {
        // Still allow flagging mocks visually for demo, but don't notify.
      }
      const detected = detectPrioritySignals({
        subject: email.subject,
        body: email.body_text || email.body_preview || email.snippet,
      }).filter((s) => enabledTypes.has(s.type));
      if (detected.length === 0) continue;

      const top = detected[0];
      nextFlags[email.threadId] = top;

      // Only notify for real provider messages — never for the mock seed data.
      if (email.id && !email.id.startsWith('mock-')) {
        toNotify.push({ email, signal: top });
      }
    }

    setFlagsByThread((prev) => {
      // Merge so flags computed for previously-seen messages don't disappear
      // when the email list shrinks (e.g. folder switch).
      return { ...prev, ...nextFlags };
    });

    // Fire notifications (best-effort, fire-and-forget per item).
    void dispatchNotifications(toNotify, inFlight, user.id);
  }, [emails, enabledTypes, user]);

  return { flagsByThread };
}

async function dispatchNotifications(
  items: Array<{ email: MockEmail; signal: DetectedSignal }>,
  inFlight: { current: Set<string> },
  userId: string
) {
  for (const { email, signal } of items) {
    const key = `${email.id}::${signal.type}`;
    if (inFlight.current.has(key)) continue;
    inFlight.current.add(key);

    // Resolve deal_id from deal_emails join when possible.
    let dealId: string | null = null;
    let dealName: string | null = email.deal_name || null;
    try {
      const { data: link } = await supabase
        .from('deal_emails')
        .select('deal_id, deals(id, name)')
        .eq('gmail_message_id', email.id)
        .maybeSingle();
      if (link?.deal_id) {
        dealId = link.deal_id as string;
        dealName = (link as any).deals?.name || dealName;
      }
    } catch {
      /* ignore — notification can still fire without a deal link */
    }

    // Claim the (message, signal) pair. Unique index (message_id, signal_type)
    // makes this idempotent across tabs/users.
    const { error: claimError } = await supabase
      .from('email_priority_signal_log')
      .insert({
        message_id: email.id,
        signal_type: signal.type,
        deal_id: dealId,
        lender_name: email.from_name,
        detected_by: userId,
      });
    // 23505 = unique violation → already notified by another session.
    if (claimError && (claimError as any).code !== '23505') {
      // eslint-disable-next-line no-console
      console.warn('[email-priority-signal] claim failed', claimError);
      inFlight.current.delete(key);
      continue;
    }
    if (claimError) {
      // Already claimed elsewhere — nothing more to do.
      continue;
    }

    const dealUrl = dealId
      ? `${window.location.origin}/deals/${dealId}`
      : `${window.location.origin}/notifications`;

    try {
      await supabase.functions.invoke('notification-engine', {
        body: {
          triggerKey: TRIGGER_KEY,
          actorUserId: userId,
          context: {
            deal_id: dealId,
            deal_name: dealName || 'Unlinked deal',
            lender_name: email.from_name,
            lender_email: email.from_email,
            signal_type: signal.type,
            signal_label: signal.label,
            quote: signal.quote,
            message_id: email.id,
            deal_url: dealUrl,
          },
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[email-priority-signal] notification-engine invoke failed', err);
    }
  }
}
