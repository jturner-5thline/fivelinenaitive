import { Deal } from '@/types/deal';

// Helper to generate recent dates for demo purposes
const getRecentDate = (minutesAgo: number) => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutesAgo);
  return date.toISOString();
};

export const mockDeals: Deal[] = [
  {
    id: '1',
    name: 'Series B Investment',
    company: 'TechFlow Solutions',
    stage: 'due-diligence',
    status: 'on-track',
    engagementType: 'guided',
    manager: 'Paz',
    lender: 'JPMorgan Chase',
    value: 15000000,
    contact: 'John Smith',
    createdAt: '2024-01-15',
    updatedAt: getRecentDate(15), // 15 minutes ago
    notes: 'Strong revenue growth, expanding to APAC market',
  },
  {
    id: '2',
    name: 'Growth Equity Round',
    company: 'MediCare Plus',
    stage: 'initial-review',
    status: 'at-risk',
    engagementType: 'advisory',
    manager: 'James',
    lender: 'Wells Fargo',
    value: 8500000,
    contact: 'Jane Doe',
    createdAt: '2024-01-18',
    updatedAt: getRecentDate(180), // 3 hours ago
  },
  {
    id: '3',
    name: 'Acquisition Target',
    company: 'FinServ Global',
    stage: 'term-sheet',
    status: 'on-track',
    engagementType: 'managed-process',
    manager: 'Niki',
    lender: 'Goldman Sachs',
    value: 45000000,
    contact: 'Robert Johnson',
    createdAt: '2024-01-10',
    updatedAt: getRecentDate(60 * 20), // 20 hours ago
    notes: 'Final terms under review',
  },
  {
    id: '4',
    name: 'Seed Investment',
    company: 'GreenEnergy Co',
    stage: 'prospecting',
    status: 'off-track',
    engagementType: 'guided',
    manager: 'Paz',
    lender: 'First National Bank',
    value: 2500000,
    contact: 'Emily Davis',
    createdAt: '2024-01-20',
    updatedAt: getRecentDate(60 * 24 * 3), // 3 days ago
  },
  {
    id: '5',
    name: 'Series A Extension',
    company: 'CloudMatrix',
    stage: 'closed',
    status: 'archived',
    engagementType: 'advisory',
    manager: 'James',
    lender: 'Capital One',
    value: 12000000,
    contact: 'Chris Wilson',
    createdAt: '2024-01-05',
    updatedAt: getRecentDate(60 * 24 * 14), // 2 weeks ago
    notes: 'Successfully closed Q1 2024',
  },
  {
    id: '6',
    name: 'Minority Stake',
    company: 'BuildRight Construction',
    stage: 'closing',
    status: 'on-hold',
    engagementType: 'managed-process',
    manager: 'Niki',
    lender: 'Bank of America',
    value: 6000000,
    contact: 'Amanda Brown',
    createdAt: '2024-01-08',
    updatedAt: getRecentDate(60 * 24 * 45), // over 30 days
    notes: 'Awaiting regulatory approval',
  },
  {
    id: '7',
    name: 'Bridge Financing',
    company: 'RetailNext',
    stage: 'due-diligence',
    status: 'on-track',
    engagementType: 'guided',
    manager: 'Paz',
    lender: 'JPMorgan Chase',
    value: 4000000,
    contact: 'Lisa Wong',
    createdAt: '2024-01-12',
    updatedAt: getRecentDate(60 * 5), // 5 hours ago
  },
  {
    id: '8',
    name: 'Strategic Partnership',
    company: 'DataDriven Analytics',
    stage: 'initial-review',
    status: 'at-risk',
    engagementType: 'advisory',
    manager: 'James',
    lender: 'Wells Fargo',
    value: 18000000,
    contact: 'James Miller',
    createdAt: '2024-01-19',
    updatedAt: getRecentDate(60 * 24 * 5), // 5 days ago
  },
];
