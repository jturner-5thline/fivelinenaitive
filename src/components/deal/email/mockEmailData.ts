export type EmailCategory = 
  | 'deal'          // Active deal-related
  | 'prospect'      // New prospects
  | 'lender'        // Lender communications
  | 'internal'      // Internal team
  | 'newsletter'    // Newsletters
  | 'conference'    // Conferences/Events
  | 'partnership'   // Partnerships
  | 'closed_won'    // Successfully closed
  | 'closed_lost'   // Closed lost
  | 'archive';      // Archived

export interface EmailAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  is_inline?: boolean;
  /** Original Content-ID header (no angle brackets). Used to resolve `cid:` references in HTML bodies. */
  content_id?: string;
}

export interface MockEmail {
  id: string;
  threadId: string;
  /**
   * Canonical provider (Gmail/Nylas) thread id. Use this — not `threadId` —
   * as the persistence key for cross-deal artifacts like label assignments
   * so they survive navigation between deal scopes and provider re-fetches
   * where the local `threadId` may differ.
   */
  provider_thread_id?: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  snippet: string;
  body_preview: string;
  /** Full HTML body when available (fetched lazily for real Gmail messages). */
  body_html?: string;
  /** Full plain-text body when available. */
  body_text?: string;
  /** True once the full body+attachments have been hydrated from the mail provider. */
  body_loaded?: boolean;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  folder: 'inbox' | 'sent' | 'drafts' | 'junk' | 'trash' | 'outbox';
  labels: string[];
  has_attachments: boolean;
  attachments?: EmailAttachment[];
  is_linked_to_deal: boolean;
  is_follow_up: boolean;
  needs_response: boolean;
  category: EmailCategory;
  deal_name?: string;
  ai_summary?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'needs_attention';
  /** Mail provider this row originated from (used to badge Outlook vs Gmail in the inbox). */
  provider?: 'gmail' | 'microsoft' | string;
  /**
   * Transient: real File objects attached by the composer for an outbound
   * send. Not persisted to mock data — used only for the Nylas hand-off.
   */
  _outgoing_files?: File[];
  /**
   * Transient: provider message id this outbound email is replying to.
   * Used for Nylas threading (In-Reply-To/References).
   */
  _reply_to_message_id?: string;
  /**
   * Transient: full CC recipient list for an outbound send. Not persisted
   * to mock data — used by the send pipeline to forward to Nylas/Gmail
   * and to record the full distribution on the deal activity log.
   */
  _cc?: string[];
  /** Transient: full BCC recipient list for an outbound send. */
  _bcc?: string[];
}

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockEmails: MockEmail[] = [
  {
    id: 'mock-1', threadId: 'thread-1',
    subject: 'Term Sheet - Series B Financing',
    from_name: 'Sarah Chen', from_email: 'sarah.chen@capitalpartners.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Hi, please find attached the revised term sheet for the Series B round. We have updated the valuation cap and...',
    body_preview: 'Hi,\n\nPlease find attached the revised term sheet for the Series B round. We have updated the valuation cap and liquidation preferences as discussed in our last call.\n\nLet me know if you have any questions.\n\nBest,\nSarah',
    received_at: hoursAgo(2), is_read: false, is_starred: true, folder: 'inbox',
    labels: ['Important', 'Finance'], has_attachments: true, is_linked_to_deal: true,
    is_follow_up: false, needs_response: true, category: 'lender', deal_name: 'CloudSync Inc',
    ai_summary: 'Revised term sheet with updated valuation cap and liquidation preferences.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-6', threadId: 'thread-1',
    subject: 'Re: Term Sheet - Series B Financing',
    from_name: 'You', from_email: 'jturner@5thline.co',
    to_name: 'Sarah Chen', to_email: 'sarah.chen@capitalpartners.com',
    snippet: 'Hi Sarah, thank you for the revised term sheet. We have reviewed it internally and have a few comments on the...',
    body_preview: 'Hi Sarah,\n\nThank you for the revised term sheet. We have reviewed it internally and have a few comments on the anti-dilution provisions. Can we schedule a call this week to discuss?\n\nBest,\nJack',
    received_at: hoursAgo(1), is_read: true, is_starred: false, folder: 'sent',
    labels: [], has_attachments: false, is_linked_to_deal: true,
    is_follow_up: false, needs_response: false, category: 'lender', deal_name: 'CloudSync Inc',
    ai_summary: 'Requesting call to discuss anti-dilution provisions in the term sheet.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-2', threadId: 'thread-2',
    subject: 'Re: Due Diligence Checklist Update',
    from_name: 'Michael Roberts', from_email: 'mroberts@legalpro.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'We have completed the review of items 1-15 on the checklist. Still pending are the environmental reports and...',
    body_preview: 'We have completed the review of items 1-15 on the checklist. Still pending are the environmental reports and the IP assignment agreements. Can you provide an ETA on those?\n\nThanks,\nMichael',
    received_at: hoursAgo(5), is_read: true, is_starred: false, folder: 'inbox',
    labels: ['Legal'], has_attachments: false, is_linked_to_deal: true,
    is_follow_up: true, needs_response: true, category: 'deal', deal_name: 'TechFlow Solutions',
    ai_summary: 'DD items 1-15 done; awaiting environmental reports and IP assignments.',
    ai_sentiment: 'needs_attention',
  },
  {
    id: 'mock-7', threadId: 'thread-2',
    subject: 'Re: Due Diligence Checklist Update',
    from_name: 'You', from_email: 'jturner@5thline.co',
    to_name: 'Michael Roberts', to_email: 'mroberts@legalpro.com',
    snippet: 'Hi Michael, please find attached the second batch of due diligence documents including the environmental...',
    body_preview: 'Hi Michael,\n\nPlease find attached the second batch of due diligence documents including the environmental assessment report and IP schedules.\n\nLet me know if anything is missing.\n\nBest,\nJack',
    received_at: daysAgo(1), is_read: true, is_starred: false, folder: 'sent',
    labels: [], has_attachments: true, is_linked_to_deal: true,
    is_follow_up: false, needs_response: false, category: 'deal', deal_name: 'TechFlow Solutions',
    ai_summary: 'Sent environmental assessment and IP schedules for DD review.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-3', threadId: 'thread-3',
    subject: 'Meeting Follow-up: Lender Introduction',
    from_name: 'Amanda Liu', from_email: 'amanda@bridgecap.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Great meeting today! As discussed, I will connect you with our credit team next week. They are particularly...',
    body_preview: 'Great meeting today! As discussed, I will connect you with our credit team next week. They are particularly interested in the cash flow projections for Q3-Q4.\n\nLooking forward to it.\n\nAmanda',
    received_at: hoursAgo(8), is_read: true, is_starred: true, folder: 'inbox',
    labels: [], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: true, needs_response: false, category: 'lender',
    ai_summary: 'Credit team intro next week; they want Q3-Q4 cash flow projections.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-8', threadId: 'thread-3',
    subject: 'Re: Meeting Follow-up: Lender Introduction',
    from_name: 'You', from_email: 'jturner@5thline.co',
    to_name: 'Amanda Liu', to_email: 'amanda@bridgecap.com',
    snippet: 'Amanda, following up on our conversation. I have prepared the preliminary credit package with the...',
    body_preview: 'Amanda,\n\nFollowing up on our conversation. I have prepared the preliminary credit package with the financial projections and company overview. Happy to schedule a call with your credit team.\n\nBest,\nJack',
    received_at: daysAgo(3), is_read: true, is_starred: false, folder: 'sent',
    labels: [], has_attachments: true, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'lender',
    ai_summary: 'Credit package prepared; ready to schedule call with credit team.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-4', threadId: 'thread-4',
    subject: 'Updated Financial Model v3.2',
    from_name: 'David Park', from_email: 'dpark@acmecorp.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Attached is the updated financial model incorporating the revised revenue assumptions. Key changes include...',
    body_preview: 'Attached is the updated financial model incorporating the revised revenue assumptions. Key changes include:\n\n1. Adjusted EBITDA margins for Year 2-3\n2. Updated customer acquisition costs\n3. New sensitivity analysis\n\nPlease review at your convenience.',
    received_at: daysAgo(1), is_read: false, is_starred: false, folder: 'inbox',
    labels: ['Finance'], has_attachments: true, is_linked_to_deal: true,
    is_follow_up: false, needs_response: true, category: 'deal', deal_name: 'CloudSync Inc',
    ai_summary: 'Financial model v3.2 with revised EBITDA margins and sensitivity analysis.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-5', threadId: 'thread-5',
    subject: 'Insurance Certificate Request',
    from_name: 'Lisa Thompson', from_email: 'lthompson@insureco.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Per our conversation, we need the updated certificate of insurance naming the new lender as additionally...',
    body_preview: 'Per our conversation, we need the updated certificate of insurance naming the new lender as additionally insured. Please provide the lender\'s full legal name and address.',
    received_at: daysAgo(2), is_read: true, is_starred: false, folder: 'inbox',
    labels: [], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: false, needs_response: true, category: 'deal', deal_name: 'NextWave Wireless',
    ai_summary: 'Needs lender legal name and address for insurance certificate update.',
    ai_sentiment: 'needs_attention',
  },
  {
    id: 'mock-9', threadId: 'thread-6',
    subject: 'Draft: Q4 Portfolio Update',
    from_name: 'You', from_email: 'jturner@5thline.co',
    to_name: '', to_email: '',
    snippet: 'Q4 Portfolio Performance Summary: Total AUM increased by 12% quarter-over-quarter driven primarily by...',
    body_preview: 'Q4 Portfolio Performance Summary:\n\nTotal AUM increased by 12% quarter-over-quarter driven primarily by new deal closings and existing portfolio appreciation.\n\n[Draft - needs review]',
    received_at: hoursAgo(3), is_read: true, is_starred: false, folder: 'drafts',
    labels: [], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'internal',
    ai_summary: 'Q4 portfolio update draft — AUM up 12% QoQ.',
    ai_sentiment: 'positive',
  },
  // ─── Additional emails for new categories ───
  {
    id: 'mock-10', threadId: 'thread-7',
    subject: 'Introduction - Growth capital needs for Q2',
    from_name: 'David Kim', from_email: 'dkim@techstartup.io',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Hi, I was referred to you by Maria Gonzalez. We\'re looking to raise $8-10MM in growth capital for our SaaS platform...',
    body_preview: 'Hi,\n\nI was referred to you by Maria Gonzalez. We\'re looking to raise $8-10MM in growth capital for our SaaS platform expansion. Would love to chat about how you might be able to help.\n\nBest,\nDavid',
    received_at: daysAgo(2), is_read: false, is_starred: false, folder: 'inbox',
    labels: [], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: false, needs_response: true, category: 'prospect',
    ai_summary: 'New prospect seeking $8-10MM growth capital for SaaS expansion.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-11', threadId: 'thread-8',
    subject: 'NextWave memo notes ready for your review',
    from_name: 'Gabriela Torres', from_email: 'gtorres@5thline.co',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Hey, I\'ve finished the memo notes for NextWave and tagged you for approval. The lender list is also updated...',
    body_preview: 'Hey,\n\nI\'ve finished the memo notes for NextWave and tagged you for approval. The lender list is also updated with the 6 new contacts from the telecom sector. Should be ready to send out by EOD.\n\nGabriela',
    received_at: daysAgo(1), is_read: true, is_starred: false, folder: 'inbox',
    labels: [], has_attachments: false, is_linked_to_deal: true,
    is_follow_up: false, needs_response: false, category: 'internal', deal_name: 'NextWave Wireless',
    ai_summary: 'Memo notes for NextWave ready; lender list updated with 6 new contacts.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-12', threadId: 'thread-9',
    subject: 'Weekly Deal Pipeline Digest',
    from_name: 'Pipeline Weekly', from_email: 'digest@dealflow.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'This week\'s highlights: 12 new deals sourced, 3 term sheets issued, 1 closing scheduled for next week...',
    body_preview: 'This week\'s highlights:\n\n• 12 new deals sourced\n• 3 term sheets issued\n• 1 closing scheduled for next week\n• Market trends: SaaS multiples holding steady',
    received_at: daysAgo(1), is_read: true, is_starred: false, folder: 'inbox',
    labels: ['Newsletter'], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'newsletter',
    ai_summary: 'Weekly digest: 12 new deals, 3 term sheets, 1 closing next week.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-13', threadId: 'thread-10',
    subject: 'FinConnect 2025 - Speaker Confirmation',
    from_name: 'Events Team', from_email: 'events@finconnect.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Thank you for confirming your attendance at FinConnect 2025. Your panel on "Alternative Lending Strategies" is...',
    body_preview: 'Thank you for confirming your attendance at FinConnect 2025. Your panel on "Alternative Lending Strategies" is scheduled for March 15 at 2:00 PM EST.\n\nPlease review the attached agenda.',
    received_at: daysAgo(3), is_read: true, is_starred: false, folder: 'inbox',
    labels: ['Event'], has_attachments: true, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'conference',
    ai_summary: 'Panel confirmed for FinConnect 2025 on March 15.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-14', threadId: 'thread-11',
    subject: 'Partnership Proposal - DataCore x 5thLine',
    from_name: 'Rachel Wong', from_email: 'rwong@datacore.com',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Hi, following our conversation at the conference, I\'d like to formalize our referral partnership. Attached is...',
    body_preview: 'Hi,\n\nFollowing our conversation at the conference, I\'d like to formalize our referral partnership. Attached is a draft MOU for your review.\n\nLooking forward to working together.\n\nRachel',
    received_at: daysAgo(4), is_read: true, is_starred: true, folder: 'inbox',
    labels: [], has_attachments: true, is_linked_to_deal: false,
    is_follow_up: true, needs_response: true, category: 'partnership',
    ai_summary: 'Partnership MOU draft from DataCore for referral arrangement.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-15', threadId: 'thread-12',
    subject: 'VelocityPay - Deal Successfully Closed',
    from_name: 'Closing Team', from_email: 'closings@5thline.co',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'VelocityPay financing has been successfully closed. $12MM at L+500 with First National. All documents have been...',
    body_preview: 'VelocityPay financing has been successfully closed.\n\n• Amount: $12MM at L+500\n• Lender: First National\n• All documents executed and filed\n• First draw expected within 5 business days',
    received_at: daysAgo(5), is_read: true, is_starred: false, folder: 'inbox',
    labels: ['Closed'], has_attachments: true, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'closed_won', deal_name: 'VelocityPay',
    ai_summary: 'VelocityPay closed: $12MM at L+500 with First National.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-16', threadId: 'thread-13',
    subject: 'Team Standup Notes - Jan 10',
    from_name: 'Gabriela Torres', from_email: 'gtorres@5thline.co',
    to_name: 'You', to_email: 'jturner@5thline.co',
    snippet: 'Notes from today\'s standup: Pipeline review completed, 2 new deals assigned to your desk, follow up with...',
    body_preview: 'Notes from today\'s standup:\n\n• Pipeline review completed\n• 2 new deals assigned to your desk\n• Follow up with Northbrook on TechFlow\n• Data room audit scheduled for Thursday',
    received_at: daysAgo(1), is_read: true, is_starred: false, folder: 'inbox',
    labels: [], has_attachments: false, is_linked_to_deal: false,
    is_follow_up: false, needs_response: false, category: 'internal',
    ai_summary: 'Standup notes: 2 new deals, follow up Northbrook, DR audit Thursday.',
    ai_sentiment: 'neutral',
  },
];

// Thread grouping helpers
export interface EmailThread {
  threadId: string;
  /** Canonical provider (Gmail/Nylas) thread id when known. Preferred persistence key. */
  provider_thread_id?: string | null;
  subject: string;
  emails: MockEmail[];
  latestEmail: MockEmail;
  participants: string[];
  hasUnread: boolean;
  isStarred: boolean;
  isLinked: boolean;
  hasAttachments: boolean;
  needsResponse: boolean;
  dealName?: string;
  category: EmailCategory;
}

export const groupEmailsByThread = (emails: MockEmail[]): EmailThread[] => {
  const threadMap = new Map<string, MockEmail[]>();
  
  emails.forEach(email => {
    // Group by canonical provider thread id when available so that messages
    // belonging to the same Gmail thread always coalesce — even if the local
    // `threadId` fell back to a per-message id during mapping.
    const key = email.provider_thread_id || email.threadId;
    const existing = threadMap.get(key) || [];
    existing.push(email);
    threadMap.set(key, existing);
  });

  const threads: EmailThread[] = [];
  threadMap.forEach((threadEmails, threadId) => {
    const sorted = [...threadEmails].sort(
      (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    );
    const latest = sorted[0];
    const participantSet = new Set<string>();
    threadEmails.forEach(e => {
      if (e.from_name !== 'You') participantSet.add(e.from_name);
    });

    threads.push({
      threadId,
      provider_thread_id: latest.provider_thread_id ?? null,
      subject: latest.subject.replace(/^Re:\s*/i, ''),
      emails: sorted,
      latestEmail: latest,
      participants: Array.from(participantSet),
      hasUnread: threadEmails.some(e => !e.is_read),
      isStarred: threadEmails.some(e => e.is_starred),
      isLinked: threadEmails.some(e => e.is_linked_to_deal),
      hasAttachments: threadEmails.some(e => e.has_attachments),
      needsResponse: threadEmails.some(e => e.needs_response),
      dealName: latest.deal_name,
      category: latest.category,
    });
  });

  return threads.sort(
    (a, b) => new Date(b.latestEmail.received_at).getTime() - new Date(a.latestEmail.received_at).getTime()
  );
};

export const getEmailsByFolder = (folder: MockEmail['folder']) =>
  mockEmails.filter(e => e.folder === folder);

export const getLinkedEmails = () =>
  mockEmails.filter(e => e.is_linked_to_deal);

export const getUnreadCount = (folder: MockEmail['folder']) =>
  mockEmails.filter(e => e.folder === folder && !e.is_read).length;

// Avatar color generation based on name
const avatarColors = [
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400',
  'bg-rose-500/20 text-rose-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-indigo-500/20 text-indigo-400',
  'bg-pink-500/20 text-pink-400',
];

export const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
};
