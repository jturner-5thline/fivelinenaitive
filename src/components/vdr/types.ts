export type VdrView = 'chat-dataroom' | 'irl-tracker' | 'incoming-data' | 'tasks';

export type VdrDealStatus = 'ready' | 'in_progress' | 'review' | 'closed';

export interface VdrDocument {
  id: string;
  deal_id: string;
  company_id: string | null;
  filename: string;
  file_path: string | null;
  file_size: number;
  file_type: string | null;
  folder_path: string;
  is_folder: boolean;
  source: 'dataroom' | 'incoming' | 'team_comms';
  uploaded_by: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VdrIrlRequest {
  id: string;
  deal_id: string;
  company_id: string | null;
  request_number: string | null;
  request_name: string;
  description: string | null;
  category: string | null;
  status: 'open' | 'addressed' | 'pending_review';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VdrTask {
  id: string;
  deal_id: string;
  company_id: string | null;
  task_name: string;
  task_type: 'tie_out' | 'compliance_review' | 'financial_analysis' | 'legal_review' | 'tax_analysis' | 'custom';
  description: string | null;
  instructions: string | null;
  assignee: string | null;
  hours_allocated: number;
  status: 'not_started' | 'in_progress' | 'complete';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const VDR_DEFAULT_FOLDERS = [
  '0.0 Data Room Index',
  '1.0 Corporate',
  '2.0 Financial',
  '3.0 Tax',
  '4.0 Legal and Compliance',
  '5.0 Contracts',
  '6.0 Intellectual Property',
  '7.0 Human Resources',
  '8.0 Insurance',
  '9.0 Real Estate',
  '10.0 IT and Technology',
  '11.0 Environmental',
  '12.0 M&A History',
  'Team Communications',
];
