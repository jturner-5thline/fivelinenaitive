export type VdrView = 'chat-dataroom';

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
  ingestion_status: 'pending' | 'processing' | 'complete' | 'failed' | null;
  chunk_count: number;
  entity_count: number;
  shared_to_dataroom: boolean;
  /**
   * Optional Data Room folder location. When set, the file appears in this
   * folder in the Data Room column. When null and shared_to_dataroom=true,
   * the Data Room view falls back to `folder_path`. Tracked separately from
   * `folder_path` (Internal location) so the two columns can be reorganized
   * independently after a file has been shared.
   */
  dataroom_folder_path: string | null;
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

/** @deprecated Use data_room_checklist_categories table instead */
export const VDR_DEFAULT_FOLDERS: string[] = [];
