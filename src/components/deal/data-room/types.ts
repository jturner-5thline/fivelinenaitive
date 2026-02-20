import type { ChecklistItem } from '@/hooks/useDataRoomChecklist';
import type { DealChecklistItem } from '@/hooks/useDealChecklistItems';
import type { DealAttachment } from '@/hooks/useDealAttachments';
import type { FileChecklistMapping } from '@/hooks/useFileChecklistMap';

export type UnifiedChecklistItem = (ChecklistItem & { is_deal_specific?: false }) | DealChecklistItem;

export type StatusFilter = 'all' | 'complete' | 'missing' | 'required' | 'has_files' | 'overdue';

export interface SectionProgress {
  total: number;
  completed: number;
  required: number;
  requiredCompleted: number;
}

export interface ProgressData {
  overall: number;
  totalItems: number;
  completedItems: number;
  requiredTotal: number;
  requiredCompleted: number;
  sections: Record<string, SectionProgress>;
}

export interface DataRoomContextValue {
  dealId: string;
  allItems: UnifiedChecklistItem[];
  grouped: Record<string, UnifiedChecklistItem[]>;
  categories: string[];
  attachments: DealAttachment[];
  unmappedFiles: DealAttachment[];
  statusMap: Map<string, { isComplete: boolean; attachmentId: string | null }>;
  progressData: ProgressData;
  selectedItemId: string | null;
  setSelectedItemId: (id: string | null) => void;
  selectedItem: UnifiedChecklistItem | null;
  selectedItemFiles: DealAttachment[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (f: StatusFilter) => void;
  previewFile: DealAttachment | null;
  setPreviewFile: (f: DealAttachment | null) => void;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  getFilesForItem: (id: string) => FileChecklistMapping[];
  getItemsForFile: (id: string) => FileChecklistMapping[];
  mapFileToItem: (fileId: string, itemId: string, source: FileChecklistMapping['mapping_source']) => Promise<boolean>;
  mapFileToItems: (fileId: string, itemIds: string[], source: FileChecklistMapping['mapping_source']) => Promise<number>;
  unmapFile: (fileId: string, itemId: string) => Promise<boolean>;
  handleUploadFiles: (files: File[], targetItemId?: string) => Promise<void>;
  handleDownloadFile: (att: DealAttachment) => void;
  deleteAttachment: (att: DealAttachment) => Promise<boolean>;
  getCategoryByName: (name: string) => any;
}
