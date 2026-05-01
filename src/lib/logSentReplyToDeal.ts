import { supabase } from '@/integrations/supabase/client';

/**
 * Detect a clear "next step" the sender (us) is committing to in the
 * outbound reply body. Used to prompt the user with a follow-up task
 * suggestion after sending. Heuristic — covers the common phrasings used
 * in advisor → lender / advisor → borrower replies.
 */
/**
 * Coarse intent buckets for the next-step phrase. These power the
 * follow-up task title prefix and the `next_step_intent` field stored on
 * the activity log so reporting can group sent replies by the kind of
 * commitment the sender made (meeting, doc follow-up, approval, etc).
 */
export type NextStepIntent =
  | 'meeting_request'
  | 'schedule_call'
  | 'document_followup'
  | 'approval_request'
  | 'info_request'
  | 'review_commitment'
  | 'follow_up'
  | 'unknown';

const INTENT_LABELS: Record<NextStepIntent, string> = {
  meeting_request: 'Meeting request',
  schedule_call: 'Schedule call',
  document_followup: 'Document follow-up',
  approval_request: 'Approval request',
  info_request: 'Info request',
  review_commitment: 'Review commitment',
  follow_up: 'Follow-up',
  unknown: 'Follow-up',
};

/**
 * Ordered intent rules — first match wins. Each rule scans the matched
 * trigger phrase (and falls back to the wider body) for verbs/nouns
 * specific to that intent.
 */
const INTENT_RULES: Array<{ intent: NextStepIntent; pattern: RegExp }> = [
  { intent: 'meeting_request',    pattern: /\b(meet(ing)?|sit\s*down|catch\s*up|coffee|zoom|teams|google\s*meet|in[-\s]?person)\b/i },
  { intent: 'schedule_call',      pattern: /\b(schedule|set\s*up|book|pencil\s*in|calendar|invite)\b[^.\n]{0,40}\b(call|chat|sync|conversation|discussion)\b|\bjump\s+on\s+a\s+(call|chat)\b/i },
  { intent: 'document_followup',  pattern: /\b(send|share|forward|circulate|prepare|draft|put\s*together|pull\s*together|attach)\b[^.\n]{0,80}\b(deck|memo|model|term\s*sheet|loi|nda|agreement|contract|drl|due\s*diligence|diligence\s*list|financials?|cim|teaser|write[-\s]?up|materials?|documents?|docs?|report|summary)\b/i },
  { intent: 'approval_request',   pattern: /\b(approval|sign[-\s]?off|green[-\s]?light|authoriz(?:e|ation)|need\s+your\s+ok|confirm\s+(?:approval|sign[-\s]?off))\b/i },
  { intent: 'info_request',       pattern: /\b(could you|can you|please\s+(send|share|provide|confirm)|need(?:ed)?\s+(?:from\s+you|by\s+you))\b/i },
  { intent: 'review_commitment',  pattern: /\b(review|look\s+(?:over|into)|take\s+a\s+look|check)\b/i },
  { intent: 'follow_up',          pattern: /\b(follow\s*up|circle\s*back|reach\s*out|get\s*back\s*to\s*you|touch\s*base)\b/i },
];

function classifyIntent(trigger: string, body: string): { intent: NextStepIntent; label: string } {
  const haystack = `${trigger || ''}\n${body || ''}`;
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(haystack)) {
      return { intent: rule.intent, label: INTENT_LABELS[rule.intent] };
    }
  }
  return { intent: 'unknown', label: INTENT_LABELS.unknown };
}

export interface NextStepDetection {
  hasNextStep: boolean;
  /** Verbatim phrase that triggered the detection. */
  trigger: string | null;
  /** Suggested task title pre-filled from the phrase. */
  suggestedTaskTitle: string | null;
  /** Classified intent bucket; 'unknown' when no clear next step. */
  intent: NextStepIntent;
  /** Human-readable intent label, e.g. "Document follow-up". */
  intentLabel: string;
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
  if (!text) {
    return {
      hasNextStep: false,
      trigger: null,
      suggestedTaskTitle: null,
      intent: 'unknown',
      intentLabel: INTENT_LABELS.unknown,
    };
  }
  for (const { pattern } of NEXT_STEP_PATTERNS) {
    const m = text.match(pattern);
    if (m && m[0]) {
      const trigger = m[0].replace(/\s+/g, ' ').trim().slice(0, 160);
      // Convert "I'll send the diligence list tomorrow" → "Send the diligence list"
      const baseTitle = trigger
        .replace(/^(i(?:'| wi)?ll|i(?:'| a)m|let me|allow me to|will)\s+/i, '')
        .replace(/^./, (c) => c.toUpperCase())
        .replace(/\b(by|before)\s+(end of day|eod|end of week|eow|tomorrow|monday|tuesday|wednesday|thursday|friday|next week|this week|cob)\b.*$/i, '')
        .trim();
      const { intent, label } = classifyIntent(trigger, text);
      // Prefix the suggested task title with the intent label so the user
      // immediately sees the classification (e.g. "Meeting request — …").
      const titleCore = baseTitle.length > 8 ? baseTitle.slice(0, 110) : trigger.slice(0, 110);
      const suggestedTaskTitle = `${label} — ${titleCore}`.slice(0, 140);
      return {
        hasNextStep: true,
        trigger,
        suggestedTaskTitle,
        intent,
        intentLabel: label,
      };
    }
  }
  return {
    hasNextStep: false,
    trigger: null,
    suggestedTaskTitle: null,
    intent: 'unknown',
    intentLabel: INTENT_LABELS.unknown,
  };
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
  /** Full CC distribution. Recorded on the activity log for the deal. */
  cc?: string[];
  /** Full BCC distribution. Recorded on the activity log for the deal. */
  bcc?: string[];
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
    const ccList = (input.cc || []).filter(Boolean);
    const bccList = (input.bcc || []).filter(Boolean);
    const distributionSuffix = [
      ccList.length ? `cc: ${ccList.join(', ')}` : null,
      bccList.length ? `bcc: ${bccList.join(', ')}` : null,
    ].filter(Boolean).join(' • ');
    const description = `Sent reply to ${input.toName || input.toEmail}${distributionSuffix ? ` (${distributionSuffix})` : ''}: "${input.subject}" — ${preview}${(input.body || '').length > 150 ? '…' : ''}`;

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
        cc: ccList,
        bcc: bccList,
        recipient_count: 1 + ccList.length + bccList.length,
        body_preview: preview,
        body_length: (input.body || '').length,
        sent_at: new Date().toISOString(),
        next_step_detected: result.nextStep.hasNextStep,
        next_step_trigger: result.nextStep.trigger,
        next_step_intent: result.nextStep.intent,
        next_step_intent_label: result.nextStep.intentLabel,
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