import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { APP_BASE_URL } from '@/constants/appConfig';

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
}

interface GmailStatus {
  connected: boolean;
  expires_at?: string;
  is_expired?: boolean;
  scope?: string;
  connected_at?: string;
}

// Demo mock emails for demo@5thline.co
const DEMO_MOCK_EMAILS: GmailMessage[] = [
  {
    id: 'demo-email-1', thread_id: 'demo-thread-1',
    subject: 'RE: Q1 Financials Review – Apex Manufacturing',
    from_email: 'sarah.chen@apexmfg.com', from_name: 'Sarah Chen',
    to_emails: ['demo@5thline.co'],
    snippet: 'Hi team, attached are the updated Q1 financials with the revised EBITDA adjustments we discussed. The add-backs for one-time restructuring costs...',
    body_text: 'Hi team,\n\nAttached are the updated Q1 financials with the revised EBITDA adjustments we discussed. The add-backs for one-time restructuring costs bring adjusted EBITDA to $4.2M, up from $3.8M reported.\n\nKey highlights:\n- Revenue grew 12% YoY\n- Gross margin improved to 42%\n- Working capital normalized after inventory build-down\n\nLet me know if you need anything else before the lender call on Thursday.\n\nBest,\nSarah',
    is_read: false, is_starred: true, labels: ['INBOX', 'IMPORTANT'],
    received_at: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: 'demo-email-2', thread_id: 'demo-thread-2',
    subject: 'Term Sheet – Greenfield Capital | $15M Senior Secured',
    from_email: 'mike.rodriguez@greenfieldcap.com', from_name: 'Mike Rodriguez',
    to_emails: ['demo@5thline.co'],
    snippet: 'Please find attached our indicative term sheet for the $15M senior secured facility. Key terms: L+425, 3-year tenor, 1x fixed charge coverage...',
    body_text: 'Hi,\n\nPlease find attached our indicative term sheet for the $15M senior secured facility.\n\nKey terms:\n- Rate: SOFR + 425 bps\n- Tenor: 3 years with 1-year extension option\n- Covenants: 1.0x fixed charge coverage, 3.5x leverage\n- Collateral: First lien on all assets\n- Commitment fee: 50 bps on undrawn\n\nWe\'d like to schedule a management meeting next week if possible.\n\nRegards,\nMike Rodriguez\nManaging Director, Greenfield Capital',
    is_read: false, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'demo-email-3', thread_id: 'demo-thread-3',
    subject: 'Due Diligence Checklist – Outstanding Items',
    from_email: 'jennifer.wu@meridianbank.com', from_name: 'Jennifer Wu',
    to_emails: ['demo@5thline.co'],
    snippet: 'Following up on the remaining DD items. We still need: (1) 3-year audited financials, (2) management bios, (3) customer concentration analysis...',
    body_text: 'Hi,\n\nFollowing up on the remaining DD items for the NovaTech deal. We still need:\n\n1. 3-year audited financials (2023-2025)\n2. Management bios and org chart\n3. Customer concentration analysis (top 10)\n4. Accounts receivable aging report\n5. Capital expenditure schedule\n\nCould you have these to us by Friday? We\'re targeting credit committee on the 15th.\n\nThanks,\nJennifer Wu\nVP, Commercial Lending\nMeridian Bank',
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
  {
    id: 'demo-email-4', thread_id: 'demo-thread-4',
    subject: 'Lender Update Call – Thursday 2pm ET',
    from_email: 'david.park@5thline.co', from_name: 'David Park',
    to_emails: ['demo@5thline.co'],
    snippet: 'Quick reminder: lender update call with Apex\'s management team is confirmed for Thursday at 2pm ET. Agenda attached. Please review the talking points...',
    body_text: 'Quick reminder: lender update call with Apex\'s management team is confirmed for Thursday at 2pm ET.\n\nAgenda:\n1. Q1 performance overview (15 min)\n2. Market outlook and pipeline (10 min)\n3. Covenant compliance update (5 min)\n4. Q&A (15 min)\n\nPlease review the attached talking points and let me know if you\'d like to add anything.\n\nBest,\nDavid',
    is_read: true, is_starred: true, labels: ['INBOX'],
    received_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
  {
    id: 'demo-email-5', thread_id: 'demo-thread-5',
    subject: 'NovaTech – Revised Projections Model',
    from_email: 'lisa.thompson@novatechsolutions.com', from_name: 'Lisa Thompson',
    to_emails: ['demo@5thline.co'],
    snippet: 'As discussed, here are the revised 5-year projections incorporating the new contract wins. Revenue CAGR now projects at 18% vs 14% previously...',
    body_text: 'As discussed, here are the revised 5-year projections incorporating the new contract wins.\n\nKey changes:\n- Revenue CAGR now projects at 18% vs 14% previously\n- EBITDA margins expanding to 28% by Year 3\n- Debt paydown accelerated by 6 months\n- New contracts add $2.3M in recurring revenue\n\nThe model is in the shared data room. Let me know if the lenders need any additional scenarios.\n\nBest,\nLisa Thompson\nCFO, NovaTech Solutions',
    is_read: false, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-6', thread_id: 'demo-thread-6',
    subject: 'RE: Covenant Waiver Request – Beacon Industries',
    from_email: 'robert.james@unioncreditgroup.com', from_name: 'Robert James',
    to_emails: ['demo@5thline.co'],
    snippet: 'We\'ve reviewed the waiver request. Given the temporary nature of the covenant breach and the corrective actions outlined, we\'re prepared to grant...',
    body_text: 'We\'ve reviewed the waiver request for Beacon Industries.\n\nGiven the temporary nature of the covenant breach and the corrective actions outlined, we\'re prepared to grant a one-quarter waiver on the leverage covenant with the following conditions:\n\n1. Monthly reporting until back in compliance\n2. No additional debt incurrence\n3. Management call within 30 days\n\nPlease confirm acceptance and we\'ll prepare the formal waiver letter.\n\nRobert James\nSenior Credit Officer\nUnion Credit Group',
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 1.5 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-7', thread_id: 'demo-thread-7',
    subject: 'Market Intelligence: ABL Rates Tightening Q2',
    from_email: 'research@debtmarketweekly.com', from_name: 'Debt Market Weekly',
    to_emails: ['demo@5thline.co'],
    snippet: 'This week\'s market update: ABL spreads widened 15-25 bps across middle market. Lender appetite remains strong for healthcare and tech-enabled services...',
    body_text: 'This week\'s market update:\n\n- ABL spreads widened 15-25 bps across middle market\n- Lender appetite remains strong for healthcare and tech-enabled services\n- Leverage multiples holding at 3.5-4.5x for sponsored deals\n- Unitranche volume up 20% QoQ\n- Regional banks pulling back on CRE exposure\n\nFull report attached.\n\nDebt Market Weekly Research Team',
    is_read: true, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'demo-email-8', thread_id: 'demo-thread-8',
    subject: 'Introduction: Summit Capital – Interest in NovaTech',
    from_email: 'amanda.foster@summitcap.com', from_name: 'Amanda Foster',
    to_emails: ['demo@5thline.co'],
    snippet: 'I was referred to you by a mutual contact. We\'re actively looking at tech-enabled services in the $10-25M EBITDA range and NovaTech fits our...',
    body_text: 'Hi,\n\nI was referred to you by a mutual contact regarding the NovaTech opportunity. We\'re actively deploying capital into tech-enabled services in the $10-25M EBITDA range.\n\nSummit Capital can offer:\n- Up to $30M in committed facilities\n- Flexible covenant packages\n- Quick decisioning (2-3 weeks to term sheet)\n\nWould love to set up a call this week to learn more.\n\nBest,\nAmanda Foster\nDirector, Summit Capital Partners',
    is_read: false, is_starred: false, labels: ['INBOX'],
    received_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
];

const isDemoUser = (email?: string) => email === 'demo@5thline.co' || email === 'demo@example.com';

// Module-level cache for stale-while-revalidate pattern
let cachedMessages: GmailMessage[] = [];
let cachedStatus: GmailStatus | null = null;

const GMAIL_STATUS_KEY = 'naitive_gmail_status';

function loadPersistedStatus(): GmailStatus | null {
  try {
    const raw = localStorage.getItem(GMAIL_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GmailStatus;
    // If persisted status says connected, trust it for instant hydration
    return parsed;
  } catch {
    return null;
  }
}

function persistStatus(status: GmailStatus) {
  try {
    localStorage.setItem(GMAIL_STATUS_KEY, JSON.stringify(status));
  } catch { /* ignore */ }
}

function clearPersistedStatus() {
  try { localStorage.removeItem(GMAIL_STATUS_KEY); } catch { /* ignore */ }
}

export function useGmail() {
  const { user } = useAuth();
  const isDemo = isDemoUser(user?.email ?? undefined);
  const initialStatus = cachedStatus || loadPersistedStatus() || { connected: false };
  const hasInitialStatus = !!(cachedStatus || loadPersistedStatus());
  const [status, setStatus] = useState<GmailStatus>(() => initialStatus);
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
      persistStatus(demoStatus);
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

      const { data, error } = await supabase.functions.invoke('gmail-status');
      
      if (error) throw error;
      setStatus(data);
      cachedStatus = data;
      persistStatus(data);
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
      clearPersistedStatus();
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

    // Demo user returns mock data
    if (isDemo) {
      setIsLoading(true);
      // Simulate brief loading
      await new Promise(r => setTimeout(r, 300));
      const max = options?.maxResults || 50;
      const demoMsgs = DEMO_MOCK_EMAILS.slice(0, max);
      setMessages(demoMsgs);
      cachedMessages = demoMsgs;
      setIsLoading(false);
      return { messages: demoMsgs };
    }

    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.access_token) {
        setIsLoading(false);
        return null;
      }
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'list',
          max_results: options?.maxResults || 50,
          page_token: options?.pageToken,
          label_ids: options?.labelIds,
          query: options?.query,
        },
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
      return DEMO_MOCK_EMAILS.find(m => m.id === messageId) || null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'get',
          message_id: messageId,
        },
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

      const { data, error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'send',
          to: options.to,
          subject: options.subject,
          body: options.body,
          body_html: options.bodyHtml,
          cc: options.cc,
          bcc: options.bcc,
          attachments: encodedAttachments,
          reply_to_message_id: options.replyToMessageId,
        },
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
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: read ? 'mark_read' : 'mark_unread',
          message_id: messageId,
        },
      });

      if (error) throw error;
      
      // Update local state
      setMessages(prev => prev.map(m => 
        m.id === messageId ? { ...m, is_read: read } : m
      ));
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
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: starred ? 'star' : 'unstar',
          message_id: messageId,
        },
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
      const { error } = await supabase.functions.invoke('gmail-messages', {
        body: {
          action: 'trash',
          message_id: messageId,
        },
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
    trashMessage,
  };
}
