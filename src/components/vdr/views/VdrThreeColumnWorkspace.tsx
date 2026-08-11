import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, FileText,
  FileSpreadsheet, Presentation, Eye, Loader2, CheckCircle2, AlertCircle,
  ClipboardList, PackagePlus, Send, FolderPlus, Trash2, Download,
  ArrowRight, ArrowLeft, Lock, Globe, MoreHorizontal, Upload, Info,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { VdrDocument } from '../types';
import { VdrExportButton } from '../VdrExportButton';
import { BulkUploadStep } from '../BulkUploadStep';
import { BulkMappingTable } from '../BulkMappingTable';
import { useDefaultChecklistConfig, findMatchingConfig, type RoundConfig } from '@/hooks/useDefaultChecklistConfig';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useUploadedItems } from '@/hooks/useUploadedItems';
import { useChecklistCategories } from '@/hooks/useChecklistCategories';
import { useDealOutstandingItemsByKey } from '@/hooks/useDealOutstandingItemsByKey';
import { useDealCustomFolders } from '@/hooks/useDealCustomFolders';
import { useVdrFolderPreferences } from '@/hooks/useVdrFolderPreferences';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { canUse5thLineProprietaryActions } from '@/lib/proprietaryAccess';
import { LinkDriveFolderDialog } from '../LinkDriveFolderDialog';
import { downloadUrlAsFile } from '@/lib/downloadFile';

interface Props {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
  canPushToFlex?: boolean;
  isPushingToFlex?: boolean;
  onPushToFlex?: () => void;
  companyId?: string | null;
  mappingRefreshKey?: number;
}

function getFileIcon(name: string, className = 'h-3.5 w-3.5') {
  const safeName = typeof name === 'string' ? name : '';
  const ext = safeName.includes('.') ? safeName.split('.').pop()?.toLowerCase() : '';
  if (ext === 'pdf') return <FileText className={cn(className, 'text-red-400')} />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet className={cn(className, 'text-green-400')} />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className={cn(className, 'text-blue-400')} />;
  if (['ppt', 'pptx'].includes(ext || '')) return <Presentation className={cn(className, 'text-orange-400')} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <Eye className={cn(className, 'text-purple-400')} />;
  return <FileText className={cn(className, 'text-foreground/70')} />;
}

function getIngestionIcon(status: string | null | undefined) {
  if (status === 'processing') return <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />;
  if (status === 'complete') return <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />;
  if (status === 'failed') return <AlertCircle className="h-2.5 w-2.5 text-red-400" />;
  return <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />;
}

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DRAG_MIME = 'application/x-vdr-doc-ids';
// When a whole category header is dragged from Internal, we serialize the
// category name + the IDs of every file currently visible in it so a drop
// can bulk-share + (optionally) re-categorise into a Data Room folder.
const DRAG_CATEGORY_MIME = 'application/x-vdr-category';
// Drag a folder header to reorder it within the same column. Distinct from
// DRAG_CATEGORY_MIME (which moves files), so reorder drops are unambiguous.
const DRAG_FOLDER_REORDER_MIME = 'application/x-vdr-folder-reorder';

// Folders that live ONLY in the Internal column and can NEVER be shared to
// the external Data Room. Files inside these folders are always suppressed
// from Data Room views and every share code-path filters them out.
const INTERNAL_ONLY_CATEGORY_NAMES = ['Terms'] as const;
const INTERNAL_ONLY_CATEGORY_SET = new Set<string>(INTERNAL_ONLY_CATEGORY_NAMES);

/** True when a document's Internal folder is one of the internal-only folders. */
function isInternalOnlyDoc(doc: VdrDocument | undefined | null): boolean {
  if (!doc) return false;
  const fp = (doc.folder_path || '').replace(/^\/+|\/+$/g, '');
  if (!fp) return false;
  if (INTERNAL_ONLY_CATEGORY_SET.has(fp)) return true;
  const top = fp.split('/')[0];
  return INTERNAL_ONLY_CATEGORY_SET.has(top);
}

export function VdrThreeColumnWorkspace({
  dealId, documents, documentsLoading, onPreview, vdrDocs,
  canPushToFlex, isPushingToFlex, onPushToFlex, companyId, mappingRefreshKey,
}: Props) {
  // Shared state
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();
  const canLinkDrive = canUse5thLineProprietaryActions(user);
  const [driveDialogOpen, setDriveDialogOpen] = useState(false);
  // Active category context — uploads and new files default to this
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Collapsed category sections (per column)
  const [collapsedInternal, setCollapsedInternal] = useState<Set<string>>(new Set());
  const [collapsedDataroom, setCollapsedDataroom] = useState<Set<string>>(new Set());
  // Synced with the deal's outstanding_items table — single source of truth for
  // checklist completion (also reflected in the Outstanding Items panel).
  const outstandingSync = useDealOutstandingItemsByKey(dealId);

  // Per-column selection
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [dataroomSelected, setDataroomSelected] = useState<Set<string>>(new Set());

  // Drag state
  const [dropTarget, setDropTarget] = useState<'internal' | 'dataroom' | null>(null);
  // Drop target for an individual Data Room folder header (custom or default)
  const [dropFolderTarget, setDropFolderTarget] = useState<string | null>(null);

  // Bulk upload flow
  const [bulkUploadStep, setBulkUploadStep] = useState<'none' | 'upload' | 'mapping'>('none');
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null);

  // Dialogs
  const [renameDialog, setRenameDialog] = useState<{ id: string; currentName: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState<{ parentPath: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  // Custom-per-deal Data Room folder dialog
  const [showCustomFolderDialog, setShowCustomFolderDialog] = useState(false);
  const [customFolderName, setCustomFolderName] = useState('');
  const [customFolderToDelete, setCustomFolderToDelete] = useState<{ id: string; name: string } | null>(null);

  const internalFileInput = useRef<HTMLInputElement>(null);
  const dataroomFileInput = useRef<HTMLInputElement>(null);

  // Load default categories (Settings-driven via data_room_checklist_categories)
  const { categories, loading: categoriesLoading } = useChecklistCategories();
  // Per-deal custom Data Room folders (visible only in this deal's Data Room column)
  const {
    folders: customFolders,
    createFolder: createCustomFolder,
    deleteFolder: deleteCustomFolder,
  } = useDealCustomFolders(dealId);

  // Per-user, per-deal folder ordering + last-used drop targets.
  // Internal and Data Room are stored under separate keys.
  const internalFolderPrefs = useVdrFolderPreferences(dealId, 'internal');
  const dataroomFolderPrefs = useVdrFolderPreferences(dealId, 'dataroom');

  // Checklist
  const uploadedItems = useUploadedItems(dealId, bulkBatchId);
  const { config: checklistConfig, loading: checklistLoading } = useDefaultChecklistConfig(companyId ?? undefined);
  const { dealTypes: dealTypeOptions } = useDealTypes();
  const { deals } = useDealsContext();
  const currentDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);
  const dealTypeLabel = useMemo(() => {
    const typeIds = currentDeal?.dealTypes;
    if (!typeIds || typeIds.length === 0) return '';
    const matched = dealTypeOptions.find(dt => typeIds.includes(dt.id));
    return matched?.label || typeIds[0] || '';
  }, [currentDeal?.dealTypes, dealTypeOptions]);
  const matchedConfig = useMemo(() => {
    if (!dealTypeLabel || !checklistConfig.configs.length) return null;
    return findMatchingConfig(checklistConfig.configs, dealTypeLabel);
  }, [dealTypeLabel, checklistConfig.configs]);

  const initialRound = useMemo(
    () => matchedConfig?.rounds.find(r => r.title.toLowerCase().includes('initial')) || matchedConfig?.rounds[0] || null,
    [matchedConfig]
  );
  const kickOffRound = useMemo(
    () => matchedConfig?.rounds.find(r => r.title.toLowerCase().includes('kick'))
      || (matchedConfig && matchedConfig.rounds.length > 1 ? matchedConfig.rounds[1] : null),
    [matchedConfig]
  );

  const checklistItemsForMapping = useMemo(() => {
    const items: { id: string; name: string; category: string | null }[] = [];
    if (initialRound) for (const i of initialRound.items) items.push({ id: i.id, name: i.label, category: 'Initial Items' });
    if (kickOffRound) for (const i of kickOffRound.items) items.push({ id: i.id, name: i.label, category: 'Kick Off Items' });
    return items;
  }, [initialRound, kickOffRound]);

  // Mapped checklist IDs (uploaded against any item)
  const [mappedChecklistIds, setMappedChecklistIds] = useState<Set<string>>(new Set());
  // checklist_item_id -> uploaded_item_ids[]
  const [checklistFileMap, setChecklistFileMap] = useState<Map<string, Set<string>>>(new Map());
  // uploaded_item_id -> name (for matching back to vdr_documents by filename — rough proxy)
  const [uploadedItemNames, setUploadedItemNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchMaps = async () => {
      const { data: items } = await supabase
        .from('uploaded_items')
        .select('id, name')
        .eq('deal_id', dealId)
        .neq('mapping_status', 'ignored');
      if (!items?.length) {
        setMappedChecklistIds(new Set());
        setChecklistFileMap(new Map());
        setUploadedItemNames(new Map());
        return;
      }
      const itemIds = items.map(i => i.id);
      const nameMap = new Map<string, string>();
      items.forEach(i => nameMap.set(i.id, i.name));
      setUploadedItemNames(nameMap);

      const { data: maps } = await supabase
        .from('uploaded_item_checklist_mapping')
        .select('checklist_item_id, uploaded_item_id')
        .in('uploaded_item_id', itemIds);
      if (maps) {
        const cIds = new Set(maps.map(m => m.checklist_item_id));
        setMappedChecklistIds(cIds);
        const cMap = new Map<string, Set<string>>();
        for (const m of maps) {
          if (!cMap.has(m.checklist_item_id)) cMap.set(m.checklist_item_id, new Set());
          cMap.get(m.checklist_item_id)!.add(m.uploaded_item_id);
        }
        setChecklistFileMap(cMap);
      }
    };
    fetchMaps();
  }, [dealId, uploadedItems.mappings, mappingRefreshKey]);

  // Internal lists EVERY non-folder file. Files that have also been shared
  // to the Data Room are intentionally still shown here — sharing is a
  // copy/share, not a move, so the Internal source workspace always shows
  // the file even after it appears in the external Data Room.
  const internalDocs = useMemo(
    () => documents.filter(d => !d.is_folder),
    [documents]
  );
  // Data Room lists files that have been explicitly shared to the external workspace.
  const dataroomDocs = useMemo(
    // Belt-and-suspenders: even if a file in an internal-only folder somehow
    // has shared_to_dataroom=true (legacy data), keep it out of the Data Room.
    () => documents.filter(d => !d.is_folder && d.shared_to_dataroom && !isInternalOnlyDoc(d)),
    [documents]
  );

  // Filter by search only — checklist clicks no longer filter the file panes
  const filterDocs = useCallback((docs: VdrDocument[]) => {
    const q = searchQuery.trim().toLowerCase();
    return docs.filter(d => {
      if (q && !(d.filename ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [searchQuery]);

  const visibleInternal = useMemo(() => filterDocs(internalDocs), [filterDocs, internalDocs]);
  const visibleDataroom = useMemo(() => filterDocs(dataroomDocs), [filterDocs, dataroomDocs]);

  // ── Category grouping ────────────────────────────────────
  // Build the ordered list of category names from settings (source of truth).
  // Strip any accidental overlap with internal-only categories so they're only
  // sourced from INTERNAL_ONLY_CATEGORY_NAMES below.
  const categoryNames = useMemo(
    () => categories.map(c => c.name).filter(n => !INTERNAL_ONLY_CATEGORY_SET.has(n)),
    [categories],
  );
  const customFolderNames = useMemo(() => customFolders.map(f => f.name), [customFolders]);
  // Per-column ordered names (user preference applied on top of the natural
  // settings/custom-folder order). Internal vs Data Room order independently.
  const internalCategoryNames = useMemo(
    // Internal-only categories (e.g. "Terms") are appended so they show as
    // real folder headers in the Internal column but never in Data Room.
    () => internalFolderPrefs.applyOrder([...categoryNames, ...INTERNAL_ONLY_CATEGORY_NAMES]),
    [internalFolderPrefs, categoryNames],
  );
  const dataroomCategoryNames = useMemo(
    () => dataroomFolderPrefs.applyOrder(categoryNames),
    [dataroomFolderPrefs, categoryNames],
  );
  const dataroomCustomFolderNames = useMemo(
    () => dataroomFolderPrefs.applyOrder(customFolderNames),
    [dataroomFolderPrefs, customFolderNames],
  );
  // All known folder names for docCategory() bucketing. Internal-only
  // categories are included so their files render under the correct header in
  // the Internal column instead of falling into Uncategorized.
  const categoryNameSet = useMemo(
    () => new Set([...categoryNames, ...customFolderNames, ...INTERNAL_ONLY_CATEGORY_NAMES]),
    [categoryNames, customFolderNames],
  );
  const customFolderNameSet = useMemo(() => new Set(customFolderNames), [customFolderNames]);
  const UNCATEGORIZED = '__uncategorized__';

  /**
   * Derive the category bucket for a document. Internal uses `folder_path`.
   * Data Room uses `dataroom_folder_path` when present (so files can be
   * reorganized in the Data Room independently of their Internal location)
   * and falls back to `folder_path` otherwise.
   */
  const docCategory = useCallback((doc: VdrDocument, column: 'internal' | 'dataroom'): string => {
    const raw = column === 'dataroom'
      ? ((doc as any).dataroom_folder_path ?? doc.folder_path ?? '/')
      : (doc.folder_path || '/');
    const fp = (raw || '/').replace(/^\/+|\/+$/g, '');
    if (!fp) return UNCATEGORIZED;
    // Folder names may contain '/' (e.g. "Cash / AR / AP Reports"), so prefer
    // matching the full trimmed path against known folder names before
    // falling back to the first path segment.
    if (categoryNameSet.has(fp)) return fp;
    const top = fp.split('/')[0];
    return categoryNameSet.has(top) ? top : UNCATEGORIZED;
  }, [categoryNameSet]);

  /** Group an array of docs by category (preserving Settings order, then Uncategorized). */
  const groupByCategory = useCallback((docs: VdrDocument[], column: 'internal' | 'dataroom') => {
    const map = new Map<string, VdrDocument[]>();
    const cats = column === 'internal' ? internalCategoryNames : dataroomCategoryNames;
    for (const cat of cats) map.set(cat, []);
    if (column === 'dataroom') {
      for (const cat of dataroomCustomFolderNames) map.set(cat, []);
    }
    map.set(UNCATEGORIZED, []);
    for (const d of docs) {
      const k = docCategory(d, column);
      const arr = map.get(k) || [];
      arr.push(d);
      map.set(k, arr);
    }
    return map;
  }, [internalCategoryNames, dataroomCategoryNames, dataroomCustomFolderNames, docCategory]);

  const internalGrouped = useMemo(() => groupByCategory(visibleInternal, 'internal'), [groupByCategory, visibleInternal]);
  const dataroomGrouped = useMemo(() => groupByCategory(visibleDataroom, 'dataroom'), [groupByCategory, visibleDataroom]);

  /** "Active" folder path for new uploads, based on selected category. */
  const uploadFolderPath = useMemo(() => {
    if (!activeCategory || activeCategory === UNCATEGORIZED) return '/';
    return `/${activeCategory}/`;
  }, [activeCategory]);

  const toggleCollapsed = useCallback((column: 'internal' | 'dataroom', cat: string) => {
    const setter = column === 'internal' ? setCollapsedInternal : setCollapsedDataroom;
    setter(prev => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat); else n.add(cat);
      return n;
    });
  }, []);

  // Selection helpers
  const toggleInternal = useCallback((id: string) => {
    setInternalSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);
  const toggleDataroom = useCallback((id: string) => {
    setDataroomSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const selectAllInternal = useCallback(() => {
    setInternalSelected(prev =>
      prev.size === visibleInternal.length
        ? new Set()
        : new Set(visibleInternal.map(d => d.id))
    );
  }, [visibleInternal]);
  const selectAllDataroom = useCallback(() => {
    setDataroomSelected(prev =>
      prev.size === visibleDataroom.length
        ? new Set()
        : new Set(visibleDataroom.map(d => d.id))
    );
  }, [visibleDataroom]);

  // Sharing action: Internal → Data Room is a COPY. The file remains in
  // Internal and additionally appears in the Data Room column.
  const copyToDataroom = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    // Strip internal-only files (e.g. Terms) — they must never leave Internal.
    const blocked = ids.filter(id => isInternalOnlyDoc(documents.find(x => x.id === id)));
    ids = ids.filter(id => !blocked.includes(id));
    if (blocked.length) {
      toast.error(
        `${blocked.length} file${blocked.length === 1 ? '' : 's'} in Terms can't be shared — Terms stays Internal.`,
      );
    }
    if (!ids.length) { setInternalSelected(new Set()); return; }
    // Snapshot prior share/folder state for undo.
    const snapshot = ids.map(id => {
      const d = documents.find(x => x.id === id);
      return {
        id,
        shared: !!d?.shared_to_dataroom,
        dataroom_folder_path: (d as any)?.dataroom_folder_path ?? null,
      };
    });
    await vdrDocs.bulkShareToDataroom(ids, true);
    setInternalSelected(new Set());
    toast.success(
      `Shared ${ids.length} file${ids.length === 1 ? '' : 's'} to Data Room`,
      {
        action: {
          label: 'Undo',
          onClick: async () => {
            // Restore each file's prior shared state and Data Room folder.
            await Promise.all(snapshot.map(s =>
              (supabase as any)
                .from('vdr_documents')
                .update({
                  shared_to_dataroom: s.shared,
                  dataroom_folder_path: s.shared ? s.dataroom_folder_path : null,
                })
                .eq('id', s.id)
            ));
            await vdrDocs.refetch?.();
            toast.success('Reverted share');
          },
        },
      },
    );
  }, [vdrDocs, documents]);

  // Removing a file from the external Data Room. The file stays in Internal.
  const removeFromDataroom = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    const snapshot = ids.map(id => {
      const d = documents.find(x => x.id === id);
      return {
        id,
        shared: !!d?.shared_to_dataroom,
        dataroom_folder_path: (d as any)?.dataroom_folder_path ?? null,
      };
    });
    await vdrDocs.bulkShareToDataroom(ids, false);
    setDataroomSelected(new Set());
    toast.success(
      `Removed ${ids.length} file${ids.length === 1 ? '' : 's'} from Data Room`,
      {
        action: {
          label: 'Undo',
          onClick: async () => {
            await Promise.all(snapshot.map(s =>
              (supabase as any)
                .from('vdr_documents')
                .update({
                  shared_to_dataroom: s.shared,
                  dataroom_folder_path: s.shared ? s.dataroom_folder_path : null,
                })
                .eq('id', s.id)
            ));
            await vdrDocs.refetch?.();
            toast.success('Restored to Data Room');
          },
        },
      },
    );
  }, [vdrDocs, documents]);

  // Move within a single column (Internal or Data Room) into a category folder.
  // Internal moves change folder_path. Data Room moves change ONLY
  // dataroom_folder_path so the Internal placement is preserved.
  const moveToCategory = useCallback(async (
    ids: string[],
    categoryName: string | null,
    column: 'internal' | 'dataroom' = 'internal',
  ) => {
    if (!ids.length) return;
    const newPath = !categoryName ? '/' : `/${categoryName}/`;
    // Snapshot prior folder paths for undo.
    const snapshot = ids.map(id => {
      const d = documents.find(x => x.id === id);
      return {
        id,
        folder_path: d?.folder_path ?? '/',
        dataroom_folder_path: (d as any)?.dataroom_folder_path ?? null,
      };
    });
    for (const id of ids) {
      if (column === 'dataroom') {
        await vdrDocs.moveDocumentInDataroom(id, newPath);
      } else {
        await vdrDocs.moveDocument(id, newPath);
      }
    }
    if (column === 'internal') setInternalSelected(new Set());
    else setDataroomSelected(new Set());
    // Track the last-used drop target so it surfaces at the top of menus.
    if (column === 'internal') internalFolderPrefs.recordRecent(categoryName);
    else dataroomFolderPrefs.recordRecent(categoryName);
    toast.success(
      categoryName
        ? `Moved to ${categoryName}`
        : 'Moved to Uncategorized',
      {
        action: {
          label: 'Undo',
          onClick: async () => {
            await Promise.all(snapshot.map(s =>
              (supabase as any)
                .from('vdr_documents')
                .update(
                  column === 'dataroom'
                    ? { dataroom_folder_path: s.dataroom_folder_path }
                    : { folder_path: s.folder_path },
                )
                .eq('id', s.id)
            ));
            await vdrDocs.refetch?.();
            toast.success('Move undone');
          },
        },
      },
    );
  }, [vdrDocs, documents, internalFolderPrefs, dataroomFolderPrefs]);

  // Copy/share file(s) to the Data Room and drop them into a specific
  // Data Room folder. Internal `folder_path` is left untouched so the
  // Internal source workspace placement is preserved.
  const shareToDataroomFolder = useCallback(
    async (ids: string[], folderName: string | null) => {
      if (!ids.length) return;
      const blocked = ids.filter(id => isInternalOnlyDoc(documents.find(x => x.id === id)));
      ids = ids.filter(id => !blocked.includes(id));
      if (blocked.length) {
        toast.error(
          `${blocked.length} file${blocked.length === 1 ? '' : 's'} in Terms can't be shared — Terms stays Internal.`,
        );
      }
      if (!ids.length) { setInternalSelected(new Set()); return; }
      const newPath = folderName ? `/${folderName}/` : '/';
      const snapshot = ids.map(id => {
        const d = documents.find(x => x.id === id);
        return {
          id,
          shared: !!d?.shared_to_dataroom,
          dataroom_folder_path: (d as any)?.dataroom_folder_path ?? null,
        };
      });
      await vdrDocs.bulkShareToDataroom(ids, true, newPath);
      setInternalSelected(new Set());
      dataroomFolderPrefs.recordRecent(folderName);
      toast.success(
        folderName
          ? `Shared ${ids.length} file${ids.length === 1 ? '' : 's'} to ${folderName}`
          : `Shared ${ids.length} file${ids.length === 1 ? '' : 's'} to Data Room`,
        {
          action: {
            label: 'Undo',
            onClick: async () => {
              await Promise.all(snapshot.map(s =>
                (supabase as any)
                  .from('vdr_documents')
                  .update({
                    shared_to_dataroom: s.shared,
                    dataroom_folder_path: s.shared ? s.dataroom_folder_path : null,
                  })
                  .eq('id', s.id)
              ));
              await vdrDocs.refetch?.();
              toast.success('Reverted share');
            },
          },
        },
      );
    },
    [vdrDocs, documents, dataroomFolderPrefs],
  );

  // Move within Internal: drag a file onto an Internal folder header.
  const moveToInternalFolder = useCallback(
    async (ids: string[], folderName: string | null) => {
      if (!ids.length) return;
      const newPath = folderName ? `/${folderName}/` : '/';
      const snapshot = ids.map(id => {
        const d = documents.find(x => x.id === id);
        return { id, folder_path: d?.folder_path ?? '/' };
      });
      for (const id of ids) {
        await vdrDocs.moveDocument(id, newPath);
      }
      setInternalSelected(new Set());
      internalFolderPrefs.recordRecent(folderName);
      toast.success(
        folderName
          ? `Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to ${folderName}`
          : `Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to Uncategorized`,
        {
          action: {
            label: 'Undo',
            onClick: async () => {
              await Promise.all(snapshot.map(s =>
                (supabase as any)
                  .from('vdr_documents')
                  .update({ folder_path: s.folder_path })
                  .eq('id', s.id)
              ));
              await vdrDocs.refetch?.();
              toast.success('Move undone');
            },
          },
        },
      );
    },
    [vdrDocs, documents, internalFolderPrefs],
  );

  // Move within Data Room: drag a file onto a Data Room folder header.
  // Only updates dataroom_folder_path so Internal placement is preserved.
  const moveToDataroomFolderOnly = useCallback(
    async (ids: string[], folderName: string | null) => {
      if (!ids.length) return;
      const newPath = folderName ? `/${folderName}/` : '/';
      const snapshot = ids.map(id => {
        const d = documents.find(x => x.id === id);
        return {
          id,
          dataroom_folder_path: (d as any)?.dataroom_folder_path ?? null,
        };
      });
      for (const id of ids) {
        await vdrDocs.moveDocumentInDataroom(id, newPath);
      }
      setDataroomSelected(new Set());
      dataroomFolderPrefs.recordRecent(folderName);
      toast.success(
        folderName
          ? `Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to ${folderName}`
          : `Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to Uncategorized`,
        {
          action: {
            label: 'Undo',
            onClick: async () => {
              await Promise.all(snapshot.map(s =>
                (supabase as any)
                  .from('vdr_documents')
                  .update({ dataroom_folder_path: s.dataroom_folder_path })
                  .eq('id', s.id)
              ));
              await vdrDocs.refetch?.();
              toast.success('Move undone');
            },
          },
        },
      );
    },
    [vdrDocs, documents, dataroomFolderPrefs],
  );

  // Drag & drop
  const handleDragStart = (e: React.DragEvent, doc: VdrDocument, source: 'internal' | 'dataroom') => {
    const selected = source === 'internal' ? internalSelected : dataroomSelected;
    const ids = selected.has(doc.id) && selected.size > 1 ? Array.from(selected) : [doc.id];
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ ids, source }));
    e.dataTransfer.effectAllowed = 'move';
  };

  // Drag a whole Internal category header → bulk share all files in that group.
  const handleCategoryDragStart = (e: React.DragEvent, categoryName: string, ids: string[]) => {
    if (!ids.length) {
      e.preventDefault();
      return;
    }
    // Encoded in BOTH mimes so the same drop handler works on column or folder headers.
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ ids, source: 'internal' }));
    e.dataTransfer.setData(DRAG_CATEGORY_MIME, JSON.stringify({ categoryName, ids }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleColumnDrop = async (e: React.DragEvent, dest: 'internal' | 'dataroom') => {
    e.preventDefault();
    setDropTarget(null);
    setDropFolderTarget(null);
    // External file drop = upload
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        await vdrDocs.uploadFile(file, uploadFolderPath);
      }
      // If dropped on data room, share them right after upload — best-effort by filename match
      if (dest === 'dataroom') {
        const names = new Set(files.map(f => f.name));
        const fresh = documents.filter(d => !d.is_folder && names.has(d.filename) && !d.shared_to_dataroom);
        if (fresh.length) await vdrDocs.bulkShareToDataroom(fresh.map(d => d.id), true);
      }
      return;
    }
    // Category drag → share all files of that category, preserving the same folder name
    const catRaw = e.dataTransfer.getData(DRAG_CATEGORY_MIME);
    if (catRaw && dest === 'dataroom') {
      try {
        const { categoryName, ids } = JSON.parse(catRaw) as { categoryName: string; ids: string[] };
        if (ids?.length) {
          await shareToDataroomFolder(ids, categoryName === UNCATEGORIZED ? null : categoryName);
        }
        return;
      } catch { /* fall through */ }
    }
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    try {
      const { ids, source } = JSON.parse(raw) as { ids: string[]; source: 'internal' | 'dataroom' };
      if (source === dest) return;
      if (dest === 'dataroom') {
        // Internal → Data Room: copy/share. File stays in Internal.
        await copyToDataroom(ids);
      } else {
        // Data Room → Internal: remove from external Data Room.
        await removeFromDataroom(ids);
      }
    } catch { /* ignore */ }
  };

  // Drop onto a specific folder header.
  //   • Data Room target column: copy/share from Internal, or move within
  //     Data Room (when the source is also Data Room).
  //   • Internal target column: move within Internal (Internal → Internal
  //     reorganization). Drops from the Data Room column are ignored —
  //     unsharing has its own explicit action.
  const handleFolderDrop = async (
    e: React.DragEvent,
    folderName: string,
    column: 'internal' | 'dataroom',
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    setDropFolderTarget(null);
    const targetFolder = folderName === UNCATEGORIZED ? null : folderName;
    // Folder header reorder (same column only).
    const reorderRaw = e.dataTransfer.getData(DRAG_FOLDER_REORDER_MIME);
    if (reorderRaw) {
      try {
        const { name, source, kind } = JSON.parse(reorderRaw) as {
          name: string; source: 'internal' | 'dataroom'; kind: 'category' | 'custom';
        };
        if (source !== column || name === folderName) return;
        // Reorder within the matching list (categories vs custom folders).
        if (column === 'internal') {
          internalFolderPrefs.reorder(categoryNames, name, folderName);
        } else {
          if (kind === 'custom') {
            dataroomFolderPrefs.reorder(customFolderNames, name, folderName);
          } else {
            dataroomFolderPrefs.reorder(categoryNames, name, folderName);
          }
        }
        return;
      } catch { /* fall through */ }
    }
    const catRaw = e.dataTransfer.getData(DRAG_CATEGORY_MIME);
    if (catRaw) {
      try {
        const { ids } = JSON.parse(catRaw) as { ids: string[] };
        if (ids?.length) {
          if (column === 'dataroom') {
            await shareToDataroomFolder(ids, targetFolder);
          } else {
            await moveToInternalFolder(ids, targetFolder);
          }
          return;
        }
      } catch { /* fall through */ }
    }
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    try {
      const { ids, source } = JSON.parse(raw) as { ids: string[]; source: 'internal' | 'dataroom' };
      if (!ids?.length) return;
      if (column === 'dataroom') {
        if (source === 'dataroom') {
          // Reorder within Data Room: only update dataroom_folder_path.
          await moveToDataroomFolderOnly(ids, targetFolder);
        } else {
          // Internal → Data Room folder: copy/share.
          await shareToDataroomFolder(ids, targetFolder);
        }
      } else {
        // Internal target — only meaningful for Internal-source drags.
        if (source === 'internal') {
          await moveToInternalFolder(ids, targetFolder);
        }
      }
    } catch { /* ignore */ }
  };

  const allowDrop = (e: React.DragEvent, dest: 'internal' | 'dataroom') => {
    if (
      e.dataTransfer.types.includes(DRAG_MIME) ||
      e.dataTransfer.types.includes(DRAG_CATEGORY_MIME) ||
      e.dataTransfer.types.includes('Files')
    ) {
      e.preventDefault();
      setDropTarget(dest);
    }
  };

  const allowFolderDrop = (
    e: React.DragEvent,
    folderName: string,
    column: 'internal' | 'dataroom',
  ) => {
    if (
      e.dataTransfer.types.includes(DRAG_MIME) ||
      e.dataTransfer.types.includes(DRAG_CATEGORY_MIME) ||
      e.dataTransfer.types.includes(DRAG_FOLDER_REORDER_MIME)
    ) {
      e.preventDefault();
      e.stopPropagation();
      // Namespace the drop target by column so the same category name in
      // both columns doesn't share highlight state.
      setDropFolderTarget(`${column}:${folderName}`);
    }
  };

  const handleCreateCustomFolder = async () => {
    const folder = await createCustomFolder(customFolderName);
    if (folder) {
      toast.success(`Created folder “${folder.name}”`);
      setCustomFolderName('');
      setShowCustomFolderDialog(false);
    }
  };

  const handleDeleteCustomFolder = async () => {
    if (!customFolderToDelete) return;
    // Reassign any docs in this folder to root before delete (so files aren't orphaned)
    const docsInFolder = documents.filter(
      d => {
        if (d.is_folder) return false;
        const fp = (d.folder_path || '').replace(/^\/+|\/+$/g, '');
        return fp === customFolderToDelete.name || fp.split('/')[0] === customFolderToDelete.name;
      },
    );
    for (const d of docsInFolder) {
      await vdrDocs.moveDocument(d.id, '/');
    }
    const ok = await deleteCustomFolder(customFolderToDelete.id);
    if (ok) toast.success(`Removed folder “${customFolderToDelete.name}”`);
    setCustomFolderToDelete(null);
  };

  const handleInternalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await vdrDocs.uploadFile(f, uploadFolderPath);
    if (internalFileInput.current) internalFileInput.current.value = '';
  };
  const handleDataroomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const beforeIds = new Set(documents.filter(d => !d.is_folder).map(d => d.id));
    for (const f of files) await vdrDocs.uploadFile(f, uploadFolderPath);
    // After upload, share newly uploaded files
    setTimeout(async () => {
      const fresh = (await (supabase as any)
        .from('vdr_documents')
        .select('id, filename')
        .eq('deal_id', dealId)
        .eq('is_folder', false)
        .is('deleted_at', null)).data || [];
      const newIds = fresh.filter((r: any) => !beforeIds.has(r.id) && files.some(f => f.name === r.filename)).map((r: any) => r.id);
      if (newIds.length) await vdrDocs.bulkShareToDataroom(newIds, true);
    }, 800);
    if (dataroomFileInput.current) dataroomFileInput.current.value = '';
  };

  const handleRename = async () => {
    if (!renameName.trim() || !renameDialog) return;
    await vdrDocs.renameDocument(renameDialog.id, renameName.trim());
    setRenameDialog(null);
    setRenameName('');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const docs = documents.filter(d => deleteConfirm.includes(d.id));
    await vdrDocs.deleteDocuments(docs);
    setDeleteConfirm(null);
    setInternalSelected(new Set());
    setDataroomSelected(new Set());
  };

  const handleDownload = async (doc: VdrDocument) => {
    if (!doc.file_path) return;
    const url = await vdrDocs.getDownloadUrl(doc.file_path);
    if (url) {
      await downloadUrlAsFile(url, doc.filename);
    }
  };

  // ── Bulk Upload Flow takes over the whole workspace ────────
  if (bulkUploadStep === 'upload') {
    return (
      <div className="h-full">
        <BulkUploadStep
          onContinue={async (files) => {
            const batchId = crypto.randomUUID();
            const { user } = (await supabase.auth.getUser()).data;
            if (!user) return;
            const rows = files.map(f => ({
              upload_batch_id: batchId, deal_id: dealId,
              name: f.name, metadata: { size: f.size, type: f.type },
              uploaded_by: user.id,
            }));
            const { error } = await supabase.from('uploaded_items').insert(rows);
            if (error) { console.error(error); toast.error('Failed to create items'); return; }
            setBulkBatchId(batchId);
            setBulkUploadStep('mapping');
          }}
          onCancel={() => setBulkUploadStep('none')}
        />
      </div>
    );
  }
  if (bulkUploadStep === 'mapping') {
    return (
      <div className="h-full">
        <BulkMappingTable
          rows={uploadedItems.mappingRows}
          checklistItems={checklistItemsForMapping}
          onSetMappings={uploadedItems.setItemMappings}
          onBulkSetMappings={uploadedItems.bulkSetMappings}
          onSetIgnored={uploadedItems.setIgnored}
          onDeleteItems={uploadedItems.deleteItems}
          onBack={() => setBulkUploadStep('upload')}
          onDone={() => { setBulkUploadStep('none'); setBulkBatchId(null); }}
        />
      </div>
    );
  }

  // ── Render: 3 columns ──────────────────────────────────────
  const renderChecklistRound = (round: RoundConfig | null, title: string) => {
    if (!round) {
      return (
        <div className="px-3 py-3">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{title}</h3>
          <p className="text-[11px] text-muted-foreground/60 italic">No items configured.</p>
        </div>
      );
    }
    const sorted = [...round.items].sort((a, b) => a.order - b.order);
    // Completion is the union of:
    //   • the linked outstanding item being marked received + approved, OR
    //   • supporting files having been auto-mapped to this checklist item
    const isChecked = (item: typeof sorted[number]) => {
      const linked = outstandingSync.lookup(title, item.label);
      if (linked) return linked.complete;
      return mappedChecklistIds.has(item.id);
    };
    const completed = sorted.filter(i => isChecked(i)).length;
    return (
      <div className="px-2 py-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
          <span className="text-[10px] text-muted-foreground tabular-nums">{completed}/{sorted.length}</span>
        </div>
        <div className="space-y-0.5">
          {sorted.map(item => {
            const linked = outstandingSync.lookup(title, item.label);
            const isMapped = mappedChecklistIds.has(item.id);
            const checked = linked ? linked.complete : isMapped;
            const fileCount = checklistFileMap.get(item.id)?.size || 0;
            return (
              <div
                key={item.id}
                className="w-full flex items-start gap-2 py-1.5 px-2 rounded-md text-left text-xs transition-colors hover:bg-secondary/40"
              >
                <button
                  type="button"
                  aria-label={checked ? `Mark ${item.label} incomplete` : `Mark ${item.label} complete`}
                  onClick={() => {
                    void outstandingSync.setChecked(
                      { roundTitle: title, label: item.label, dealTypeMatch: dealTypeLabel },
                      !checked
                    );
                  }}
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors',
                    checked
                      ? 'bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30'
                      : item.required
                        ? 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                        : 'border-border/60 hover:bg-secondary/60'
                  )}
                >
                  {checked && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />}
                </button>
                <div className="flex-1 min-w-0 select-none">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('leading-tight truncate', checked && 'text-muted-foreground')}>
                      {item.label}
                    </span>
                    {item.required && !checked && (
                      <span className="text-[9px] text-amber-400 font-medium flex-shrink-0">REQ</span>
                    )}
                  </div>
                  {fileCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {fileCount} file{fileCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFileRow = (
    doc: VdrDocument,
    column: 'internal' | 'dataroom',
  ) => {
    const isSelected = column === 'internal' ? internalSelected.has(doc.id) : dataroomSelected.has(doc.id);
    const toggle = column === 'internal' ? toggleInternal : toggleDataroom;
    const dataroomFolderRaw =
      ((doc as any).dataroom_folder_path ?? doc.folder_path ?? '/') as string;
    const dataroomFolderLabel =
      !dataroomFolderRaw || dataroomFolderRaw === '/' ? 'Uncategorized' : dataroomFolderRaw;
    const internalFolderLabel =
      !doc.folder_path || doc.folder_path === '/' ? 'Uncategorized' : doc.folder_path;
    return (
      <ContextMenu key={doc.id}>
        <ContextMenuTrigger>
          <div
            draggable
            onDragStart={e => handleDragStart(e, doc, column)}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                toggle(doc.id);
              } else {
                onPreview(doc);
              }
            }}
            className={cn(
              'group flex items-center gap-2 py-1.5 px-2 rounded-md text-xs cursor-pointer transition-colors',
              'text-foreground/90',
              isSelected ? 'bg-primary/10 ring-1 ring-primary/30 text-foreground' : 'hover:bg-secondary/40 hover:text-foreground'
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggle(doc.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3 w-3 flex-shrink-0"
            />
            {getIngestionIcon((doc as any).ingestion_status)}
            {getFileIcon(doc.filename)}
            <span className="flex-1 min-w-0 truncate font-medium">{doc.filename}</span>
            {column === 'internal' ? (
              doc.shared_to_dataroom ? (
                <Badge
                  variant="green"
                  className="flex-shrink-0 text-[9px] px-1.5 py-0 leading-tight max-w-[140px] truncate"
                  title={`Shared to Data Room → ${dataroomFolderLabel}`}
                >
                  In Data Room · {dataroomFolderLabel}
                </Badge>
              ) : (
                <Badge
                  variant="gray"
                  className="flex-shrink-0 text-[9px] px-1.5 py-0 leading-tight opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Internal only"
                >
                  Internal only
                </Badge>
              )
            ) : (
              <Badge
                variant="blue"
                className="flex-shrink-0 text-[9px] px-1.5 py-0 leading-tight max-w-[140px] truncate"
                title={`Data Room folder: ${dataroomFolderLabel}`}
              >
                {dataroomFolderLabel}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0 opacity-60 group-hover:opacity-100">
              {formatSize(doc.file_size)}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPreview(doc)}>Preview</ContextMenuItem>
          <ContextMenuItem onClick={() => handleDownload(doc)}>Download</ContextMenuItem>
          {column === 'internal' ? (
            isInternalOnlyDoc(doc) ? (
              <ContextMenuItem disabled title="Terms stays Internal — can't be shared to Data Room.">
                Copy to Data Room
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={() => copyToDataroom([doc.id])}>Copy to Data Room</ContextMenuItem>
            )
          ) : (
            <ContextMenuItem onClick={() => removeFromDataroom([doc.id])}>Remove from Data Room</ContextMenuItem>
          )}
          {categoryNames.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                {column === 'dataroom' ? 'Move to Data Room folder' : 'Move to category'}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {(() => {
                  const prefs = column === 'internal' ? internalFolderPrefs : dataroomFolderPrefs;
                  const allowed = new Set<string>([
                    ...categoryNames,
                    ...(column === 'dataroom' ? customFolderNames : []),
                  ]);
                  const recent = prefs.recents.filter(n => allowed.has(n)).slice(0, 5);
                  if (!recent.length) return null;
                  return (
                    <>
                      {recent.map(name => (
                        <ContextMenuItem
                          key={`recent-${name}`}
                          onClick={() => moveToCategory([doc.id], name, column)}
                        >
                          ↻ {name}
                        </ContextMenuItem>
                      ))}
                      <ContextMenuSeparator />
                    </>
                  );
                })()}
                {(column === 'internal' ? internalCategoryNames : dataroomCategoryNames).map(cat => (
                  <ContextMenuItem key={cat} onClick={() => moveToCategory([doc.id], cat, column)}>
                    {cat}
                  </ContextMenuItem>
                ))}
                {column === 'dataroom' && customFolderNames.length > 0 && (
                  <ContextMenuSeparator />
                )}
                {column === 'dataroom' && dataroomCustomFolderNames.map(cat => (
                  <ContextMenuItem key={`cust-${cat}`} onClick={() => moveToCategory([doc.id], cat, column)}>
                    {cat}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => moveToCategory([doc.id], null, column)}>
                  Uncategorized
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuItem onClick={() => { setRenameDialog({ id: doc.id, currentName: doc.filename }); setRenameName(doc.filename); }}>
            Rename
          </ContextMenuItem>
          <ContextMenuItem className="text-destructive" onClick={() => setDeleteConfirm([doc.id])}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  /** Render a column's docs grouped by category (Settings-driven taxonomy). */
  const renderCategoryGroups = (
    grouped: Map<string, VdrDocument[]>,
    column: 'internal' | 'dataroom',
  ) => {
    const collapsed = column === 'internal' ? collapsedInternal : collapsedDataroom;
    const fileInputRef = column === 'internal' ? internalFileInput : dataroomFileInput;
    // Render in Settings order, then per-deal custom folders, then Uncategorized.
    // Custom folders are only shown in the Data Room column.
    const order =
      column === 'dataroom'
        ? [...dataroomCategoryNames, ...dataroomCustomFolderNames, UNCATEGORIZED]
        : [...internalCategoryNames, UNCATEGORIZED];
    return (
      <div className="space-y-1">
        {order.map(cat => {
          const docs = grouped.get(cat) || [];
          // Hide the empty Uncategorized bucket to reduce noise
          if (cat === UNCATEGORIZED && docs.length === 0) return null;
          const isCollapsed = collapsed.has(cat);
          const isActive = activeCategory === cat || (cat === UNCATEGORIZED && activeCategory === UNCATEGORIZED);
          const label = cat === UNCATEGORIZED ? 'Uncategorized' : cat;
          const isCustom = column === 'dataroom' && customFolderNameSet.has(cat);
          const isDropFolder = dropFolderTarget === `${column}:${cat}`;
          // Headers are always draggable (except Uncategorized) so users can
          // reorder folders within a column. Internal headers with files
          // additionally carry the category-share payload for cross-column
          // bulk-share via DRAG_CATEGORY_MIME.
          const draggableHeader = cat !== UNCATEGORIZED;
          const canShareCategory = column === 'internal' && docs.length > 0;
          const customFolderRecord = isCustom ? customFolders.find(f => f.name === cat) : undefined;
          return (
            <div key={cat} className="">
              <div
                draggable={draggableHeader}
                onDragStart={
                  draggableHeader
                    ? (e) => {
                        // Always set the reorder payload.
                        e.dataTransfer.setData(
                          DRAG_FOLDER_REORDER_MIME,
                          JSON.stringify({
                            name: cat,
                            source: column,
                            kind: isCustom ? 'custom' : 'category',
                          }),
                        );
                        e.dataTransfer.effectAllowed = 'move';
                        // Internal-with-files: also enable cross-column share.
                        if (canShareCategory) {
                          handleCategoryDragStart(e, cat, docs.map(d => d.id));
                        }
                      }
                    : undefined
                }
                onDragOver={
                  cat !== UNCATEGORIZED
                    ? (e) => allowFolderDrop(e, cat, column)
                    : undefined
                }
                onDragLeave={
                  cat !== UNCATEGORIZED ? () => setDropFolderTarget(null) : undefined
                }
                onDrop={
                  cat !== UNCATEGORIZED
                    ? (e) => handleFolderDrop(e, cat, column)
                    : undefined
                }
                className={cn(
                  'group/cat flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-foreground/85 hover:bg-secondary/40 hover:text-foreground',
                  isDropFolder && 'bg-primary/15 ring-1 ring-primary/40 text-foreground',
                )}
                onClick={() => toggleCollapsed(column, cat)}
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
                {isCollapsed
                  ? <FolderClosed className="h-3 w-3 flex-shrink-0 text-foreground/80" />
                  : <FolderOpen className="h-3 w-3 flex-shrink-0 text-foreground/80" />}
                <span className="truncate">{label}</span>
                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/70 normal-case font-normal">
                  {docs.length}
                </span>
                {isCustom && (
                  <span className="ml-1 text-[8.5px] uppercase tracking-wider text-primary/70 normal-case font-medium">
                    Custom
                  </span>
                )}
                {column === 'internal' && cat !== UNCATEGORIZED && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCategory(cat);
                      fileInputRef.current?.click();
                    }}
                    className="ml-auto opacity-0 group-hover/cat:opacity-100 transition-opacity p-0.5 rounded hover:bg-secondary/60"
                    title={`Upload to ${label}`}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {isCustom && customFolderRecord && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomFolderToDelete({ id: customFolderRecord.id, name: customFolderRecord.name });
                    }}
                    className="ml-auto opacity-0 group-hover/cat:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                    title={`Remove folder ${cat}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              {!isCollapsed && (
                <div className="mt-0.5">
                  {docs.length === 0 ? (
                    <div className="px-3 py-1 text-[10px] text-muted-foreground/50 italic">
                      {searchQuery.trim() ? 'No matching files' : 'No files yet'}
                    </div>
                  ) : (
                    docs.map(d => renderFileRow(d, column))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const internalCount = internalDocs.length;
  const dataroomCount = dataroomDocs.length;
  const hasConfiguredCategories = categoryNames.length > 0;
  const shouldRenderInternalFolders = hasConfiguredCategories || visibleInternal.length > 0;
  const shouldRenderDataroomFolders = hasConfiguredCategories || visibleDataroom.length > 0;
  const indexedCount = vdrDocs.ingestionStats?.complete || 0;
  const processingCount = vdrDocs.ingestionStats?.processing || 0;

  // Data Room metrics
  const totalDocsCount = useMemo(
    () => documents.filter(d => !d.is_folder).length,
    [documents]
  );
  const requiredItems = useMemo(() => {
    const all = [...(initialRound?.items || []), ...(kickOffRound?.items || [])];
    return all.filter(i => i.required);
  }, [initialRound, kickOffRound]);
  const requiredFulfilled = useMemo(
    () => requiredItems.filter(i => mappedChecklistIds.has(i.id)).length,
    [requiredItems, mappedChecklistIds]
  );
  const requiredTotal = requiredItems.length;
  const lastSharedAt = useMemo(() => {
    if (!dataroomDocs.length) return null;
    const ts = dataroomDocs
      .map(d => (d as any).updated_at || (d as any).created_at)
      .filter(Boolean)
      .map(s => new Date(s).getTime())
      .filter(n => !isNaN(n));
    if (!ts.length) return null;
    return new Date(Math.max(...ts));
  }, [dataroomDocs]);
  const lastSharedLabel = useMemo(() => {
    if (!lastSharedAt) return '—';
    const diffMs = Date.now() - lastSharedAt.getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    if (d < 30) return `${d}d ago`;
    return lastSharedAt.toLocaleDateString();
  }, [lastSharedAt]);

  return (
    <>
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* ════════ COLUMN 1: CHECKLIST ════════ */}
      <ResizablePanel defaultSize={24} minSize={18} maxSize={35}>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-[hsl(272,100%,80%,0.18)] bg-card/40">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Checklist</h2>
            {dealTypeLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{dealTypeLabel}</Badge>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {checklistLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : !matchedConfig ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2 px-4 text-center">
                <ClipboardList className="h-7 w-7 text-muted-foreground/30" />
                <p>No checklist for this deal type.</p>
                {dealTypeLabel && <p className="text-[10px]">"{dealTypeLabel}"</p>}
              </div>
            ) : (
              <>
                {renderChecklistRound(initialRound, 'Initial Items')}
                <div className="border-t border-[hsl(272,100%,80%,0.18)] mx-2" />
                {renderChecklistRound(kickOffRound, 'Kick Off Items')}
              </>
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* ════════ COLUMN 2: INTERNAL ════════ */}
      <ResizablePanel defaultSize={38} minSize={25}>
        <div
          className={cn(
            'flex flex-col h-full transition-colors',
            dropTarget === 'internal' && 'bg-primary/5 ring-2 ring-inset ring-primary/40'
          )}
          onDragOver={e => allowDrop(e, 'internal')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={e => handleColumnDrop(e, 'internal')}
        >
          {/* HEADER (h-10) */}
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-[hsl(272,100%,80%,0.18)] bg-card/40">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Internal</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{internalCount}</Badge>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="How sorting works"
                    className="inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[240px] text-[11px] leading-snug">
                  Files are auto-sorted into folders on upload. You can override
                  any placement afterward by dragging files between folders.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {processingCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {processingCount}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              {canLinkDrive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => setDriveDialogOpen(true)}
                  title="Import files from a Google Drive folder into Internal"
                >
                  <FolderOpen className="h-3 w-3" />
                  Link Drive Folder
                </Button>
              )}
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => internalFileInput.current?.click()}
                title="Upload to Internal"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* TOP UTILITY PANEL — fixed height, mirrored in Data Room */}
          <div className="h-[72px] px-3 pt-2 pb-2 border-b border-[hsl(272,100%,80%,0.18)]">
            <div
              onClick={() => internalFileInput.current?.click()}
              className={cn(
                'flex items-center justify-center gap-2 h-full rounded-md border border-dashed cursor-pointer transition-colors',
                dropTarget === 'internal'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-border/50 bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground/80 hover:bg-muted/50'
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Drop files here</span>
              <span className="text-[10px] opacity-60">or click to browse</span>
            </div>
          </div>

          {/* SEARCH ROW (h-11) */}
          <div className="h-11 px-3 py-2 border-b border-[hsl(272,100%,80%,0.18)]">
            <div className="relative h-full">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter all files…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7 bg-muted/40 border-border/50 focus-visible:border-border/70"
              />
            </div>
          </div>

          {/* BULK ACTION SLOT — reserved-height (h-9) so selection in one column doesn't desync rows */}
          <div className="h-9 border-b border-[hsl(272,100%,80%,0.18)] flex items-center px-3">
            {internalSelected.size > 0 ? (
              <div className="flex items-center gap-2 w-full bg-primary/5 -mx-3 px-3 h-full">
              <Checkbox
                checked={internalSelected.size === visibleInternal.length && visibleInternal.length > 0}
                onCheckedChange={selectAllInternal}
                className="h-3 w-3"
              />
              <span className="text-[11px] font-medium">{internalSelected.size} selected</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm" variant="outline"
                  className="h-6 gap-1 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => copyToDataroom(Array.from(internalSelected))}
                >
                  <ArrowRight className="h-3 w-3" /> Copy to Data Room
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm" variant="outline"
                      className="h-6 w-6 p-0 border-primary/40 text-primary hover:bg-primary/10"
                      title="Copy to a specific Data Room folder"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-auto">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Copy to Data Room folder
                    </DropdownMenuLabel>
                    {dataroomFolderPrefs.recents.length > 0 && (
                      <>
                        <DropdownMenuLabel className="text-[9px] uppercase tracking-wide text-muted-foreground/70 pt-1 pb-0">
                          Recent
                        </DropdownMenuLabel>
                        {dataroomFolderPrefs.recents
                          .filter(name =>
                            categoryNames.includes(name) || customFolderNames.includes(name))
                          .slice(0, 5)
                          .map(name => (
                            <DropdownMenuItem
                              key={`recent-${name}`}
                              className="text-xs"
                              onClick={() => shareToDataroomFolder(Array.from(internalSelected), name)}
                            >
                              <FolderClosed className="h-3.5 w-3.5 mr-2 text-primary/70" />
                              {name}
                            </DropdownMenuItem>
                          ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      className="text-xs"
                      onClick={() => shareToDataroomFolder(Array.from(internalSelected), null)}
                    >
                      <FolderOpen className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      Data Room (root)
                    </DropdownMenuItem>
                    {categoryNames.length > 0 && <DropdownMenuSeparator />}
                    {dataroomCategoryNames.map(name => (
                      <DropdownMenuItem
                        key={`std-${name}`}
                        className="text-xs"
                        onClick={() => shareToDataroomFolder(Array.from(internalSelected), name)}
                      >
                        <FolderClosed className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        {name}
                      </DropdownMenuItem>
                    ))}
                    {customFolderNames.length > 0 && <DropdownMenuSeparator />}
                    {dataroomCustomFolderNames.map(name => (
                      <DropdownMenuItem
                        key={`cust-${name}`}
                        className="text-xs"
                        onClick={() => shareToDataroomFolder(Array.from(internalSelected), name)}
                      >
                        <FolderClosed className="h-3.5 w-3.5 mr-2 text-primary/70" />
                        {name}
                        <span className="ml-auto text-[9px] text-muted-foreground">custom</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(Array.from(internalSelected))}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                  onClick={() => setInternalSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">
                Tip: Cmd/Ctrl+click to multi-select.
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto px-1.5 py-1.5">
            {documentsLoading || categoriesLoading ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Loading…</div>
            ) : !shouldRenderInternalFolders ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground/80 gap-1.5 px-4 text-center">
                <Lock className="h-6 w-6 text-muted-foreground/25" />
                <p>{internalCount === 0 ? 'No internal files yet.' : 'No matches for current filter.'}</p>
                {internalCount === 0 && (
                  <button onClick={() => internalFileInput.current?.click()} className="text-[10px] text-primary hover:underline mt-1">
                    Upload files
                  </button>
                )}
              </div>
            ) : (
              renderCategoryGroups(internalGrouped, 'internal')
            )}
          </div>

          <input ref={internalFileInput} type="file" multiple className="hidden" onChange={handleInternalUpload} />
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* ════════ COLUMN 3: DATA ROOM ════════ */}
      <ResizablePanel defaultSize={38} minSize={25}>
        <div
          className={cn(
            'flex flex-col h-full transition-colors',
            dropTarget === 'dataroom' && 'bg-primary/5 ring-2 ring-inset ring-primary/40'
          )}
          onDragOver={e => allowDrop(e, 'dataroom')}
          onDragLeave={() => setDropTarget(null)}
          onDrop={e => handleColumnDrop(e, 'dataroom')}
        >
          {/* HEADER (h-10) — mirrors Internal */}
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-[hsl(272,100%,80%,0.18)] bg-card/40">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">Data Room</h2>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              {dataroomCount} shared
            </Badge>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="How sorting works"
                    className="inline-flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-[11px] leading-snug">
                  Shared files land in matching Data Room folders automatically.
                  Drag any file between folders here to override — Internal
                  placement stays unchanged.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="ml-auto flex items-center gap-1">
              <VdrExportButton
                dealId={dealId}
                dealName={currentDeal?.company || 'Deal'}
                documents={documents}
                isDataroomView
              />
              {canPushToFlex && (
                <Button
                  variant="outline" size="sm"
                  onClick={onPushToFlex}
                  disabled={isPushingToFlex}
                  className="h-6 gap-1 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  {isPushingToFlex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Push to FLEx
                </Button>
              )}
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => dataroomFileInput.current?.click()}
                title="Upload directly to Data Room"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => setShowCustomFolderDialog(true)}
                title="New custom folder"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* TOP UTILITY PANEL (h-[72px]) — metrics, mirrors Internal dropzone wrapper */}
          <div className="h-[72px] px-3 pt-2 pb-2 border-b border-[hsl(272,100%,80%,0.18)]">
            <div className="grid grid-cols-4 gap-1.5 h-full">
              <div className="rounded-md border border-border/30 bg-transparent px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 truncate">Shared</div>
                <div className="text-sm font-semibold tabular-nums leading-tight">
                  {dataroomCount}
                  <span className="text-[10px] text-muted-foreground/70 font-normal">/{totalDocsCount}</span>
                </div>
              </div>
              <div className="rounded-md border border-border/30 bg-transparent px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 truncate">Required</div>
                <div className="text-sm font-semibold tabular-nums leading-tight">
                  {requiredFulfilled}
                  <span className="text-[10px] text-muted-foreground/70 font-normal">/{requiredTotal || 0}</span>
                </div>
              </div>
              <div className="rounded-md border border-border/30 bg-transparent px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 truncate">Indexed</div>
                <div className="text-sm font-semibold tabular-nums leading-tight flex items-center gap-1">
                  {indexedCount}
                  {processingCount > 0 && (
                    <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />
                  )}
                </div>
              </div>
              <div className="rounded-md border border-border/30 bg-transparent px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 truncate">Last shared</div>
                <div className="text-[11px] font-medium leading-tight truncate">{lastSharedLabel}</div>
              </div>
            </div>
          </div>

          {/* SEARCH ROW (h-11) — mirrors Internal */}
          <div className="h-11 px-3 py-2 border-b border-[hsl(272,100%,80%,0.18)]">
            <div className="relative h-full flex items-center">
              <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground/80 pl-6">
                External-facing — files here are visible in the deal's data room.
              </span>
            </div>
          </div>

          {/* BULK ACTION SLOT (h-9) — reserved height; mirrors Internal */}
          <div className="h-9 border-b border-[hsl(272,100%,80%,0.18)] flex items-center px-3">
            {dataroomSelected.size > 0 ? (
              <div className="flex items-center gap-2 w-full bg-primary/5 -mx-3 px-3 h-full">
              <Checkbox
                checked={dataroomSelected.size === visibleDataroom.length && visibleDataroom.length > 0}
                onCheckedChange={selectAllDataroom}
                className="h-3 w-3"
              />
              <span className="text-[11px] font-medium">{dataroomSelected.size} selected</span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm" variant="outline"
                  className="h-6 gap-1 text-[10px] px-2"
                  onClick={() => removeFromDataroom(Array.from(dataroomSelected))}
                >
                  <ArrowLeft className="h-3 w-3" /> Remove from Data Room
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(Array.from(dataroomSelected))}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 text-[10px] px-2"
                  onClick={() => setDataroomSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
                {indexedCount > 0 && processingCount === 0 && (
                  <>
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                    {indexedCount} indexed
                  </>
                )}
                {(!indexedCount || processingCount > 0) && 'Drag files from Internal to share.'}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto px-1.5 py-1.5">
            {documentsLoading || categoriesLoading ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Loading…</div>
            ) : !shouldRenderDataroomFolders ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground/80 gap-1.5 px-4 text-center">
                <Globe className="h-6 w-6 text-muted-foreground/25" />
                <p>{dataroomCount === 0 ? 'No files in Data Room yet.' : 'No matches for current filter.'}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  Drag files from Internal, or use “Copy to Data Room”.
                </p>
              </div>
            ) : (
              renderCategoryGroups(dataroomGrouped, 'dataroom')
            )}
          </div>

          <input ref={dataroomFileInput} type="file" multiple className="hidden" onChange={handleDataroomUpload} />
        </div>
      </ResizablePanel>

      {/* ── Dialogs ── */}
      <Dialog open={!!renameDialog} onOpenChange={open => { if (!open) setRenameDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader>
          <Input
            placeholder="New name"
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button onClick={handleRename} disabled={!renameName.trim()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirm?.length === 1 ? 'file' : `${deleteConfirm?.length} files`}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This action can be undone within 14 days from the trash.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New custom Data Room folder */}
      <Dialog open={showCustomFolderDialog} onOpenChange={open => { if (!open) { setShowCustomFolderDialog(false); setCustomFolderName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Data Room folder</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This folder will be visible in the Data Room for everyone on this deal.
          </p>
          <Input
            placeholder="e.g. Insurance Docs"
            value={customFolderName}
            onChange={e => setCustomFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && customFolderName.trim()) handleCreateCustomFolder(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowCustomFolderDialog(false); setCustomFolderName(''); }}>Cancel</Button>
            <Button onClick={handleCreateCustomFolder} disabled={!customFolderName.trim()}>Create folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm remove of custom folder */}
      <Dialog open={!!customFolderToDelete} onOpenChange={open => { if (!open) setCustomFolderToDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove folder “{customFolderToDelete?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Files inside this folder will move back to the top level of the Data Room.
            The underlying files are not deleted.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomFolderToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCustomFolder}>Remove folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ResizablePanelGroup>
    {canLinkDrive && (
      <LinkDriveFolderDialog
        open={driveDialogOpen}
        onOpenChange={setDriveDialogOpen}
        onImport={async (file, folderPath) => {
          const ok = await vdrDocs.uploadFile(file, folderPath, 'dataroom');
          if (ok === false) throw new Error(`Failed to save ${file.name}`);
        }}
        internalFolders={internalCategoryNames}
        defaultSearchQuery={currentDeal?.company || ''}
      />
    )}
    </>
  );
}
