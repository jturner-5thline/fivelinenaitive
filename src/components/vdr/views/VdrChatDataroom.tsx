import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, FileText, FileSpreadsheet, Presentation, Eye, Upload, Loader2, CheckCircle2, AlertCircle, Tag, X, Send, FolderPlus, Pencil, Trash2, List, FolderTree, ClipboardList, PackagePlus, Share2, ArrowRightFromLine } from 'lucide-react';
import { VdrExportButton } from '../VdrExportButton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { VdrDocument } from '../types';

import { useVdrAccountTags } from '@/hooks/useVdrAccountTags';
import { useDefaultChecklistConfig, findMatchingConfig, type RoundConfig } from '@/hooks/useDefaultChecklistConfig';
import { useDealTypes } from '@/contexts/DealTypesContext';
import { useDealsContext } from '@/contexts/DealsContext';
import { useUploadedItems } from '@/hooks/useUploadedItems';
import { BulkUploadStep } from '../BulkUploadStep';
import { BulkMappingTable } from '../BulkMappingTable';
import { supabase } from '@/integrations/supabase/client';

import type { VdrView } from '../VdrSidebar';

interface VdrChatDataroomProps {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
  canPushToFlex?: boolean;
  isPushingToFlex?: boolean;
  onPushToFlex?: () => void;
  dealType?: string | null;
  companyId?: string | null;
  mappingRefreshKey?: number;
  activeView?: VdrView;
}

const ACCOUNT_TAG_COLORS: Record<string, string> = {
  'Revenue': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'COGS': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'SG&A': 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  'Debt/Liabilities': 'bg-red-500/15 text-red-400 border-red-500/25',
  'Real Estate/Leases': 'bg-purple-500/15 text-purple-400 border-purple-500/25',
  'Tax': 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'Legal': 'bg-sky-500/15 text-sky-400 border-sky-500/25',
  'Corporate': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',
};

function getTagColor(category: string) {
  return ACCOUNT_TAG_COLORS[category] || 'bg-muted text-muted-foreground border-border';
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

function getIngestionIcon(status: string | null) {
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

interface TreeNode {
  doc: VdrDocument;
  children: TreeNode[];
}

function buildTree(docs: VdrDocument[]): TreeNode[] {
  const folders = docs.filter(d => d.is_folder && d.folder_path === '/');
  const tree: TreeNode[] = folders
    .sort((a, b) => a.sort_order - b.sort_order || a.filename.localeCompare(b.filename))
    .map(folder => {
      const folderPath = `/${folder.filename}/`;
      const children = docs
        .filter(d => !d.is_folder && d.folder_path === folderPath)
        .sort((a, b) => a.filename.localeCompare(b.filename))
        .map(d => ({ doc: d, children: [] }));
      const subfolders = docs
        .filter(d => d.is_folder && d.folder_path === folderPath)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(sf => {
          const sfPath = `${folderPath}${sf.filename}/`;
          const sfChildren = docs
            .filter(d => !d.is_folder && d.folder_path === sfPath)
            .sort((a, b) => a.filename.localeCompare(b.filename))
            .map(d => ({ doc: d, children: [] }));
          return { doc: sf, children: sfChildren };
        });
      return { doc: folder, children: [...subfolders, ...children] };
    });

  const rootFiles = docs
    .filter(d => !d.is_folder && d.folder_path === '/')
    .map(d => ({ doc: d, children: [] }));

  return [...tree, ...rootFiles];
}

export function VdrChatDataroom({ dealId, documents, documentsLoading, onPreview, vdrDocs, canPushToFlex, isPushingToFlex, onPushToFlex, dealType, companyId, mappingRefreshKey, activeView = 'internal' }: VdrChatDataroomProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderDialog, setNewFolderDialog] = useState<{ parentPath: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameDialog, setRenameDialog] = useState<{ id: string; currentName: string } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>('/');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [rightView, setRightView] = useState<'folders' | 'files'>('folders');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [mappedChecklistIds, setMappedChecklistIds] = useState<Set<string>>(new Set());
  const [bulkUploadStep, setBulkUploadStep] = useState<'none' | 'upload' | 'mapping'>('none');
  const [bulkBatchId, setBulkBatchId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [moveDialog, setMoveDialog] = useState<{ fileIds: string[] } | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>('/');
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<string[] | null>(null);


  // Uploaded items hook
  const uploadedItems = useUploadedItems(dealId, bulkBatchId);

  // Checklist config
  const { config: checklistConfig, loading: checklistLoading } = useDefaultChecklistConfig(companyId ?? undefined);
  const { dealTypes: dealTypeOptions } = useDealTypes();
  const { deals } = useDealsContext();

  // Resolve the deal type label from the deal's dealTypes array
  const currentDeal = useMemo(() => deals.find(d => d.id === dealId), [deals, dealId]);
  const dealTypeLabel = useMemo(() => {
    const typeIds = currentDeal?.dealTypes;
    if (!typeIds || typeIds.length === 0) return dealType || '';
    // Get the first deal type's label
    const matched = dealTypeOptions.find(dt => typeIds.includes(dt.id));
    return matched?.label || typeIds[0] || dealType || '';
  }, [currentDeal?.dealTypes, dealTypeOptions, dealType]);

  // Find matching checklist config based on deal type
  const matchedConfig = useMemo(() => {
    if (!dealTypeLabel || !checklistConfig.configs.length) return null;
    return findMatchingConfig(checklistConfig.configs, dealTypeLabel);
  }, [dealTypeLabel, checklistConfig.configs]);

  // Split rounds into "Initial Items" and "Kick Off Items"
  const initialRound = useMemo(() => {
    if (!matchedConfig) return null;
    return matchedConfig.rounds.find(r => r.title.toLowerCase().includes('initial')) || matchedConfig.rounds[0] || null;
  }, [matchedConfig]);

  const kickOffRound = useMemo(() => {
    if (!matchedConfig) return null;
    return matchedConfig.rounds.find(r => r.title.toLowerCase().includes('kick')) || 
           (matchedConfig.rounds.length > 1 ? matchedConfig.rounds[1] : null);
  }, [matchedConfig]);

  // Build checklist items from Initial/Kick Off round configs for mapping
  const checklistItemsForMapping = useMemo(() => {
    const items: { id: string; name: string; category: string | null }[] = [];
    if (initialRound) {
      for (const item of initialRound.items) {
        items.push({ id: item.id, name: item.label, category: 'Initial Items' });
      }
    }
    if (kickOffRound) {
      for (const item of kickOffRound.items) {
        items.push({ id: item.id, name: item.label, category: 'Kick Off Items' });
      }
    }
    return items;
  }, [initialRound, kickOffRound]);

  // Fetch all mapped checklist item IDs for this deal (across all batches)
  useEffect(() => {
    const fetchMappedIds = async () => {
      const { data: items } = await supabase
        .from('uploaded_items')
        .select('id')
        .eq('deal_id', dealId)
        .neq('mapping_status', 'ignored');
      if (!items?.length) { setMappedChecklistIds(new Set()); return; }
      const itemIds = items.map(i => i.id);
      const { data: maps } = await supabase
        .from('uploaded_item_checklist_mapping')
        .select('checklist_item_id')
        .in('uploaded_item_id', itemIds);
      if (maps) {
        const ids = new Set(maps.map(m => m.checklist_item_id));
        setMappedChecklistIds(ids);
        // Auto-check mapped items
        setCheckedItems(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.add(id));
          return next;
        });
      }
    };
    fetchMappedIds();
  }, [dealId, uploadedItems.mappings, mappingRefreshKey]);

  const toggleCheckItem = (itemId: string) => {
    // Don't allow unchecking items that are mapped via uploads
    if (mappedChecklistIds.has(itemId)) return;
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // Account tags
  const { categories, tagsByDocId } = useVdrAccountTags(dealId);

  const toggleFileSelect = useCallback((fileId: string, e?: React.MouseEvent) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const allFileIds = useMemo(() => documents.filter(d => !d.is_folder).map(d => d.id), [documents]);
  const allFilesSelected = allFileIds.length > 0 && allFileIds.every(id => selectedFileIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (allFilesSelected) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(allFileIds));
    }
  }, [allFilesSelected, allFileIds]);

  const folders = useMemo(() => documents.filter(d => d.is_folder), [documents]);

  const handleBulkMove = useCallback(async () => {
    if (!moveDialog) return;
    for (const id of moveDialog.fileIds) {
      await vdrDocs.moveDocument(id, moveTargetFolder);
    }
    toast.success(`Moved ${moveDialog.fileIds.length} file(s)`);
    setSelectedFileIds(new Set());
    setMoveDialog(null);
    setMoveTargetFolder('/');
  }, [moveDialog, moveTargetFolder, vdrDocs]);

  const handleBulkDelete = useCallback(async () => {
    if (!deleteConfirmDialog) return;
    const docsToDelete = documents.filter(d => deleteConfirmDialog.includes(d.id));
    await vdrDocs.deleteDocuments(docsToDelete);
    setSelectedFileIds(new Set());
    setDeleteConfirmDialog(null);
  }, [deleteConfirmDialog, documents, vdrDocs]);

  const isDataroomView = activeView === 'dataroom';

  const tree = useMemo(() => buildTree(documents), [documents]);

  // For dataroom view, only show files that are shared_to_dataroom (keep folder structure)
  const dataroomTree = useMemo(() => {
    if (!isDataroomView) return tree;
    function filterShared(nodes: TreeNode[]): TreeNode[] {
      return nodes
        .map(n => {
          if (!n.doc.is_folder) {
            return n.doc.shared_to_dataroom ? n : null;
          }
          const filteredChildren = filterShared(n.children);
          // Keep folder if it has shared children
          if (filteredChildren.length > 0) {
            return { ...n, children: filteredChildren };
          }
          // Still show empty folders for structure
          return { ...n, children: [] };
        })
        .filter(Boolean) as TreeNode[];
    }
    return filterShared(tree);
  }, [tree, isDataroomView]);

  // Filter tree by search query AND category filter
  const filteredTree = useMemo(() => {
    const baseTree = isDataroomView ? dataroomTree : tree;
    const q = searchQuery.toLowerCase();
    const hasSearch = !!q.trim();
    const hasCategory = categoryFilter !== 'all';

    if (!hasSearch && !hasCategory) return baseTree;

    const categoryDocIds = hasCategory
      ? new Set([...tagsByDocId.entries()].filter(([, tags]) => tags.some(t => t.account_category === categoryFilter)).map(([id]) => id))
      : null;

    function filterNode(node: TreeNode): TreeNode | null {
      if (!node.doc.is_folder) {
        const matchesSearch = !hasSearch || node.doc.filename.toLowerCase().includes(q);
        const matchesCategory = !categoryDocIds || categoryDocIds.has(node.doc.id);
        return matchesSearch && matchesCategory ? node : null;
      }
      const filteredChildren = node.children.map(filterNode).filter(Boolean) as TreeNode[];
      if (filteredChildren.length > 0 || (!hasCategory && node.doc.filename.toLowerCase().includes(q))) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }
    return baseTree.map(filterNode).filter(Boolean) as TreeNode[];
  }, [tree, dataroomTree, isDataroomView, searchQuery, categoryFilter, tagsByDocId]);

  // Flat file list (no folders) — in dataroom view only show shared files
  const flatFiles = useMemo(() => {
    let files = documents.filter(d => !d.is_folder);
    if (isDataroomView) files = files.filter(d => d.shared_to_dataroom);
    const q = searchQuery.toLowerCase();
    const hasSearch = !!q.trim();
    const hasCategory = categoryFilter !== 'all';
    if (!hasSearch && !hasCategory) return files;
    const categoryDocIds = hasCategory
      ? new Set([...tagsByDocId.entries()].filter(([, tags]) => tags.some(t => t.account_category === categoryFilter)).map(([id]) => id))
      : null;
    return files.filter(f => {
      const matchesSearch = !hasSearch || f.filename.toLowerCase().includes(q);
      const matchesCategory = !categoryDocIds || categoryDocIds.has(f.id);
      return matchesSearch && matchesCategory;
    });
  }, [documents, searchQuery, categoryFilter, tagsByDocId, isDataroomView]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !newFolderDialog) return;
    await vdrDocs.createFolder(newFolderName.trim(), newFolderDialog.parentPath);
    setNewFolderDialog(null);
    setNewFolderName('');
  };

  const handleRename = async () => {
    if (!renameName.trim() || !renameDialog) return;
    await vdrDocs.renameDocument(renameDialog.id, renameName.trim());
    toast.success(`Renamed to "${renameName.trim()}"`);
    setRenameDialog(null);
    setRenameName('');
  };

  const handleDeleteFolder = async (doc: VdrDocument) => {
    const folderPath = `${doc.folder_path === '/' ? '' : doc.folder_path}${doc.filename}/`;
    const childDocs = documents.filter(d => d.folder_path === folderPath || d.folder_path?.startsWith(folderPath));
    if (childDocs.length > 0) {
      toast.error(`Cannot delete "${doc.filename}" — folder is not empty. Remove its contents first.`);
      return;
    }
    await vdrDocs.deleteDocument(doc);
  };

  const handleUploadClick = (folderPath: string) => {
    setUploadTarget(folderPath);
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const target = uploadTarget;
      await vdrDocs.uploadFile(file, target);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileDrop = async (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      for (const file of files) {
        await vdrDocs.uploadFile(file, folderPath);
      }
    } else {
      // Check for multi-select drag
      const idsJson = e.dataTransfer.getData('text/vdr-doc-ids');
      if (idsJson) {
        try {
          const ids: string[] = JSON.parse(idsJson);
          for (const id of ids) {
            await vdrDocs.moveDocument(id, folderPath);
          }
          toast.success(`Moved ${ids.length} file(s)`);
          setSelectedFileIds(new Set());
          return;
        } catch { /* fall through */ }
      }
      const docId = e.dataTransfer.getData('text/vdr-doc-id');
      if (docId) {
        await vdrDocs.moveDocument(docId, folderPath);
        toast.success('File moved');
      }
    }
  };

  const indexedCount = vdrDocs.ingestionStats?.complete || 0;
  const processingCount = vdrDocs.ingestionStats?.processing || 0;

  const renderNode = (node: TreeNode, depth = 0) => {
    const { doc } = node;
    const isExpanded = expandedFolders.has(doc.id);

    if (doc.is_folder) {
      return (
        <div key={doc.id}>
          <ContextMenu>
            <ContextMenuTrigger>
              <div
                className={cn(
                  'flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs hover:bg-secondary/50 transition-colors group',
                  dragOverFolder === doc.id && 'bg-primary/10 border border-primary/30'
                )}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                onClick={() => toggleFolder(doc.id)}
                onDragOver={e => { e.preventDefault(); setDragOverFolder(doc.id); }}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={e => handleFileDrop(e, `/${doc.filename}/`)}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-primary/70" /> : <FolderClosed className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="truncate font-medium">{doc.filename}</span>
                <span className="ml-auto text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
                  {node.children.filter(c => !c.doc.is_folder).length}
                </span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => { setNewFolderDialog({ parentPath: `/${doc.filename}/` }); setNewFolderName(''); }}>
                New subfolder
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleUploadClick(`/${doc.filename}/`)}>
                Upload files here
              </ContextMenuItem>
              <ContextMenuItem onClick={() => { setRenameDialog({ id: doc.id, currentName: doc.filename }); setRenameName(doc.filename); }}>Rename</ContextMenuItem>
              <ContextMenuItem className="text-destructive" onClick={() => handleDeleteFolder(doc)}>Delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }

    const docTags = tagsByDocId.get(doc.id);
    const isSelected = selectedFileIds.has(doc.id);

    return (
      <ContextMenu key={doc.id}>
        <ContextMenuTrigger>
          <div
            className={cn(
              "relative flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs hover:bg-secondary/50 transition-colors group",
              isSelected && "bg-primary/10 ring-1 ring-primary/30"
            )}
            style={{ paddingLeft: `${24 + depth * 16}px` }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                toggleFileSelect(doc.id);
              } else {
                onPreview(doc);
              }
            }}
            draggable
            onDragStart={e => {
              // If this file is selected, drag all selected; otherwise just this one
              const ids = isSelected && selectedFileIds.size > 1
                ? Array.from(selectedFileIds)
                : [doc.id];
              e.dataTransfer.setData('text/vdr-doc-ids', JSON.stringify(ids));
              e.dataTransfer.setData('text/vdr-doc-id', doc.id);
              if (ids.length > 1) {
                e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
              }
            }}
          >
            {/* Shared status: subtle left-border accent */}
            {!isDataroomView && doc.shared_to_dataroom && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-primary/60" />
            )}
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleFileSelect(doc.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3 w-3 flex-shrink-0"
            />
            <span className="ml-1 flex items-center gap-1 min-w-0 flex-1">
              {getIngestionIcon(doc.ingestion_status)}
              {getFileIcon(doc.filename)}
              <span className="truncate flex-1 min-w-0">{doc.filename}</span>
            </span>
            {isDataroomView && (
              <span className="text-[8px] text-muted-foreground/60 flex-shrink-0" title={`From: ${doc.folder_path === '/' ? 'Root' : doc.folder_path.replace(/^\/|\/$/g, '')}`}>
                From: {doc.folder_path === '/' ? 'Root' : doc.folder_path.replace(/^\/|\/$/g, '')}
              </span>
            )}
            {/* Hover action area */}
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isDataroomView && (
                <button
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    doc.shared_to_dataroom
                      ? "text-primary hover:text-primary/80"
                      : "text-muted-foreground/50 hover:text-primary"
                  )}
                  title={doc.shared_to_dataroom ? 'Unshare from Dataroom' : 'Share to Dataroom'}
                  onClick={(e) => { e.stopPropagation(); vdrDocs.toggleShareToDataroom(doc.id, !doc.shared_to_dataroom); }}
                >
                  <ArrowRightFromLine className="h-3 w-3" />
                </button>
              )}
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatSize(doc.file_size)}</span>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPreview(doc)}>Preview</ContextMenuItem>
          <ContextMenuItem onClick={() => {
            vdrDocs.getDownloadUrl(doc.file_path).then((url: string | null) => {
              if (url) { const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click(); }
            });
          }}>Download</ContextMenuItem>
          <ContextMenuItem onClick={() => setMoveDialog({ fileIds: [doc.id] })}>Move to…</ContextMenuItem>
          <ContextMenuItem onClick={() => { setRenameDialog({ id: doc.id, currentName: doc.filename }); setRenameName(doc.filename); }}>Rename</ContextMenuItem>
          <ContextMenuItem className="text-destructive" onClick={() => vdrDocs.deleteDocument(doc)}>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };


  const renderViewToggle = (view: 'folders' | 'files', setView: (v: 'folders' | 'files') => void) => (
    <div className="inline-flex items-center rounded-md border border-border/40 p-0.5 gap-0">
      <button
        onClick={() => setView('folders')}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          view === 'folders' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title="Folder view"
      >
        <FolderTree className="h-3 w-3" />
        Folders
      </button>
      <button
        onClick={() => setView('files')}
        className={cn(
          'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition-colors',
          view === 'files' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
        )}
        title="All files view"
      >
        <List className="h-3 w-3" />
        All Files
      </button>
    </div>
  );

  const renderFlatFileItem = (doc: VdrDocument) => {
    const docTags = tagsByDocId.get(doc.id);
    const isSelected = selectedFileIds.has(doc.id);
    return (
      <ContextMenu key={doc.id}>
        <ContextMenuTrigger>
          <div
            className={cn(
              "relative flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer text-xs hover:bg-secondary/50 transition-colors group",
              isSelected && "bg-primary/10 ring-1 ring-primary/30"
            )}
            style={{ paddingLeft: '8px' }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.preventDefault();
                toggleFileSelect(doc.id);
              } else {
                onPreview(doc);
              }
            }}
            draggable
            onDragStart={e => {
              const ids = isSelected && selectedFileIds.size > 1
                ? Array.from(selectedFileIds)
                : [doc.id];
              e.dataTransfer.setData('text/vdr-doc-ids', JSON.stringify(ids));
              e.dataTransfer.setData('text/vdr-doc-id', doc.id);
            }}
          >
            {/* Shared status: subtle left-border accent */}
            {!isDataroomView && doc.shared_to_dataroom && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-primary/60" />
            )}
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleFileSelect(doc.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3 w-3 flex-shrink-0"
            />
            <span className="ml-1 flex items-center gap-1 min-w-0 flex-1">
              {getIngestionIcon(doc.ingestion_status)}
              {getFileIcon(doc.filename)}
              <span className="truncate flex-1 min-w-0">{doc.filename}</span>
            </span>
            <span className="text-[9px] text-muted-foreground/60 flex-shrink-0 truncate max-w-[80px]" title={doc.folder_path}>
              {doc.folder_path === '/' ? 'Root' : doc.folder_path.replace(/^\/|\/$/g, '')}
            </span>
            {/* Hover action area */}
            <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isDataroomView && (
                <button
                  className={cn(
                    "p-0.5 rounded transition-colors",
                    doc.shared_to_dataroom
                      ? "text-primary hover:text-primary/80"
                      : "text-muted-foreground/50 hover:text-primary"
                  )}
                  title={doc.shared_to_dataroom ? 'Unshare from Dataroom' : 'Share to Dataroom'}
                  onClick={(e) => { e.stopPropagation(); vdrDocs.toggleShareToDataroom(doc.id, !doc.shared_to_dataroom); }}
                >
                  <ArrowRightFromLine className="h-3 w-3" />
                </button>
              )}
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{formatSize(doc.file_size)}</span>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPreview(doc)}>Preview</ContextMenuItem>
          <ContextMenuItem onClick={() => {
            vdrDocs.getDownloadUrl(doc.file_path).then((url: string | null) => {
              if (url) { const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click(); }
            });
          }}>Download</ContextMenuItem>
          <ContextMenuItem onClick={() => setMoveDialog({ fileIds: [doc.id] })}>Move to…</ContextMenuItem>
          <ContextMenuItem onClick={() => { setRenameDialog({ id: doc.id, currentName: doc.filename }); setRenameName(doc.filename); }}>Rename</ContextMenuItem>
          <ContextMenuItem className="text-destructive" onClick={() => vdrDocs.deleteDocument(doc)}>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderChecklistSection = (round: RoundConfig | null, title: string) => {
    if (!round) {
      return (
        <div className="px-3 py-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h3>
          <p className="text-xs text-muted-foreground/60 italic">No items configured for this deal type.</p>
        </div>
      );
    }

    const sortedItems = [...round.items].sort((a, b) => a.order - b.order);
    const checkedCount = sortedItems.filter(item => checkedItems.has(item.id)).length;

    return (
      <div className="px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
          <span className="text-[10px] text-muted-foreground">{checkedCount}/{sortedItems.length}</span>
        </div>
        <div className="space-y-1">
          {sortedItems.map(item => (
            <label
              key={item.id}
              className={cn(
                'flex items-start gap-2 py-1.5 px-2 rounded-md cursor-pointer text-xs transition-colors hover:bg-secondary/50',
                checkedItems.has(item.id) && 'opacity-60'
              )}
            >
              <Checkbox
                checked={checkedItems.has(item.id)}
                onCheckedChange={() => toggleCheckItem(item.id)}
                className="mt-0.5 h-3.5 w-3.5"
                disabled={mappedChecklistIds.has(item.id)}
              />
              <div className="flex-1 min-w-0">
                <span className={cn('leading-tight', checkedItems.has(item.id) && 'line-through')}>
                  {item.label}
                </span>
                {mappedChecklistIds.has(item.id) && (
                  <span className="ml-1.5 text-[9px] text-primary font-medium">Mapped</span>
                )}
                {item.required && (
                  <span className="ml-1.5 text-[9px] text-destructive font-medium">Required</span>
                )}
                {item.description && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-tight">{item.description}</p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* Internal - Checklists (hidden in Data Room view) */}
      {!isDataroomView && (
      <>
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        {bulkUploadStep === 'upload' ? (
          <BulkUploadStep
            onContinue={async (files) => {
              const batchId = crypto.randomUUID();
              // Insert items directly so we don't depend on hook state timing
              const { user } = (await supabase.auth.getUser()).data;
              if (!user) return;
              const rows = files.map(f => ({
                upload_batch_id: batchId,
                deal_id: dealId,
                name: f.name,
                metadata: { size: f.size, type: f.type },
                uploaded_by: user.id,
              }));
              const { error } = await supabase.from('uploaded_items').insert(rows);
              if (error) { console.error(error); toast.error('Failed to create items'); return; }
              setBulkBatchId(batchId);
              setBulkUploadStep('mapping');
            }}
            onCancel={() => setBulkUploadStep('none')}
          />
        ) : bulkUploadStep === 'mapping' ? (
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
        ) : (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-border/40">
            <h2 className="text-sm font-semibold">Checklist</h2>
            {dealTypeLabel && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{dealTypeLabel}</Badge>
            )}
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 text-[10px] px-2"
                onClick={() => setBulkUploadStep('upload')}
              >
                <PackagePlus className="h-3 w-3" />
                Bulk Upload
              </Button>
            </div>
          </div>

          {/* Checklist content */}
          <div className="flex-1 overflow-auto">
            {checklistLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading checklists…
              </div>
            ) : !matchedConfig ? (
              <div className="flex flex-col items-center justify-center h-32 text-xs text-muted-foreground gap-2 px-4 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
                <p>No checklist configuration found for this deal type.</p>
                {dealTypeLabel && <p className="text-[10px]">Deal type: "{dealTypeLabel}"</p>}
              </div>
            ) : (
              <>
                {renderChecklistSection(initialRound, 'Initial Items Checklist')}
                <div className="border-t border-border/30 mx-3" />
                {renderChecklistSection(kickOffRound, 'Kick Off Items Checklist')}
              </>
            )}
          </div>
        </div>
        )}
      </ResizablePanel>

      <ResizableHandle />

      {/* Right Panel - Dataroom File Tree */}
      </>
      )}
      <ResizablePanel defaultSize={isDataroomView ? 100 : 65} minSize={30}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-border/40">
            <h2 className="text-sm font-semibold">{isDataroomView ? 'Data Room (External)' : 'Data Room'}</h2>
            {!isDataroomView && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{vdrDocs.fileCount} files</Badge>}
            {isDataroomView && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">Shared</Badge>}
            {!isDataroomView && processingCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {processingCount} indexing
              </Badge>
            )}
            {!isDataroomView && indexedCount > 0 && processingCount === 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {indexedCount} indexed
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              <VdrExportButton
                dealId={dealId}
                dealName={currentDeal?.company || 'Deal'}
                documents={documents}
                isDataroomView={isDataroomView}
              />
              {!isDataroomView && renderViewToggle(rightView, setRightView)}
              {isDataroomView && canPushToFlex && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPushToFlex}
                  disabled={isPushingToFlex}
                  className="h-6 gap-1 text-[10px] px-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  {isPushingToFlex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Push to FLEx
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setNewFolderDialog({ parentPath: '/' }); setNewFolderName(''); }} title="New folder">
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
              {!isDataroomView && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleUploadClick('/')} title="Upload files">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Search + Category Filter */}
          <div className="px-3 py-2 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter files..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-7 bg-secondary/30"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-7 text-[11px] bg-secondary/30 border-border/40">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categoryFilter !== 'all' && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setCategoryFilter('all')}>
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Bulk Action Bar */}
          {selectedFileIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border-y border-primary/20">
              <Checkbox
                checked={allFilesSelected}
                onCheckedChange={toggleSelectAll}
                className="h-3 w-3"
              />
              <span className="text-[11px] font-medium text-foreground">{selectedFileIds.size} selected</span>
              <div className="ml-auto flex items-center gap-1">
                {!isDataroomView && (
                  <>
                    {/* Check if any selected are already shared */}
                    {(() => {
                      const selectedDocs = documents.filter(d => selectedFileIds.has(d.id));
                      const anyShared = selectedDocs.some(d => d.shared_to_dataroom);
                      const anyUnshared = selectedDocs.some(d => !d.shared_to_dataroom);
                      return (
                        <>
                          {anyUnshared && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1 border-primary/40 text-primary hover:bg-primary/10"
                              onClick={() => {
                                const ids = Array.from(selectedFileIds).filter(id => {
                                  const doc = documents.find(d => d.id === id);
                                  return doc && !doc.shared_to_dataroom;
                                });
                                vdrDocs.bulkShareToDataroom(ids, true);
                                setSelectedFileIds(new Set());
                                toast.success(`Shared ${ids.length} file(s) to Dataroom`);
                              }}
                            >
                              <Share2 className="h-3 w-3" />
                              Push to Dataroom
                            </Button>
                          )}
                          {anyShared && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 gap-1 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                              onClick={() => {
                                const ids = Array.from(selectedFileIds).filter(id => {
                                  const doc = documents.find(d => d.id === id);
                                  return doc && doc.shared_to_dataroom;
                                });
                                vdrDocs.bulkShareToDataroom(ids, false);
                                setSelectedFileIds(new Set());
                                toast.success(`Unshared ${ids.length} file(s) from Dataroom`);
                              }}
                            >
                              <X className="h-3 w-3" />
                              Unshare
                            </Button>
                          )}
                        </>
                      );
                    })()}
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => setMoveDialog({ fileIds: Array.from(selectedFileIds) })}
                >
                  <FolderOpen className="h-3 w-3" />
                  Move to…
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => setDeleteConfirmDialog(Array.from(selectedFileIds))}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setSelectedFileIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Tree / Flat Files */}
          <div className="flex-1 overflow-auto px-1 pb-2">
            {documentsLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Loading…</div>
            ) : rightView === 'folders' ? (
              filteredTree.map(node => renderNode(node))
            ) : (
              flatFiles.map(doc => renderFlatFileItem(doc))
            )}
          </div>

          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />

          {/* New Folder Dialog */}
          <Dialog open={!!newFolderDialog} onOpenChange={open => { if (!open) setNewFolderDialog(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>{newFolderDialog?.parentPath === '/' ? 'New Folder' : 'New Subfolder'}</DialogTitle></DialogHeader>
              <Input
                placeholder="Folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }}
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setNewFolderDialog(null)}>Cancel</Button>
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Rename Dialog */}
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

          {/* Move Dialog */}
          <Dialog open={!!moveDialog} onOpenChange={open => { if (!open) setMoveDialog(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Move {moveDialog?.fileIds.length === 1 ? 'file' : `${moveDialog?.fileIds.length} files`} to…</DialogTitle></DialogHeader>
              <Select value={moveTargetFolder} onValueChange={setMoveTargetFolder}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="/">Root</SelectItem>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={`/${f.filename}/`}>{f.filename}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMoveDialog(null)}>Cancel</Button>
                <Button onClick={handleBulkMove}>Move</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={!!deleteConfirmDialog} onOpenChange={open => { if (!open) setDeleteConfirmDialog(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Delete {deleteConfirmDialog?.length === 1 ? 'file' : `${deleteConfirmDialog?.length} files`}?</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">This action cannot be undone. The selected files will be permanently removed.</p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDeleteConfirmDialog(null)}>Cancel</Button>
                <Button variant="destructive" onClick={handleBulkDelete}>Delete</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
