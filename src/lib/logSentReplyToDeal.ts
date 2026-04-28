import { supabase } from '@/integrations/supabase/client';

/**
 * Detect a clear "next step" the sender (us) is committing to in the
 * outbound reply body. Used to prompt the user with a follow-up task
 * suggestion after sending. Heuristic — covers the common phrasings used
 * in advisor → lender / advisor → borrower replies.
 */
export interface NextStepDetection {
  hasNextStep: boolean;
  /** Verbatim phrase that triggered the detection. */
  trigger: string | null;
  /** Suggested task title pre-filled from the phrase. */
  suggestedTaskTitle: string | null;
}

const NEXT_STEP_PATTERNS: Array<{ pattern: RegExp; verb: string }> = [
  { pattern: /\bI(?:'| wi)?ll\s+(send|share|forward|circulate|put together|pull together|prepare|draft|set up|schedule|book|confirm|follow up|circle back|get back to you|reach out|review|check)\b[^.\n]{0,120}/i, verb: 'follow up' },
  { pattern: /\bI(?:'| a)m\s+(sending|sharing|preparing|drafting|setting up|scheduling|booking|reviewing|checking|reaching out)\b[^.\n]{0,120}/i, verb: 'follow up' },
  { pattern: /\b(let me|allow me to)\s+(send|share|forward|prepare|draft|set up|schedule|book|confirm|check|review|circulate)\b[^.\n]{0,120}/i, verb: 'follow up' },
  { pattern: /\bwill\s+(send|share|forward|circulate|prepare|draft|set up|schedule|book|confirm|follow up|circle back|reach out)\b[^.\n]{0,120}/i, verb: 'follow up' },
  { pattern: /\b(getting|put(ting)?)\s+(this|that|it|the|a)\s+(out|together|to you|over)\b[^.\n]{0,120}/i, verb: 'send' },
  { pattern: /\b(by|before)\s+(end of day|EOD|end of week|EOW|tomorrow|monday|tuesday|wednesday|thursday|friday|next week|this week|cob|COB)\b[^.\n]{0,120}/i, verb: 'follow up' },
];

export function detectNextStep(body: string): NextStepDetection {
  const text = (body || '').replace(/\s+/g, ' ').trim();
  if (!text) return { hasNextStep: false, trigger: null, suggestedTaskTitle: null };
  for (const { pattern } of NEXT_STEP_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[0]) {
      const trigger = m[0].replace(/\s+/g, ' ').trim().slice(0, 160);
      // Convert "I'll send the diligence list tomorrow" → "Send the diligence list"
      const taskTitle = trigger
        .replace(/^(i(?:'| wi)?ll|i(?:'| a)m|let me|allow me to|will)\s+/i, '')
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/\b(by|before)\s+(end of day|eod|end of week|eow|tomorrow|monday|tuesday|wednesday|thursday|friday|next week|this week|cob)\b.*$/i, '')
        .trim();
      return {
        hasNextStep: true,
        trigger,
        suggestedTaskTitle: taskTitle.length > 8 ? taskTitle.slice(0, 120) : trigger.slice(0, 120),
      };
    }
  }
  return { hasNextStep: false, trigger: null, suggestedTaskTitle: null };
}

export interface SentReplyLogInput {
  dealId: string;
  threadId: string;
  subject: string;
  body: string;
  toName: string;
  toEmail: string;
  fromDisplayName?: string | null;
  /** Caller can pre-resolve to skip the lookup; otherwise we fetch by id. */
  dealName?: string | null;
}

export interface SentReplyLogResult {
  ok: boolean;
  dealName: string | null;
  /** Updated deal_lender id when the recipient matched a lender on the deal. */
  matchedLenderId: string | null;
  matchedLenderName: string | null;
  nextStep: NextStepDetection;
  error?: string;
}

/**
 * Post-send writeback for an outbound reply that was actually delivered to
 * the provider (Gmail/Outlook via Nylas):
 *   1. Inserts an `activity_logs` row with subject + body preview + recipient.
 *   2. Bumps `deal_lenders.last_contact_at` for the recipient if they
 *      match a lender on the deal (by email domain or contact email).
 *   3. Detects "next step" language and returns suggestion metadata so
 *      the caller can prompt for a follow-up task.
 *
 * Never throws — surfaces structured failure so the send pipeline keeps
 * working even if logging fails.
 */
export async function logSentReplyToDeal(input: SentReplyLogInput): Promise<SentReplyLogResult> {
  const result: SentReplyLogResult = {
    ok: false,
    dealName: input.dealName || null,
    matchedLenderId: null,
    matchedLenderName: null,
    nextStep: detectNextStep(input.body),
  };

  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || null;
    const senderName =
      input.fromDisplayName
      || authData?.user?.user_metadata?.display_name
      || authData?.user?.email
      || 'You';

    // Resolve deal name when not provided.
    let dealName = input.dealName || null;
    if (!dealName && input.dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('company')
        .eq('id', input.dealId)
        .maybeSingle();
      dealName = deal?.company || null;
    }
    result.dealName = dealName;

    const preview = (input.body || '').replace(/\s+/g, ' ').trim().slice(0, 150);
    const description = `Sent reply to ${input.toName || input.toEmail}: "${input.subject}" — ${preview}${(input.body || '').length > 150 ? '…' : ''}`;

    // 1) Activity log
    await supabase.from('activity_logs').insert({
      deal_id: input.dealId,
      activity_type: 'email_sent',
      description,
      user_id: userId,
      user_display_name: senderName,
      metadata: {
        source: 'naitive_email_reply',
        thread_id: input.threadId,
        subject: input.subject,
        to_name: input.toName,
        to_email: input.toEmail,
        body_preview: preview,
        body_length: (input.body || '').length,
        sent_at: new Date().toISOString(),
        next_step_detected: result.nextStep.hasNextStep,
        next_step_trigger: result.nextStep.trigger,
      },
    });

    // 2) Lender last-contact bump — match by recipient email or domain.
    const recipientEmail = (input.toEmail || '').trim().toLowerCase();
    const recipientDomain = recipientEmail.includes('@')
      ? recipientEmail.split('@').pop()
      : null;

    if (recipientEmail || recipientDomain) {
      // Pull deal lenders + their contacts so we can find the firm whose
      // contact list contains this recipient (preferred), falling back to
      // a domain match against master_lender records.
      const { data: lenders } = await supabase
        .from('deal_lenders')
        .select('id, name')
        .eq('deal_id', input.dealId);

      let matchedId: string | null = null;
      let matchedName: string | null = null;

      if (lenders && lenders.length > 0) {
        const ids = lenders.map((l) => l.id);
        // Try contact-email exact match first.
        if (recipientEmail) {
          const { data: contactRows } = await supabase
            .from('lender_contacts')
            .select('lender_id, email')
            .in('lender_id', ids)
            .ilike('email', recipientEmail)
            .limit(1);
          if (contactRows && contactRows.length > 0) {
            matchedId = contactRows[0].lender_id;
          }
        }
        // Fall back to domain match against deal_lenders.name (firm name)
        if (!matchedId && recipientDomain) {
          const domainCore = recipientDomain.replace(/\.[a-z]{2,}$/i, '');
          if (domainCore.length >= 3) {
            const fuzzy = lenders.find((l) =>
              (l.name || '').toLowerCase().includes(domainCore.toLowerCase()),
            );
            if (fuzzy) matchedId = fuzzy.id;
          }
        }
        if (matchedId) {
          const m = lenders.find((l) => l.id === matchedId);
          matchedName = m?.name || null;
          await supabase
            .from('deal_lenders')
            .update({ last_contact_at: new Date().toISOString() })
            .eq('id', matchedId);
        }
      }

      result.matchedLenderId = matchedId;
      result.matchedLenderName = matchedName;
    }

    result.ok = true;
    return result;
  } catch (e: any) {
    console.error('[logSentReplyToDeal] failed', e);
    return { ...result, ok: false, error: e?.message || 'Unknown error' };
  }
}