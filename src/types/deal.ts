export type DealStatus = 'sourcing' | 'screening' | 'due-diligence' | 'negotiation' | 'closed-won' | 'closed-lost';

export type DealSize = 'small' | 'medium' | 'large' | 'enterprise';

export interface Deal {
  id: string;
  name: string;
  company: string;
  status: DealStatus;
  value: number;
  industry: string;
  contact: string;
  createdAt: string;
  updatedAt: string;
  priority: 'low' | 'medium' | 'high';
  notes?: string;
}

export const STATUS_CONFIG: Record<DealStatus, { label: string; color: string }> = {
  'sourcing': { label: 'Sourcing', color: 'bg-slate-500' },
  'screening': { label: 'Screening', color: 'bg-blue-500' },
  'due-diligence': { label: 'Due Diligence', color: 'bg-amber-500' },
  'negotiation': { label: 'Negotiation', color: 'bg-purple-500' },
  'closed-won': { label: 'Closed Won', color: 'bg-success' },
  'closed-lost': { label: 'Closed Lost', color: 'bg-destructive' },
};

export const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Manufacturing',
  'Consumer Goods',
  'Energy',
  'Real Estate',
  'Professional Services',
];
