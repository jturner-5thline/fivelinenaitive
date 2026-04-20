import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Search, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, FileText,
  FileSpreadsheet, Presentation, Eye, Loader2, CheckCircle2, AlertCircle,
  ClipboardList, PackagePlus, Send, FolderPlus, Trash2, Download,
  ArrowRight, ArrowLeft, Lock, Globe, MoreHorizontal, Upload,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
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
import { supabase } from '@/integrations/supabase/client';

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
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className={cn(className, 'text-red-400')} />;
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return <FileSpreadsheet className={cn(className, 'text-green-400')} />;
  if (['doc', 'docx'].includes(ext || '')) return <FileText className={cn(className, 'text-blue-400')} />;
  if (['ppt', 'pptx'].includes(ext || '')) return <Presentation className={cn(className, 'text-orange-400')} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '')) return <Eye className={cn(className, 'text-purple-400')} />;
  return <FileText className={cn(className, 'text-muted-foreground')} />;
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

export function VdrThreeColumnWorkspace({
  dealId, documents, documentsLoading, onPreview, vdrDocs,
  canPushToFlex, isPushingToFlex, onPushToFlex, companyId, mappingRefreshKey,
}: Props) {
  // Shared state
  const [searchQuery, setSearchQuery] = useState('');
  // Active category context — uploads and new files default to this
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Collapsed category sections (per column)
  const [collapsedInternal, setCollapsedInternal] = useState<Set<string>>(new Set());
  const [collapsedDataroom, setCollapsedDataroom] = useState<Set<string>>(new Set());
  // Manually-checked checklist items (independent from file-pane filtering)
  const [manuallyCheckedChecklist, setManuallyCheckedChecklist] = useState<Set<string>>(new Set());

  // Per-column selection
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [dataroomSelected, setDataroomSelected] = useState<Set<string>>(new Set());

  // Drag state
  const [dropTarget, setDropTarget] = useState<'internal' | 'dataroom' | null>(null);

  // Bulk upload flow
  const [bulkUploadStep, setBulkUploadStep] = useState<'none' | 'upload' | 'mapping'>('none');
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null);

  // Dialogs
  const [renameDialog, setRenameDialog] = useState<{ id: string; currentName: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const [newFolderDialog, setNewFolderDialog] = useState<{ parentPath: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const internalFileInput = useRef<HTMLInputElement>(null);
  const dataroomFileInput = useRef<HTMLInputElement>(null);

  // Load default categories (Settings-driven via data_room_checklist_categories)
  const { categories } = useChecklistCategories();

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

  // Split documents into Internal vs Data Room
  const internalDocs = useMemo(
    () => documents.filter(d => !d.is_folder && !d.shared_to_dataroom),
    [documents]
  );
  const dataroomDocs = useMemo(
    () => documents.filter(d => !d.is_folder && d.shared_to_dataroom),
    [documents]
  );

  // Filter by search only — checklist clicks no longer filter the file panes
  const filterDocs = useCallback((docs: VdrDocument[]) => {
    const q = searchQuery.trim().toLowerCase();
    return docs.filter(d => {
      if (q && !d.filename.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [searchQuery]);

  const visibleInternal = useMemo(() => filterDocs(internalDocs), [filterDocs, internalDocs]);
  const visibleDataroom = useMemo(() => filterDocs(dataroomDocs), [filterDocs, dataroomDocs]);

  // ── Category grouping ────────────────────────────────────
  // Build the ordered list of category names from settings (source of truth)
  const categoryNames = useMemo(() => categories.map(c => c.name), [categories]);
  const categoryNameSet = useMemo(() => new Set(categoryNames), [categoryNames]);
  const UNCATEGORIZED = '__uncategorized__';

  /** Derive the category bucket for a document from its folder_path. */
  const docCategory = useCallback((doc: VdrDocument): string => {
    const fp = (doc.folder_path || '/').replace(/^\/+|\/+$/g, '');
    if (!fp) return UNCATEGORIZED;
    const top = fp.split('/')[0];
    return categoryNameSet.has(top) ? top : UNCATEGORIZED;
  }, [categoryNameSet]);

  /** Group an array of docs by category (preserving Settings order, then Uncategorized). */
  const groupByCategory = useCallback((docs: VdrDocument[]) => {
    const map = new Map<string, VdrDocument[]>();
    for (const cat of categoryNames) map.set(cat, []);
    map.set(UNCATEGORIZED, []);
    for (const d of docs) {
      const k = docCategory(d);
      const arr = map.get(k) || [];
      arr.push(d);
      map.set(k, arr);
    }
    return map;
  }, [categoryNames, docCategory]);

  const internalGrouped = useMemo(() => groupByCategory(visibleInternal), [groupByCategory, visibleInternal]);
  const dataroomGrouped = useMemo(() => groupByCategory(visibleDataroom), [groupByCategory, visibleDataroom]);

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

  // Move actions
  const moveToDataroom = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await vdrDocs.bulkShareToDataroom(ids, true);
    setInternalSelected(new Set());
    toast.success(`Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to Data Room`);
  }, [vdrDocs]);

  const moveToInternal = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await vdrDocs.bulkShareToDataroom(ids, false);
    setDataroomSelected(new Set());
    toast.success(`Moved ${ids.length} file${ids.length === 1 ? '' : 's'} to Internal`);
  }, [vdrDocs]);

  // Move file(s) to a category folder (just changes folder_path)
  const moveToCategory = useCallback(async (ids: string[], categoryName: string | null) => {
    if (!ids.length) return;
    const newPath = !categoryName ? '/' : `/${categoryName}/`;
    for (const id of ids) {
      await vdrDocs.moveDocument(id, newPath);
    }
    setInternalSelected(new Set());
    setDataroomSelected(new Set());
    toast.success(
      categoryName
        ? `Moved to ${categoryName}`
        : 'Moved to Uncategorized'
    );
  }, [vdrDocs]);

  // Drag & drop
  const handleDragStart = (e: React.DragEvent, doc: VdrDocument, source: 'internal' | 'dataroom') => {
    const selected = source === 'internal' ? internalSelected : dataroomSelected;
    const ids = selected.has(doc.id) && selected.size > 1 ? Array.from(selected) : [doc.id];
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ ids, source }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDrop = async (e: React.DragEvent, dest: 'internal' | 'dataroom') => {
    e.preventDefault();
    setDropTarget(null);
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
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return;
    try {
      const { ids, source } = JSON.parse(raw) as { ids: string[]; source: 'internal' | 'dataroom' };
      if (source === dest) return;
      if (dest === 'dataroom') await moveToDataroom(ids);
      else await moveToInternal(ids);
    } catch { /* ignore */ }
  };

  const allowDrop = (e: React.DragEvent, dest: 'internal' | 'dataroom') => {
    if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDropTarget(dest);
    }
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
      const a = document.createElement('a');
      a.href = url; a.download = doc.filename; a.click();
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
    const completed = sorted.filter(i => mappedChecklistIds.has(i.id)).length;
    return (
      <div className="px-2 py-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
          <span className="text-[10px] text-muted-foreground tabular-nums">{completed}/{sorted.length}</span>
        </div>
        <div className="space-y-0.5">
          {sorted.map(item => {
            const isMapped = mappedChecklistIds.has(item.id);
            const isSelected = selectedChecklistId === item.id;
            const fileCount = checklistFileMap.get(item.id)?.size || 0;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedChecklistId(isSelected ? null : item.id)}
                className={cn(
                  'w-full flex items-start gap-2 py-1.5 px-2 rounded-md text-left text-xs transition-colors',
                  isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/40'
                )}
              >
                <div className={cn(
                  'mt-0.5 h-3.5 w-3.5 rounded-sm border flex items-center justify-center flex-shrink-0',
                  isMapped
                    ? 'bg-emerald-500/20 border-emerald-500/40'
                    : item.required
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-border/60'
                )}>
                  {isMapped && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('leading-tight truncate', isMapped && 'text-muted-foreground')}>
                      {item.label}
                    </span>
                    {item.required && !isMapped && (
                      <span className="text-[9px] text-amber-400 font-medium flex-shrink-0">REQ</span>
                    )}
                  </div>
                  {fileCount > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {fileCount} file{fileCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </button>
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
              isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/40'
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
            <span className="flex-1 min-w-0 truncate">{doc.filename}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0 opacity-60 group-hover:opacity-100">
              {formatSize(doc.file_size)}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPreview(doc)}>Preview</ContextMenuItem>
          <ContextMenuItem onClick={() => handleDownload(doc)}>Download</ContextMenuItem>
          {column === 'internal' ? (
            <ContextMenuItem onClick={() => moveToDataroom([doc.id])}>Move to Data Room</ContextMenuItem>
          ) : (
            <ContextMenuItem onClick={() => moveToInternal([doc.id])}>Move to Internal</ContextMenuItem>
          )}
          {categoryNames.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Move to category</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {categoryNames.map(cat => (
                  <ContextMenuItem key={cat} onClick={() => moveToCategory([doc.id], cat)}>
                    {cat}
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => moveToCategory([doc.id], null)}>
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
    // Render in Settings order; show empty categories too so the taxonomy is always visible.
    const order = [...categoryNames, UNCATEGORIZED];
    return (
      <div className="space-y-1">
        {order.map(cat => {
          const docs = grouped.get(cat) || [];
          // Hide the empty Uncategorized bucket to reduce noise
          if (cat === UNCATEGORIZED && docs.length === 0) return null;
          const isCollapsed = collapsed.has(cat);
          const isActive = activeCategory === cat || (cat === UNCATEGORIZED && activeCategory === UNCATEGORIZED);
          const label = cat === UNCATEGORIZED ? 'Uncategorized' : cat;
          return (
            <div key={cat} className="">
              <div
                className={cn(
                  'group/cat flex items-center gap-1.5 px-1.5 py-1 rounded-md text-[11px] font-medium uppercase tracking-wider transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground/90'
                )}
                onClick={() => toggleCollapsed(column, cat)}
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  : <ChevronDown className="h-3 w-3 flex-shrink-0" />}
                {isCollapsed
                  ? <FolderClosed className="h-3 w-3 flex-shrink-0" />
                  : <FolderOpen className="h-3 w-3 flex-shrink-0" />}
                <span className="truncate">{label}</span>
                <span className="ml-1 text-[10px] tabular-nums text-muted-foreground/70 normal-case font-normal">
                  {docs.length}
                </span>
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
              </div>
              {!isCollapsed && (
                <div className="mt-0.5">
                  {docs.length === 0 ? (
                    <div className="px-3 py-1 text-[10px] text-muted-foreground/50 italic">
                      No files
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
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* ════════ COLUMN 1: CHECKLIST ════════ */}
      <ResizablePanel defaultSize={24} minSize={18} maxSize={35}>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-white/5">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Checklist</h2>
            {dealTypeLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{dealTypeLabel}</Badge>
            )}
            <Button
              variant="outline" size="sm"
              className="ml-auto h-6 gap-1 text-[10px] px-2"
              onClick={() => setBulkUploadStep('upload')}
            >
              <PackagePlus className="h-3 w-3" /> Bulk
            </Button>
          </div>

          {selectedChecklistId && (
            <div className="px-3 py-1.5 bg-primary/5 border-b border-white/5 flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Filtering files by:</span>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {checklistItemsForMapping.find(i => i.id === selectedChecklistId)?.name || '—'}
              </Badge>
              <button
                onClick={() => setSelectedChecklistId(null)}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

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
                <div className="border-t border-white/5 mx-2" />
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
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-white/5">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Internal</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{internalCount}</Badge>
            {processingCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {processingCount}
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
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
          <div className="h-[72px] px-3 pt-2 pb-2 border-b border-white/5">
            <div
              onClick={() => internalFileInput.current?.click()}
              className={cn(
                'flex items-center justify-center gap-2 h-full rounded-md border border-dashed cursor-pointer transition-colors',
                dropTarget === 'internal'
                  ? 'border-primary/60 bg-primary/10 text-primary'
                  : 'border-white/10 bg-secondary/20 text-muted-foreground hover:border-primary/30 hover:text-foreground/80 hover:bg-secondary/30'
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Drop files here</span>
              <span className="text-[10px] opacity-60">or click to browse</span>
            </div>
          </div>

          {/* SEARCH ROW (h-11) */}
          <div className="h-11 px-3 py-2 border-b border-white/5">
            <div className="relative h-full">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter all files…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 text-xs pl-7 bg-secondary/30 border-white/10"
              />
            </div>
          </div>

          {/* BULK ACTION SLOT — reserved-height (h-9) so selection in one column doesn't desync rows */}
          <div className="h-9 border-b border-white/5 flex items-center px-3">
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
                  onClick={() => moveToDataroom(Array.from(internalSelected))}
                >
                  <ArrowRight className="h-3 w-3" /> Move to Data Room
                </Button>
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
            {documentsLoading ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Loading…</div>
            ) : visibleInternal.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-1 px-4 text-center">
                <Lock className="h-6 w-6 text-muted-foreground/30" />
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
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-white/5">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">Data Room</h2>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              {dataroomCount} shared
            </Badge>
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
            </div>
          </div>

          {/* TOP UTILITY PANEL (h-[72px]) — metrics, mirrors Internal dropzone wrapper */}
          <div className="h-[72px] px-3 pt-2 pb-2 border-b border-white/5">
            <div className="grid grid-cols-4 gap-1.5 h-full">
              <div className="rounded-md border border-white/10 bg-secondary/20 px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 truncate">Shared</div>
                <div className="text-sm font-semibold tabular-nums leading-tight">
                  {dataroomCount}
                  <span className="text-[10px] text-muted-foreground font-normal">/{totalDocsCount}</span>
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-secondary/20 px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 truncate">Required</div>
                <div className="text-sm font-semibold tabular-nums leading-tight">
                  {requiredFulfilled}
                  <span className="text-[10px] text-muted-foreground font-normal">/{requiredTotal || 0}</span>
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-secondary/20 px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 truncate">Indexed</div>
                <div className="text-sm font-semibold tabular-nums leading-tight flex items-center gap-1">
                  {indexedCount}
                  {processingCount > 0 && (
                    <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin" />
                  )}
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-secondary/20 px-2 py-1 flex flex-col justify-center min-w-0">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/80 truncate">Last shared</div>
                <div className="text-[11px] font-medium leading-tight truncate">{lastSharedLabel}</div>
              </div>
            </div>
          </div>

          {/* SEARCH ROW (h-11) — mirrors Internal */}
          <div className="h-11 px-3 py-2 border-b border-white/5">
            <div className="relative h-full flex items-center">
              <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground pl-6">
                External-facing — files here are visible in the deal's data room.
              </span>
            </div>
          </div>

          {/* BULK ACTION SLOT (h-9) — reserved height; mirrors Internal */}
          <div className="h-9 border-b border-white/5 flex items-center px-3">
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
                  onClick={() => moveToInternal(Array.from(dataroomSelected))}
                >
                  <ArrowLeft className="h-3 w-3" /> Move to Internal
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
            {documentsLoading ? (
              <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Loading…</div>
            ) : visibleDataroom.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-1 px-4 text-center">
                <Globe className="h-6 w-6 text-muted-foreground/30" />
                <p>{dataroomCount === 0 ? 'No files in Data Room yet.' : 'No matches for current filter.'}</p>
                <p className="text-[10px] text-muted-foreground/70">
                  Drag files from Internal, or use “Move to Data Room”.
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
    </ResizablePanelGroup>
  );
}
