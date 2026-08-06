import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APP_BASE_URL } from '@/constants/appConfig';
import { getInvalidRecipients, normalizeRecipientInput } from '@/lib/emailRecipients';

/**
 * Normalize recipient inputs into a clean string[] of individual addresses.
 * Accepts string[], a single string (possibly comma/semicolon-joined), or undefined.
 * Nylas v3 rejects entries that contain multiple addresses, so we always split.
 */
function normalizeRecipients(input: string[] | string | undefined): string[] | undefined {
  const normalized = normalizeRecipientInput(input);
  return normalized.length ? normalized : undefined;
}

interface GmailMessage {
  id: string;
  thread_id: string;
  subject: string;
  from_email: string;
  from_name: string;
  to_emails?: string[];
  cc_emails?: string[];
  snippet: string;
  body_text?: string;
  body_html?: string;
  is_read: boolean;
  is_starred: boolean;
  labels: string[];
  received_at: string;
  has_attachments?: boolean;
  attachments?: Array<{ filename: string; content_type: string; size: number }>;
}

type MailFolderTarget = 'inbox' | 'archive' | 'spam' | 'trash' | 'drafts';

interface GmailStatus {
  connected: boolean;
  expires_at?: string;
  is_expired?: boolean;
  scope?: string;
  connected_at?: string;
  /** Which mail provider is connected (gmail via Nylas, microsoft, or none). */
  provider?: 'gmail' | 'microsoft' | 'none';
  email_address?: string;
  /** True when a connection record exists but the most recent read failed. */
  read_failed?: boolean;
  /** Last error surfaced from the data-fetch pipeline, for UI diagnostics. */
  last_error?: string | null;
  /** When set to 'demo-seed', the inbox is a seeded demo mailbox. */
  source?: 'demo-seed' | 'live';
}

// Demo mock emails for demo@5thline.co.
// Storyline:
//   #1 — Coastal Brands client sends financial materials → "add to data room" workflow
//   #2 — Greenfield Capital lender sends term sheet for Vertex Cloud Solutions →
//        "update deal + lender stage" workflow
// Both are pinned to the top by using fresh timestamps so they remain first
// after every demo reset. Subsequent messages provide a believable,
// supporting backdrop.
import {
  DEMO_EMAIL_1_ID, DEMO_EMAIL_2_ID,
  DEMO_DEAL_CLIENT_DOCS, DEMO_DEAL_TERM_SHEET,
} from '@/lib/demoSeed';

const DEMO_MOCK_EMAILS: GmailMessage[] = [
  {
    id: DEMO_EMAIL_1_ID, thread_id: 'demo-thread-client-docs',
    subject: `Coastal Brands – Q4 financials, AR aging & cap table for the data room`,
    from_email: 'rachel.patel@coastalbrands.com', from_name: 'Rachel Patel',
    to_emails: ['demo@5thline.co'],
    snippet: `Hi James — sending over the materials we promised for the data room: Q4 financials, AR aging, customer concentration, cap table, and the latest org chart. Let me know if anything else is needed before you send to lenders.`,
    body_text: `Hi James,\n\nAs discussed on Tuesday, attached are the materials we promised for the Coastal Brands data room:\n\n  • Q4 2025 financial statements (audited)\n  • AR aging report (as of last Friday)\n  • Top-25 customer concentration analysis\n  • Updated cap table\n  • Management org chart\n\nPlease drop these into the data room so the lenders have what they need ahead of next week's calls. Let me know if anything else is missing.\n\nThanks,\nRachel Patel\nCFO, Coastal Brands Inc.`,
    is_read: false, is_starred: true, labels: ['INBOX', 'IMPORTANT'],
    received_at: new Date(Date.now() - 4 * 60000).toISOString(),
    has_attachments: true,
    attachments: [
      { filename: 'CoastalBrands_Q4-2025_Financials.pdf', content_type: 'application/pdf', size: 1_843_211 },
      { filename: 'CoastalBrands_AR-Aging.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 412_980 },
      { filename: 'CoastalBrands_Customer-Concentration.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 318_540 },
      { filename: 'CoastalBrands_CapTable.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 96_440 },
      { filename: 'CoastalBrands_Org-Chart.pdf', content_type: 'application/pdf', size: 612_004 },
    ],
  },
  {
    id: DEMO_EMAIL_2_ID, thread_id: 'demo-thread-term-sheet',
    subject: `Vertex Cloud Solutions – Indicative Term Sheet ($18M Senior Secured)`,
    from_email: 'mike.rodriguez@greenfieldcap.com', from_name: 'Mike Rodriguez',
    to_emails: ['demo@5thline.co'],
    snippet: `Pleased to share Greenfield Capital's indicative term sheet for Vertex Cloud Solutions: $18M senior secured, SOFR + 450, 4-yr tenor, 1.10x FCCR. We'd like to advance to credit committee — please confirm next steps.`,
    body_text: `James,\n\nPleased to share Greenfield Capital's indicative term sheet for Vertex Cloud Solutions.\n\nHeadline terms:\n  • Facility: $18.0M senior secured (Revolver $5M + Term Loan $13M)\n  • Pricing: SOFR + 450 bps\n  • Tenor: 4 years (with 1-year extension option)\n  • Amortization: 5% / yr, bullet at maturity\n  • Covenants: 1.10x FCCR, 3.50x total leverage, min liquidity $2M\n  • Collateral: First lien on all assets\n  • Fees: 100 bps upfront, 50 bps unused\n  • Conditions precedent: customary, including completion of QoE\n\nWe're prepared to advance this to credit committee on the 22nd subject to receipt of the updated financial package. Please confirm if your client is comfortable with the structure so we can move the lender stage forward.\n\nRegards,\nMike Rodriguez\nManaging Director, Greenfield Capital`,
    is_read: false, is_starred: true, labels: ['INBOX', 'IMPORTANT'],
    received_at: new Date(Date.now() - 32 * 60000).toISOString(),
    has_attachments: true,
    attachments: [
      { filename: 'Vertex_Greenfield_Term-Sheet_INDICATIVE.pdf', content_type: 'application/pdf', size: 287_654 },
    ],
  },
  {
    id: 'demo-email-3', thread_id: 'demo-thread-3',
    subject: 'Due Diligence Checklist – Outstanding Items (Pinnacle Data Systems)',
    from_email: 'jennifer.wu@meridianbank.com', from_name: 'Jennifer Wu',
    to_emails: ['demo@5thline.co'],
    snippet: `Following up on remaining DD items. We still need: (1) 3-year audited financials, (2) management bios, (3) customer concentration, (4) AR aging, (5) capex schedule.`,
    body_text: `Hi James,\n\nFollowing up on remaining DD items for Pinnacle Data Systems. We still need:\n\n  1. 3-year audited financials (2023–2025)\n  2. Management bios and org chart\n  3. Customer concentration (top 10)\n  4. AR aging report\n  5. Capex schedule\n\nCommittee is targeting the 15th.\n\nThanks,\nJennifer Wu — VP Commercial Lending, Meridian Bank`,
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'demo-email-4', thread_id: 'demo-thread-4',
    subject: 'Lender Update Call – Thursday 2pm ET (Summit Hospitality)',
    from_email: 'david.park@5thline.co', from_name: 'David Park',
    to_emails: ['demo@5thline.co'],
    snippet: `Quick reminder: lender update call with Summit Hospitality's management team is Thursday 2pm ET. Agenda below.`,
    body_text: `Reminder: lender update call with Summit Hospitality's management team is confirmed Thursday 2pm ET.\n\nAgenda:\n  1. Q1 performance overview\n  2. Market outlook & pipeline\n  3. Covenant compliance update\n  4. Q&A\n\n— David`,
    is_read: true, is_starred: true, labels: ['INBOX'],
    received_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
  {
    id: 'demo-email-5', thread_id: 'demo-thread-5',
    subject: 'Vertex Cloud – Revised projections model',
    from_email: 'lisa.thompson@vertexcloud.io', from_name: 'Lisa Thompson',
    to_emails: ['demo@5thline.co'],
    snippet: `Updated 5-year projections with the new contract wins. Revenue CAGR now 18% vs 14% prior.`,
    body_text: `Updated 5-year projections incorporating the recent contract wins.\n\n  • Revenue CAGR: 18% (was 14%)\n  • EBITDA margin: 28% by Y3\n  • Debt paydown accelerated 6 months\n  • New contracts add $2.3M ARR\n\nLet me know if the lenders need additional scenarios.\n\nLisa Thompson — CFO, Vertex Cloud Solutions`,
    is_read: false, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-6', thread_id: 'demo-thread-6',
    subject: 'RE: Covenant Waiver Request – Redwood Manufacturing',
    from_email: 'robert.james@unioncreditgroup.com', from_name: 'Robert James',
    to_emails: ['demo@5thline.co'],
    snippet: `We're prepared to grant a one-quarter waiver on the leverage covenant with monthly reporting and no additional debt incurrence.`,
    body_text: `We've reviewed the waiver request for Redwood Manufacturing. Prepared to grant a one-quarter waiver on the leverage covenant subject to:\n\n  1. Monthly reporting until back in compliance\n  2. No additional debt incurrence\n  3. Management call within 30 days\n\nRobert James — Senior Credit Officer, Union Credit Group`,
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 1.5 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-7', thread_id: 'demo-thread-7',
    subject: 'Market Intelligence: ABL rates tightening in Q2',
    from_email: 'research@debtmarketweekly.com', from_name: 'Debt Market Weekly',
    to_emails: ['demo@5thline.co'],
    snippet: `ABL spreads widened 15–25 bps across middle market. Healthcare & tech-enabled services remain in favor.`,
    body_text: `Weekly update:\n  • ABL spreads widened 15–25 bps in middle market\n  • Strong appetite for healthcare and tech-enabled services\n  • Leverage holding at 3.5–4.5x for sponsored deals\n  • Unitranche volume +20% QoQ`,
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-8', thread_id: 'demo-thread-8',
    subject: 'Introduction: Summit Capital – interest in Vertex Cloud',
    from_email: 'amanda.foster@summitcap.com', from_name: 'Amanda Foster',
    to_emails: ['demo@5thline.co'],
    snippet: `Referred by a mutual contact. Actively deploying into tech-enabled services $10–25M EBITDA. Vertex fits our box.`,
    body_text: `Hi James,\n\nReferred regarding the Vertex Cloud opportunity. We can offer up to $30M committed facilities, flexible covenants, 2–3 weeks to term sheet.\n\nAmanda Foster — Director, Summit Capital Partners`,
    is_read: false, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const isLegacyDemoEmail = (email?: string) =>
  email === 'demo@5thline.co' || email === 'demo@example.com';

// Module-level cache for stale-while-revalidate pattern
let cachedMessages: GmailMessage[] = [];
let cachedStatus: GmailStatus | null = null;

const GMAIL_STATUS_KEY = 'naitive_gmail_status';
// Persisted/module status must never leak between accounts on a shared browser —
// scope it to the signed-in user id.
let cachedStatusUserId: string | null = null;

function statusKey(userId?: string | null) {
  return userId ? `${GMAIL_STATUS_KEY}:${userId}` : GMAIL_STATUS_KEY;
}

function loadPersistedStatus(userId?: string | null): GmailStatus | null {
  if (!userId) return null;
  try {
    // Drop any legacy unscoped entry — it may belong to a different account.
    localStorage.removeItem(GMAIL_STATUS_KEY);
    const raw = localStorage.getItem(statusKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GmailStatus;
    // If persisted status says connected, trust it for instant hydration
    return parsed;
  } catch {
    return null;
  }
}

function persistStatus(status: GmailStatus, userId?: string | null) {
  if (!userId) return;
  try {
    localStorage.setItem(statusKey(userId), JSON.stringify(status));
  } catch { /* ignore */ }
}

function clearPersistedStatus(userId?: string | null) {
  try {
    localStorage.removeItem(GMAIL_STATUS_KEY);
    if (userId) localStorage.removeItem(statusKey(userId));
  } catch { /* ignore */ }
}

async function invokeGmailMessages(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('No active session. Please sign in again.');
  }
  return supabase.functions.invoke('gmail-messages', {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function useGmail() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Never hydrate from another account's cached status.
  if (cachedStatusUserId && cachedStatusUserId !== userId) {
    cachedStatus = null;
    cachedMessages = [];
  }
  cachedStatusUserId = userId;
  const persisted = cachedStatus || loadPersistedStatus(userId);
  const initialStatus = persisted || { connected: false };
  const hasInitialStatus = !!persisted;
  const [status, setStatus] = useState<GmailStatus>(() => initialStatus);
  const isDemo =
    isLegacyDemoEmail(user?.email ?? undefined) ||
    status?.source === 'demo-seed';
  const [isStatusLoading, setIsStatusLoading] = useState(!hasInitialStatus);
  const [messages, setMessages] = useState<GmailMessage[]>(() => cachedMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check connection status
  const checkStatus = useCallback(async () => {
    if (!user) { setIsStatusLoading(false); return; }

    // Demo user always appears connected
    if (isDemo) {
      const demoStatus = { connected: true, connected_at: new Date().toISOString() };
      setStatus(demoStatus);
      cachedStatus = demoStatus;
      persistStatus(demoStatus, userId);
      setIsStatusLoading(false);
      return;
    }

    try {
      // Guard: if there's no live session token, skip the call (avoids 401 spam after logout)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setIsStatusLoading(false);
        return;
      }

      // Check Gmail (Nylas) and Microsoft in parallel. A user is considered
      // "mail connected" if EITHER provider has a valid record. This prevents
      // false "Connect your mail" prompts for users (e.g. polly@blount.capital)
      // who connected Microsoft instead of Gmail.
      const [gmailRes, msRes] = await Promise.allSettled([
        // Retry once on transient cold-boot failures (503 LOAD_FUNCTION_ERROR)
        (async () => {
          const first = await supabase.functions.invoke('gmail-status');
          if (first.error) {
            const msg = String((first.error as { message?: string }).message ?? '');
            if (/503|LOAD_FUNCTION_ERROR|Failed to load edge function|Failed to send a request/i.test(msg)) {
              await new Promise((r) => setTimeout(r, 400));
              return await supabase.functions.invoke('gmail-status');
            }
          }
          return first;
        })(),
        supabase
          .from('microsoft_tokens')
          .select('email, connected_at, expires_at, status')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      const gmailData =
        gmailRes.status === 'fulfilled' && !gmailRes.value.error
          ? (gmailRes.value.data as GmailStatus | null)
          : null;
      const msRow =
        msRes.status === 'fulfilled' && !msRes.value.error ? msRes.value.data : null;
      const msConnected = !!msRow && msRow.status !== 'disconnected';

      let next: GmailStatus;
      if (gmailData?.connected) {
        next = { ...gmailData, provider: 'gmail' };
      } else if (msConnected) {
        next = {
          connected: true,
          provider: 'microsoft',
          email_address: msRow!.email ?? undefined,
          connected_at: msRow!.connected_at ?? undefined,
          expires_at: msRow!.expires_at ?? undefined,
          is_expired: msRow!.expires_at
            ? new Date(msRow!.expires_at) < new Date()
            : false,
        };
      } else {
        next = { connected: false, provider: 'none' };
      }

      // If BOTH lookups failed (network/transport), don't overwrite a
      // previously-known connected state — surface as a data error instead
      // so the UI can distinguish "load failed" from "not connected".
      if (gmailRes.status === 'rejected' && msRes.status === 'rejected') {
        throw (gmailRes as PromiseRejectedResult).reason;
      }

      setStatus(next);
      cachedStatus = next;
      persistStatus(next, userId);
      setError(null);
    } catch (err: any) {
      // Suppress 401s — usually means the session expired/logged out between renders
      const msg = err?.message || '';
      if (!/401|Unauthorized|Invalid token/i.test(msg)) {
        console.error('Gmail status error:', err);
        setError(msg);
      }
      // Don't clear persisted status on transient errors — keep showing connected
    } finally {
      setIsStatusLoading(false);
    }
  }, [user, isDemo]);

  // Get Nylas Hosted OAuth URL and redirect
  const connect = useCallback(async () => {
    if (!user) return;

    setIsConnecting(true);
    try {
      const redirectUri = `${APP_BASE_URL}/integrations?gmail_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: {
          action: 'get_auth_url',
          redirect_uri: redirectUri,
        },
      });

      if (error) throw error;
      
      // Redirect to Nylas Hosted OAuth
      window.location.href = data.auth_url;
    } catch (err: any) {
      console.error('Gmail connect error:', err);
      setError(err.message);
      setIsConnecting(false);
    }
  }, [user]);

  // Exchange Nylas authorization code for grant
  const exchangeCode = useCallback(async (code: string) => {
    if (!user) return false;

    setIsConnecting(true);
    try {
      const redirectUri = `${APP_BASE_URL}/integrations?gmail_callback=true`;
      
      const { data, error } = await supabase.functions.invoke('gmail-auth', {
        body: {
          action: 'exchange_code',
          code: code,
          redirect_uri: redirectUri,
        },
      });
      if (error) throw error;
      
      // Refresh status
      await checkStatus();
      
      setError(null);
      return true;
    } catch (err: any) {
      console.error('Gmail connection error:', err);
      setError(err.message);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [user, checkStatus]);

  // Disconnect Gmail
  const disconnect = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase.functions.invoke('gmail-auth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;
      
      const disconnected = { connected: false };
      setStatus(disconnected);
      cachedStatus = disconnected;
      clearPersistedStatus(userId);
      setMessages([]);
      cachedMessages = [];
      setError(null);
    } catch (err: any) {
      console.error('Gmail disconnect error:', err);
      setError(err.message);
    }
  }, [user]);

  // List messages
  const listMessages = useCallback(async (options?: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    query?: string;
  }) => {
    if (!user) return null;

    // Demo user: read seeded messages directly from gmail_messages (RLS
    // scopes to the current user). Falls back to the bundled mock set if
    // the table is empty.
    if (isDemo) {
      setIsLoading(true);
      try {
        const max = options?.maxResults || 50;
        const { data, error } = await supabase
          .from('gmail_messages')
          .select('id, gmail_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, snippet, body_text, body_html, is_read, is_starred, labels, received_at')
          .eq('user_id', user.id)
          .order('received_at', { ascending: false })
          .limit(max);
        if (error) throw error;
        const rows = (data ?? []).map((r) => ({
          id: r.gmail_message_id ?? r.id,
          thread_id: r.thread_id ?? '',
          subject: r.subject ?? '',
          from_email: r.from_email ?? '',
          from_name: r.from_name ?? '',
          to_emails: r.to_emails ?? undefined,
          cc_emails: r.cc_emails ?? undefined,
          snippet: r.snippet ?? '',
          body_text: r.body_text ?? undefined,
          body_html: r.body_html ?? undefined,
          is_read: !!r.is_read,
          is_starred: !!r.is_starred,
          labels: r.labels ?? [],
          received_at: r.received_at ?? new Date().toISOString(),
        })) as GmailMessage[];
        const final = rows.length > 0 ? rows : DEMO_MOCK_EMAILS.slice(0, max);
        setMessages(final);
        cachedMessages = final;
        return { messages: final };
      } catch (e) {
        console.warn('[useGmail] demo list fallback to mock:', e);
        const max = options?.maxResults || 50;
        const demoMsgs = DEMO_MOCK_EMAILS.slice(0, max);
        setMessages(demoMsgs);
        cachedMessages = demoMsgs;
        return { messages: demoMsgs };
      } finally {
        setIsLoading(false);
      }
    }

    setIsLoading(true);
    try {
      const { data, error } = await invokeGmailMessages({
        action: 'list',
        max_results: options?.maxResults || 50,
        page_token: options?.pageToken,
        label_ids: options?.labelIds,
        query: options?.query,
      });

      if (error) throw error;
      
      // Don't overwrite messages on rate-limit fallback
      if (data.fallback) {
        setError(null);
        return data;
      }

      const fetchedMessages = data.messages || [];
      setMessages(fetchedMessages);
      cachedMessages = fetchedMessages;
      setError(null);
      return data;
    } catch (err: any) {
      const msg = err?.message || '';
      if (!/401|Unauthorized|Invalid token/i.test(msg)) {
        console.error('Gmail list error:', err);
        setError(msg);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, isDemo]);

  // Get single message
  const getMessage = useCallback(async (messageId: string) => {
    if (!user) return null;

    if (isDemo) {
      // Try cache first, then DB, then mock fallback.
      const cached = cachedMessages.find((m) => m.id === messageId);
      if (cached) return cached;
      try {
        const { data } = await supabase
          .from('gmail_messages')
          .select('id, gmail_message_id, thread_id, subject, from_email, from_name, to_emails, cc_emails, snippet, body_text, body_html, is_read, is_starred, labels, received_at')
          .eq('user_id', user.id)
          .eq('gmail_message_id', messageId)
          .maybeSingle();
        if (data) {
          return {
            id: data.gmail_message_id ?? data.id,
            thread_id: data.thread_id ?? '',
            subject: data.subject ?? '',
            from_email: data.from_email ?? '',
            from_name: data.from_name ?? '',
            to_emails: data.to_emails ?? undefined,
            cc_emails: data.cc_emails ?? undefined,
            snippet: data.snippet ?? '',
            body_text: data.body_text ?? undefined,
            body_html: data.body_html ?? undefined,
            is_read: !!data.is_read,
            is_starred: !!data.is_starred,
            labels: data.labels ?? [],
            received_at: data.received_at ?? new Date().toISOString(),
          } as GmailMessage;
        }
      } catch { /* fall through to mock */ }
      return DEMO_MOCK_EMAILS.find(m => m.id === messageId) || null;
    }

    try {
      const { data, error } = await invokeGmailMessages({
        action: 'get',
        message_id: messageId,
      });

      if (error) throw error;
      return data.message;
    } catch (err: any) {
      console.error('Gmail get message error:', err);
      setError(err.message);
      return null;
    }
  }, [user, isDemo]);

  // Send email
  const sendEmail = useCallback(async (options: {
    to: string[];
    subject: string;
    body?: string;
    bodyHtml?: string;
    cc?: string[];
    bcc?: string[];
    /** Real File attachments — base64-encoded inline before send (Gmail 25MB cap enforced server-side). */
    attachments?: File[];
    /** When set, threads the outbound message under the original via Nylas reply_to_message_id. */
    replyToMessageId?: string;
  }) => {
    if (!user) return null;

    try {
      const normalizedTo = normalizeRecipients(options.to);
      const normalizedCc = normalizeRecipients(options.cc);
      const normalizedBcc = normalizeRecipients(options.bcc);
      const invalidRecipients = [
        ...getInvalidRecipients(options.to),
        ...getInvalidRecipients(options.cc),
        ...getInvalidRecipients(options.bcc),
      ];

      if (!normalizedTo?.length) {
        throw new Error('Add at least one valid recipient before sending.');
      }
      if (invalidRecipients.length > 0) {
        throw new Error(`Invalid recipient${invalidRecipients.length > 1 ? 's' : ''}: ${invalidRecipients.join(', ')}`);
      }

      let encodedAttachments: Array<{
        filename: string;
        content_type: string;
        content: string;
        size: number;
      }> | undefined;
      if (options.attachments && options.attachments.length > 0) {
        encodedAttachments = await Promise.all(
          options.attachments.map(async (file) => {
            const buf = await file.arrayBuffer();
            // base64-encode in chunks to avoid call-stack overflow on large files.
            const bytes = new Uint8Array(buf);
            let binary = '';
            const CHUNK = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK) {
              binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
            }
            return {
              filename: file.name,
              content_type: file.type || 'application/octet-stream',
              content: btoa(binary),
              size: file.size,
            };
          }),
        );
      }

      console.log('[useGmail.sendEmail] payload-shape', {
        raw: {
          to: options.to,
          cc: options.cc,
          bcc: options.bcc,
          reply_to_message_id: options.replyToMessageId,
        },
        normalized: {
          to: normalizedTo,
          cc: normalizedCc,
          bcc: normalizedBcc,
          attachment_count: encodedAttachments?.length ?? 0,
        },
      });

      const { data, error } = await invokeGmailMessages({
        action: 'send',
        to: normalizedTo,
        subject: options.subject,
        body: options.body,
        body_html: options.bodyHtml,
        cc: normalizedCc,
        bcc: normalizedBcc,
        attachments: encodedAttachments,
        reply_to_message_id: options.replyToMessageId,
      });

      if (error) throw error;
      try {
        const { logUsage } = await import('@/lib/usageLogger');
        logUsage({
          feature_type: 'EMAIL_SENT',
          feature_subtype: 'via_naitive',
          metadata: {
            recipient_count: options.to?.length ?? 0,
            has_attachments: !!encodedAttachments?.length,
            is_reply: !!options.replyToMessageId,
          },
        });
        const { logActivity } = await import('@/lib/activityLogger');
        logActivity({
          event_type: 'feature_used',
          event_data: {
            feature: 'email_sent',
            recipient_count: options.to?.length ?? 0,
            is_reply: !!options.replyToMessageId,
          },
        });
      } catch { /* ignore */ }
      return data;
    } catch (err: any) {
      console.error('Gmail send error:', err);
      setError(err.message);
      return null;
    }
  }, [user]);

  // Mark as read/unread
  const markRead = useCallback(async (messageId: string, read: boolean) => {
    if (!user) return false;

    try {
      // Persist to local cache FIRST and synchronously for the UI. This
      // is the durable source of truth that survives both session restarts
      // and the periodic Gmail `sync_state` reconcile — without it, a
      // background poll that races ahead of Gmail's mark-as-read
      // propagation will flip the message back to unread and make the
      // unread badge oscillate.
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, is_read: read } : m
      ));

      // Best-effort write to email_cache so the read state survives a
      // page reload. Non-blocking; failures are silent.
      void supabase
        .from('email_cache')
        .update({ is_read: read })
        .eq('user_id', user.id)
        .eq('gmail_message_id', messageId)
        .then(() => {}, () => {});

      // Fire the Gmail PATCH in the background. We do NOT await it for
      // the UI — the optimistic update above is what the user sees.
      const { error } = await invokeGmailMessages({
        action: read ? 'mark_read' : 'mark_unread',
        message_id: messageId,
      });

      if (error) throw error;
      return true;
    } catch (err: any) {
      console.error('Gmail mark read error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Star/unstar
  const toggleStar = useCallback(async (messageId: string, starred: boolean) => {
    if (!user) return false;

    try {
      const { error } = await invokeGmailMessages({
        action: starred ? 'star' : 'unstar',
        message_id: messageId,
      });

      if (error) throw error;
      
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_starred: starred } : m
      ));
      return true;
    } catch (err: any) {
      console.error('Gmail toggle star error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Move to trash
  const trashMessage = useCallback(async (messageId: string) => {
    if (!user) return false;

    try {
      const { error } = await invokeGmailMessages({
        action: 'trash',
        message_id: messageId,
      });

      if (error) throw error;
      
      setMessages(prev => prev.filter(m => m.id !== messageId));
      return true;
    } catch (err: any) {
      console.error('Gmail trash error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  const archiveMessage = useCallback(async (messageId: string) => {
    if (!user) return false;

    try {
      const { error } = await invokeGmailMessages({
        action: 'archive',
        message_id: messageId,
      });

      if (error) throw error;

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, labels: (m.labels || []).filter((label) => label.toUpperCase() !== 'INBOX') }
          : m,
      ));
      return true;
    } catch (err: any) {
      console.error('Gmail archive error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  const moveMessage = useCallback(async (messageId: string, folder: MailFolderTarget) => {
    if (!user) return false;

    try {
      const { error } = await invokeGmailMessages({
        action: 'move',
        message_id: messageId,
        folder,
      });

      if (error) throw error;

      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const nextLabels = (m.labels || []).filter((label) => !['INBOX', 'SPAM', 'TRASH', 'DRAFTS'].includes(label.toUpperCase()));
        if (folder === 'inbox') nextLabels.push('INBOX');
        if (folder === 'spam') nextLabels.push('SPAM');
        if (folder === 'trash') nextLabels.push('TRASH');
        if (folder === 'drafts') nextLabels.push('DRAFTS');
        return { ...m, labels: nextLabels };
      }));
      return true;
    } catch (err: any) {
      console.error('Gmail move error:', err);
      setError(err.message);
      return false;
    }
  }, [user]);

  // Check status on mount
  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user, checkStatus]);

  return {
    status,
    isStatusLoading,
    messages,
    isLoading,
    isConnecting,
    error,
    connect,
    disconnect,
    exchangeCode,
    checkStatus,
    listMessages,
    getMessage,
    sendEmail,
    markRead,
    toggleStar,
    archiveMessage,
    moveMessage,
    trashMessage,
  };
}
