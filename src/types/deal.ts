export type DealStage = 'prospecting' | 'initial-review' | 'due-diligence' | 'term-sheet' | 'closing' | 'closed';

export type DealStatus = 'active' | 'on-hold' | 'pending' | 'completed' | 'cancelled';

export type EngagementType = 'direct' | 'syndicated' | 'club-deal' | 'sole-lender';

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

export const STATUS_CONFIG: Record<DealStatus, { label: string; color: string }> = {
  'active': { label: 'Active', color: 'bg-success' },
  'on-hold': { label: 'On Hold', color: 'bg-amber-500' },
  'pending': { label: 'Pending', color: 'bg-blue-500' },
  'completed': { label: 'Completed', color: 'bg-slate-500' },
  'cancelled': { label: 'Cancelled', color: 'bg-destructive' },
};

export const ENGAGEMENT_TYPE_CONFIG: Record<EngagementType, { label: string }> = {
  'direct': { label: 'Direct' },
  'syndicated': { label: 'Syndicated' },
  'club-deal': { label: 'Club Deal' },
  'sole-lender': { label: 'Sole Lender' },
};

export const MANAGERS = [
  'Sarah Chen',
  'Michael Roberts',
  'Jennifer Walsh',
  'David Park',
  'Emma Thompson',
];

export const LENDERS = [
  'First National Bank',
  'Capital One',
  'JPMorgan Chase',
  'Wells Fargo',
  'Bank of America',
  'Goldman Sachs',
];
