import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasAuthSession } from '@/lib/ai/requireSession';
import { useAuth } from '@/contexts/AuthContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { toast } from 'sonner';

export type PassConfidence = 'low' | 'medium' | 'high';
export type PassStatus = 'pending' | 'confirmed' | 'dismissed' | 'superseded';

export interface LenderPassDetection {
  id: string;
  deal_id: string;
  deal_lender_id: string | null;
  lender_name: string;
  gmail_message_id: string;
  sender_email: string | null;
  sender_name: string | null;
  confidence: PassConfidence;
  is_pass: boolean;
  reason_summary: string | null;
  source_quote: string | null;
  status: PassStatus;
  edited_reason: string | null;
  created_at: string;
}

interface UseLenderPassDetectionOptions {
  dealId?: string;
  threadData?: any;
  /** When true, runs the classifier on mount/when inputs change. */
  autoRun?: boolean;
}

/**
 * useLenderPassDetection
 * ----------------------
 * Runs Claude-backed lender pass classification on the latest inbound email
 * in a deal-linked thread, persists the result, and exposes confirm/dismiss
 * actions that update the lender's stage to "passed" with reason + audit.
 */
export function useLenderPassDetection({
  dealId,
  threadData,
  autoRun = true,
}: UseLenderPassDetectionOptions) {
  const { user } = useAuth();
  const { updateLender, refreshDeals } = useDealsContext();
  const [detection, setDetection] = useState<LenderPassDetection | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [autoCommit, setAutoCommit] = useState(false);
  const lastClassifiedKey = useRef<string | null>(null);

  // Identify the latest inbound message id (from a non-"You" sender).
  const latestInbound = threadData?.emails?.find?.((e: any) => e.from_name !== 'You') || threadData?.latestEmail;
  const messageId: string | undefined = latestInbound?.gmail_message_id || latestInbound?.id;

  // Load user preference once.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_email_ai_preferences')
        .select('auto_commit_high_confidence_pass')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setAutoCommit(!!data.auto_commit_high_confidence_pass);
    })();
  }, [user]);

  // Load any existing detection for this message+deal.
  const loadExisting = useCallback(async () => {
    if (!dealId || !messageId) return null;
    const { data } = await supabase
      .from('lender_pass_detections')
      .select('*')
      .eq('deal_id', dealId)
      .eq('gmail_message_id', messageId)
      .maybeSingle();
    if (data) setDetection(data as LenderPassDetection);
    return data as LenderPassDetection | null;
  }, [dealId, messageId]);

  // Run the classifier (will upsert in the edge function).
  const runClassifier = useCallback(async () => {
    if (!dealId || !messageId || !threadData || !latestInbound) return;
    if (!(await hasAuthSession())) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('smart-email-ai', {
        body: {
          action: 'detect_lender_pass',
          dealId,
          emailData: {
            gmail_message_id: messageId,
            id: messageId,
            from_name: latestInbound.from_name,
            from_email: latestInbound.from_email,
            subject: latestInbound.subject,
            body_preview: latestInbound.body_preview,
            received_at: latestInbound.received_at,
          },
          threadData: {
            subject: threadData.subject,
            threadId: threadData.threadId,
            latestEmail: latestInbound,
            emails: threadData.emails?.slice(0, 5) || [],
          },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Re-load from db to get the row id and any server-side merges.
      const fresh = await loadExisting();
      return fresh;
    } catch (err: any) {
      console.warn('[useLenderPassDetection] classifier error:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [dealId, messageId, threadData, latestInbound, loadExisting]);

  // On mount / inputs change: load existing, then auto-run if needed.
  useEffect(() => {
    if (!dealId || !messageId) {
      setDetection(null);
      return;
    }
    const key = `${dealId}::${messageId}`;
    (async () => {
      const existing = await loadExisting();
      if (existing) return;
      if (!autoRun) return;
      if (lastClassifiedKey.current === key) return;
      lastClassifiedKey.current = key;
      await runClassifier();
    })();
  }, [dealId, messageId, autoRun, loadExisting, runClassifier]);

  // Confirm: commit lender stage = 'passed' + log audit.
  const confirmPass = useCallback(async (reasonOverride?: string) => {
    if (!detection || !detection.deal_lender_id || !user) {
      toast.error('Cannot confirm — lender could not be matched.');
      return false;
    }
    setCommitting(true);
    try {
      const reason = reasonOverride ?? detection.reason_summary ?? 'AI-detected pass';

      // Update the deal_lender row.
      await updateLender(detection.deal_lender_id, {
        stage: 'passed',
        trackingStatus: 'passed',
        passReason: reason,
      } as any);

      // Mark detection as confirmed.
      const { error: updErr } = await supabase
        .from('lender_pass_detections')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: user.id,
          edited_reason: reasonOverride ?? null,
        })
        .eq('id', detection.id);
      if (updErr) throw updErr;

      // Activity log.
      await supabase.from('activity_logs').insert({
        deal_id: detection.deal_id,
        activity_type: 'lender_update',
        description: `${detection.lender_name} marked Passed based on email from ${detection.sender_name || detection.sender_email || 'lender'}.`,
        user_id: user.id,
        metadata: {
          source: 'ai_pass_detection',
          detection_id: detection.id,
          gmail_message_id: detection.gmail_message_id,
          confidence: detection.confidence,
          reason,
          source_quote: detection.source_quote,
        },
      });

      toast.success(`${detection.lender_name} marked Passed`);
      setDetection({ ...detection, status: 'confirmed', edited_reason: reasonOverride ?? null });
      await refreshDeals();
      return true;
    } catch (err: any) {
      console.error('confirmPass error:', err);
      toast.error(err?.message || 'Failed to update lender status');
      return false;
    } finally {
      setCommitting(false);
    }
  }, [detection, user, updateLender, refreshDeals]);

  const dismissPass = useCallback(async () => {
    if (!detection || !user) return false;
    try {
      await supabase
        .from('lender_pass_detections')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
          dismissed_by: user.id,
        })
        .eq('id', detection.id);
      setDetection({ ...detection, status: 'dismissed' });
      return true;
    } catch (err: any) {
      console.error('dismissPass error:', err);
      return false;
    }
  }, [detection, user]);

  const setAutoCommitPref = useCallback(async (next: boolean) => {
    if (!user) return;
    setAutoCommit(next);
    await supabase
      .from('user_email_ai_preferences')
      .upsert({ user_id: user.id, auto_commit_high_confidence_pass: next }, { onConflict: 'user_id' });
  }, [user]);

  // Auto-commit high-confidence passes if user opted in (only for fresh, pending, matched detections).
  const autoCommittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detection) return;
    if (!autoCommit) return;
    if (detection.status !== 'pending') return;
    if (!detection.is_pass) return;
    if (detection.confidence !== 'high') return;
    if (!detection.deal_lender_id) return;
    if (autoCommittedRef.current === detection.id) return;
    autoCommittedRef.current = detection.id;
    confirmPass();
  }, [detection, autoCommit, confirmPass]);

  return {
    detection,
    loading,
    committing,
    autoCommit,
    setAutoCommitPref,
    runClassifier,
    confirmPass,
    dismissPass,
    /** True if there's an actionable pending pass to surface to the user. */
    hasPendingPass: !!detection && detection.status === 'pending' && detection.is_pass,
  };
}
