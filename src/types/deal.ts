export type DealStage = 'prospecting' | 'initial-review' | 'due-diligence' | 'term-sheet' | 'closing' | 'closed';

export type DealStatus = 'on-track' | 'at-risk' | 'off-track' | 'on-hold' | 'archived';

export type EngagementType = 'guided' | 'advisory' | 'managed-process';

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
  companyDescription?: string;
  companyUrl?: string;
  businessModel?: string;
  contactInfo?: string;
  stage: DealStage;
  status: DealStatus;
  engagementType: EngagementType;
  dealTypes?: string[]; // Array of deal type IDs
  manager: string;
  lender: string;
  value: number;
  totalFee: number;
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
  'prospecting': { label: 'Prospecting', color: 'bg-slate-500' },
  'initial-review': { label: 'Initial Review', color: 'bg-blue-500' },
  'due-diligence': { label: 'Due Diligence', color: 'bg-amber-500' },
  'term-sheet': { label: 'Term Sheet', color: 'bg-purple-500' },
  'closing': { label: 'Closing', color: 'bg-cyan-500' },
  'closed': { label: 'Closed', color: 'bg-success' },
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
