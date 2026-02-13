export interface MockEmail {
  id: string;
  threadId: string;
  subject: string;
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  snippet: string;
  body_preview: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
  folder: 'inbox' | 'sent' | 'drafts';
  labels: string[];
  has_attachments: boolean;
  is_linked_to_deal: boolean;
  ai_summary?: string;
  ai_sentiment?: 'positive' | 'neutral' | 'needs_attention';
}

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockEmails: MockEmail[] = [
  {
    id: 'mock-1',
    threadId: 'thread-1',
    subject: 'Term Sheet - Series B Financing',
    from_name: 'Sarah Chen',
    from_email: 'sarah.chen@capitalpartners.com',
    to_name: 'You',
    to_email: 'jturner@5thline.co',
    snippet: 'Hi, please find attached the revised term sheet for the Series B round. We have updated the valuation cap and...',
    body_preview: 'Hi,\n\nPlease find attached the revised term sheet for the Series B round. We have updated the valuation cap and liquidation preferences as discussed in our last call.\n\nLet me know if you have any questions.\n\nBest,\nSarah',
    received_at: hoursAgo(2),
    is_read: false,
    is_starred: true,
    folder: 'inbox',
    labels: ['Important', 'Finance'],
    has_attachments: true,
    is_linked_to_deal: true,
    ai_summary: 'Revised term sheet with updated valuation cap and liquidation preferences.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-6',
    threadId: 'thread-1',
    subject: 'Re: Term Sheet - Series B Financing',
    from_name: 'You',
    from_email: 'jturner@5thline.co',
    to_name: 'Sarah Chen',
    to_email: 'sarah.chen@capitalpartners.com',
    snippet: 'Hi Sarah, thank you for the revised term sheet. We have reviewed it internally and have a few comments on the...',
    body_preview: 'Hi Sarah,\n\nThank you for the revised term sheet. We have reviewed it internally and have a few comments on the anti-dilution provisions. Can we schedule a call this week to discuss?\n\nBest,\nJack',
    received_at: hoursAgo(1),
    is_read: true,
    is_starred: false,
    folder: 'sent',
    labels: [],
    has_attachments: false,
    is_linked_to_deal: true,
    ai_summary: 'Requesting call to discuss anti-dilution provisions in the term sheet.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-2',
    threadId: 'thread-2',
    subject: 'Re: Due Diligence Checklist Update',
    from_name: 'Michael Roberts',
    from_email: 'mroberts@legalpro.com',
    to_name: 'You',
    to_email: 'jturner@5thline.co',
    snippet: 'We have completed the review of items 1-15 on the checklist. Still pending are the environmental reports and...',
    body_preview: 'We have completed the review of items 1-15 on the checklist. Still pending are the environmental reports and the IP assignment agreements. Can you provide an ETA on those?\n\nThanks,\nMichael',
    received_at: hoursAgo(5),
    is_read: true,
    is_starred: false,
    folder: 'inbox',
    labels: ['Legal'],
    has_attachments: false,
    is_linked_to_deal: true,
    ai_summary: 'DD items 1-15 done; awaiting environmental reports and IP assignments.',
    ai_sentiment: 'needs_attention',
  },
  {
    id: 'mock-7',
    threadId: 'thread-2',
    subject: 'Re: Due Diligence Checklist Update',
    from_name: 'You',
    from_email: 'jturner@5thline.co',
    to_name: 'Michael Roberts',
    to_email: 'mroberts@legalpro.com',
    snippet: 'Hi Michael, please find attached the second batch of due diligence documents including the environmental...',
    body_preview: 'Hi Michael,\n\nPlease find attached the second batch of due diligence documents including the environmental assessment report and IP schedules.\n\nLet me know if anything is missing.\n\nBest,\nJack',
    received_at: daysAgo(1),
    is_read: true,
    is_starred: false,
    folder: 'sent',
    labels: [],
    has_attachments: true,
    is_linked_to_deal: true,
    ai_summary: 'Sent environmental assessment and IP schedules for DD review.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-3',
    threadId: 'thread-3',
    subject: 'Meeting Follow-up: Lender Introduction',
    from_name: 'Amanda Liu',
    from_email: 'amanda@bridgecap.com',
    to_name: 'You',
    to_email: 'jturner@5thline.co',
    snippet: 'Great meeting today! As discussed, I will connect you with our credit team next week. They are particularly...',
    body_preview: 'Great meeting today! As discussed, I will connect you with our credit team next week. They are particularly interested in the cash flow projections for Q3-Q4.\n\nLooking forward to it.\n\nAmanda',
    received_at: hoursAgo(8),
    is_read: true,
    is_starred: true,
    folder: 'inbox',
    labels: [],
    has_attachments: false,
    is_linked_to_deal: false,
    ai_summary: 'Credit team intro next week; they want Q3-Q4 cash flow projections.',
    ai_sentiment: 'positive',
  },
  {
    id: 'mock-8',
    threadId: 'thread-3',
    subject: 'Re: Meeting Follow-up: Lender Introduction',
    from_name: 'You',
    from_email: 'jturner@5thline.co',
    to_name: 'Amanda Liu',
    to_email: 'amanda@bridgecap.com',
    snippet: 'Amanda, following up on our conversation. I have prepared the preliminary credit package with the...',
    body_preview: 'Amanda,\n\nFollowing up on our conversation. I have prepared the preliminary credit package with the financial projections and company overview. Happy to schedule a call with your credit team.\n\nBest,\nJack',
    received_at: daysAgo(3),
    is_read: true,
    is_starred: false,
    folder: 'sent',
    labels: [],
    has_attachments: true,
    is_linked_to_deal: false,
    ai_summary: 'Credit package prepared; ready to schedule call with credit team.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-4',
    threadId: 'thread-4',
    subject: 'Updated Financial Model v3.2',
    from_name: 'David Park',
    from_email: 'dpark@acmecorp.com',
    to_name: 'You',
    to_email: 'jturner@5thline.co',
    snippet: 'Attached is the updated financial model incorporating the revised revenue assumptions. Key changes include...',
    body_preview: 'Attached is the updated financial model incorporating the revised revenue assumptions. Key changes include:\n\n1. Adjusted EBITDA margins for Year 2-3\n2. Updated customer acquisition costs\n3. New sensitivity analysis\n\nPlease review at your convenience.',
    received_at: daysAgo(1),
    is_read: false,
    is_starred: false,
    folder: 'inbox',
    labels: ['Finance'],
    has_attachments: true,
    is_linked_to_deal: true,
    ai_summary: 'Financial model v3.2 with revised EBITDA margins and sensitivity analysis.',
    ai_sentiment: 'neutral',
  },
  {
    id: 'mock-5',
    threadId: 'thread-5',
    subject: 'Insurance Certificate Request',
    from_name: 'Lisa Thompson',
    from_email: 'lthompson@insureco.com',
    to_name: 'You',
    to_email: 'jturner@5thline.co',
    snippet: 'Per our conversation, we need the updated certificate of insurance naming the new lender as additionally...',
    body_preview: 'Per our conversation, we need the updated certificate of insurance naming the new lender as additionally insured. Please provide the lender\'s full legal name and address.',
    received_at: daysAgo(2),
    is_read: true,
    is_starred: false,
    folder: 'inbox',
    labels: [],
    has_attachments: false,
    is_linked_to_deal: false,
    ai_summary: 'Needs lender legal name and address for insurance certificate update.',
    ai_sentiment: 'needs_attention',
  },
  {
    id: 'mock-9',
    threadId: 'thread-6',
    subject: 'Draft: Q4 Portfolio Update',
    from_name: 'You',
    from_email: 'jturner@5thline.co',
    to_name: '',
    to_email: '',
    snippet: 'Q4 Portfolio Performance Summary: Total AUM increased by 12% quarter-over-quarter driven primarily by...',
    body_preview: 'Q4 Portfolio Performance Summary:\n\nTotal AUM increased by 12% quarter-over-quarter driven primarily by new deal closings and existing portfolio appreciation.\n\n[Draft - needs review]',
    received_at: hoursAgo(3),
    is_read: true,
    is_starred: false,
    folder: 'drafts',
    labels: [],
    has_attachments: false,
    is_linked_to_deal: false,
    ai_summary: 'Q4 portfolio update draft — AUM up 12% QoQ.',
    ai_sentiment: 'positive',
  },
];

// Thread grouping helpers
export interface EmailThread {
  threadId: string;
  subject: string;
  emails: MockEmail[];
  latestEmail: MockEmail;
  participants: string[];
  hasUnread: boolean;
  isStarred: boolean;
  isLinked: boolean;
  hasAttachments: boolean;
}

export const groupEmailsByThread = (emails: MockEmail[]): EmailThread[] => {
  const threadMap = new Map<string, MockEmail[]>();
  
  emails.forEach(email => {
    const existing = threadMap.get(email.threadId) || [];
    existing.push(email);
    threadMap.set(email.threadId, existing);
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
      subject: latest.subject.replace(/^Re:\s*/i, ''),
      emails: sorted,
      latestEmail: latest,
      participants: Array.from(participantSet),
      hasUnread: threadEmails.some(e => !e.is_read),
      isStarred: threadEmails.some(e => e.is_starred),
      isLinked: threadEmails.some(e => e.is_linked_to_deal),
      hasAttachments: threadEmails.some(e => e.has_attachments),
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
