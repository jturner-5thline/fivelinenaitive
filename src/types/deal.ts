export type DealStage = 'prospecting' | 'initial-review' | 'due-diligence' | 'term-sheet' | 'closing' | 'closed';

export type DealStatus = 'on-track' | 'at-risk' | 'off-track' | 'on-hold' | 'archived';

export type EngagementType = 'guided' | 'advisory' | 'managed-process';

export interface Deal {
  id: string;
  name: string;
  company: string;
  stage: DealStage;
  status: DealStatus;
  engagementType: EngagementType;
  manager: string;
  lender: string;
  value: number;
  contact: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

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
  'First National Bank',
  'Capital One',
  'JPMorgan Chase',
  'Wells Fargo',
  'Bank of America',
  'Goldman Sachs',
];
