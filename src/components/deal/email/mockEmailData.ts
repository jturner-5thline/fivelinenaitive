export interface MockEmail {
  id: string;
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
}

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export const mockEmails: MockEmail[] = [
  {
    id: 'mock-1',
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
  },
  {
    id: 'mock-2',
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
  },
  {
    id: 'mock-3',
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
  },
  {
    id: 'mock-4',
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
  },
  {
    id: 'mock-5',
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
  },
  {
    id: 'mock-6',
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
  },
  {
    id: 'mock-7',
    subject: 'Due Diligence Documents - Batch 2',
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
  },
  {
    id: 'mock-8',
    subject: 'Introduction: Bridge Capital Credit Team',
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
  },
  {
    id: 'mock-9',
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
  },
];

export const getEmailsByFolder = (folder: MockEmail['folder']) =>
  mockEmails.filter(e => e.folder === folder);

export const getLinkedEmails = () =>
  mockEmails.filter(e => e.is_linked_to_deal);

export const getUnreadCount = (folder: MockEmail['folder']) =>
  mockEmails.filter(e => e.folder === folder && !e.is_read).length;
