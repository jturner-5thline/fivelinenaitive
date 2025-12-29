export type DealStage = 'final-credit-items' | 'client-strategy-review' | 'write-up-pending' | 'submitted-to-lenders' | 'lenders-in-review' | 'terms-issued' | 'in-due-diligence' | 'funded-invoiced' | 'closed-won' | 'closed-lost' | 'on-hold';

export type DealStatus = 'on-track' | 'at-risk' | 'off-track' | 'on-hold' | 'archived';

export type EngagementType = 'guided' | 'advisory' | 'managed-process';

export type ExclusivityType = 'exclusive' | 'non-exclusive' | 'modified-exclusive';

export type LenderStatus = 'in-review' | 'terms-issued' | 'in-diligence' | 'closed-funded';

export type LenderStage = string;

export type LenderSubstage = string;

export type LenderTrackingStatus = 'active' | 'on-hold' | 'on-deck' | 'passed';

export interface LenderNoteHistory {
  text: string;
  updatedAt: string;
}

export interface DealLender {
  id: string;
  name: string;
  status: LenderStatus;
  stage: LenderStage;
  substage?: LenderSubstage;
  trackingStatus: LenderTrackingStatus;
  passReason?: string;
  notes?: string;
  notesUpdatedAt?: string;
  notesHistory?: LenderNoteHistory[];
  savedNotes?: string;
  updatedAt?: string; // Last update timestamp for the lender
}

export interface DealMilestone {
  id: string;
  title: string;
  dueDate?: string;
  completed: boolean;
  completedAt?: string;
  position?: number;
}

export interface Referrer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

export interface Deal {
  id: string;
  name: string;
  company: string;
  narrative?: string;
  companyUrl?: string;
  businessModel?: string;
  contactInfo?: string;
  stage: DealStage;
  status: DealStatus;
  engagementType: EngagementType;
  exclusivity?: ExclusivityType;
  dealTypes?: string[]; // Array of deal type IDs
  manager: string;
  lender: string;
  value: number;
  totalFee: number;
  retainerFee?: number;
  milestoneFee?: number;
  successFeePercent?: number;
  preSigningHours?: number;
  postSigningHours?: number;
  referredBy?: Referrer;
  contact: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  lenders?: DealLender[];
  milestones?: DealMilestone[];
}

export const LENDER_STATUS_CONFIG: Record<LenderStatus, { label: string }> = {
  'in-review': { label: 'In Review' },
  'terms-issued': { label: 'Terms Issued' },
  'in-diligence': { label: 'In Diligence' },
  'closed-funded': { label: 'Closed & Funded' },
};

export const LENDER_STAGE_CONFIG: Record<LenderStage, { label: string }> = {
  'reviewing-drl': { label: 'Reviewing DRL' },
  'management-call-set': { label: 'Management Call Set' },
  'management-call-completed': { label: 'Management Call Completed' },
  'draft-terms': { label: 'Draft Terms' },
  'term-sheets': { label: 'Term Sheets' },
};

export const LENDER_TRACKING_STATUS_CONFIG: Record<LenderTrackingStatus, { label: string; color: string }> = {
  'active': { label: 'Active', color: 'bg-green-500' },
  'on-hold': { label: 'On Hold', color: 'bg-yellow-500' },
  'on-deck': { label: 'On Deck', color: 'bg-blue-500' },
  'passed': { label: 'Passed', color: 'bg-muted' },
};

export const STAGE_CONFIG: Record<DealStage, { label: string; color: string }> = {
  'final-credit-items': { label: 'Final Credit Items', color: 'bg-slate-500' },
  'client-strategy-review': { label: 'Client Strategy Review', color: 'bg-blue-500' },
  'write-up-pending': { label: 'Write-Up Pending', color: 'bg-indigo-500' },
  'submitted-to-lenders': { label: 'Submitted to Lenders', color: 'bg-violet-500' },
  'lenders-in-review': { label: 'Lenders in Review', color: 'bg-purple-500' },
  'terms-issued': { label: 'Terms Issued', color: 'bg-fuchsia-500' },
  'in-due-diligence': { label: 'In Due Diligence', color: 'bg-amber-500' },
  'funded-invoiced': { label: 'Funded / Invoiced', color: 'bg-cyan-500' },
  'closed-won': { label: 'Closed Won', color: 'bg-success' },
  'closed-lost': { label: 'Closed Lost', color: 'bg-destructive' },
  'on-hold': { label: 'On Hold', color: 'bg-muted' },
};

export const STATUS_CONFIG: Record<DealStatus, { label: string; dotColor: string; badgeColor: string }> = {
  'on-track': { label: 'On Track', dotColor: 'bg-green-500', badgeColor: 'bg-green-500' },
  'at-risk': { label: 'At Risk', dotColor: 'bg-yellow-500', badgeColor: 'bg-yellow-500' },
  'off-track': { label: 'Off Track', dotColor: 'bg-red-500', badgeColor: 'bg-red-500' },
  'on-hold': { label: 'On Hold', dotColor: 'bg-blue-500', badgeColor: 'bg-blue-500' },
  'archived': { label: 'Archived', dotColor: 'bg-orange-500', badgeColor: 'bg-orange-500' },
};

export const ENGAGEMENT_TYPE_CONFIG: Record<EngagementType, { label: string }> = {
  'guided': { label: 'Guided' },
  'advisory': { label: 'Advisory' },
  'managed-process': { label: 'Managed Process' },
};

export const EXCLUSIVITY_CONFIG: Record<ExclusivityType, { label: string }> = {
  'exclusive': { label: 'Exclusive' },
  'non-exclusive': { label: 'Non-Exclusive' },
  'modified-exclusive': { label: 'Modified Excl.' },
};

export const MANAGERS = [
  'Paz',
  'James',
  'Niki',
];

export const LENDERS = [
  'Decathlon',
  'Eastward',
  'TIMIA',
  'SaaS Capital',
  'Trinity',
  'LAGO',
  'Republic Business Credit',
  'SLR',
  'Matterhorn',
  'Five Crowns',
  'nFusion',
  'Advantage',
  'SG',
];
