import { useState, useMemo, useCallback, useRef } from 'react';
import { Search, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, FileText, FileSpreadsheet, Presentation, Eye, Upload, Loader2, CheckCircle2, AlertCircle, Tag, X, Send, FolderPlus, Pencil, Trash2, List, FolderTree } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { VdrDocument } from '../types';
import { useVdrAccountTags } from '@/hooks/useVdrAccountTags';

interface VdrChatDataroomProps {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
  canPushToFlex?: boolean;
  isPushingToFlex?: boolean;
  onPushToFlex?: () => void;
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

export function VdrChatDataroom({ dealId, documents, documentsLoading, onPreview, vdrDocs, canPushToFlex, isPushingToFlex, onPushToFlex }: VdrChatDataroomProps) {
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
  const [leftView, setLeftView] = useState<'folders' | 'files'>('folders');
  const [rightView, setRightView] = useState<'folders' | 'files'>('folders');

  // Account tags
  const { categories, tagsByDocId } = useVdrAccountTags(dealId);

  const tree = useMemo(() => buildTree(documents), [documents]);

  // Filter tree by search query AND category filter
  const filteredTree = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const hasSearch = !!q.trim();
    const hasCategory = categoryFilter !== 'all';

    if (!hasSearch && !hasCategory) return tree;

    // Get doc IDs matching category filter
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
    return tree.map(filterNode).filter(Boolean) as TreeNode[];
  }, [tree, searchQuery, categoryFilter, tagsByDocId]);

  // Flat file list (no folders)
  const flatFiles = useMemo(() => {
    const files = documents.filter(d => !d.is_folder);
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
  }, [documents, searchQuery, categoryFilter, tagsByDocId]);

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
    // Check if folder has children
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
      await vdrDocs.uploadFile(file, uploadTarget);
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
    const folderPath = doc.is_folder ? `${doc.folder_path === '/' ? '' : doc.folder_path}${doc.filename}/` : '';

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

    // File node with ingestion indicator + account tags
    const docTags = tagsByDocId.get(doc.id);

    return (
      <ContextMenu key={doc.id}>
        <ContextMenuTrigger>
          <div
            className="flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-xs hover:bg-secondary/50 transition-colors group"
            style={{ paddingLeft: `${24 + depth * 16}px` }}
            onClick={() => onPreview(doc)}
            draggable
            onDragStart={e => { e.dataTransfer.setData('text/vdr-doc-id', doc.id); }}
          >
            {getIngestionIcon(doc.ingestion_status)}
            {getFileIcon(doc.filename)}
            <span className="truncate flex-1 min-w-0">{doc.filename}</span>
            {docTags && docTags.length > 0 && (
              <div className="flex gap-0.5 flex-shrink-0">
                {docTags.slice(0, 2).map((t, i) => (
                  <span
                    key={i}
                    className={cn('px-1 py-px rounded text-[8px] leading-tight border', getTagColor(t.account_category))}
                    title={`${t.account_category} (${Math.round(t.confidence_score * 100)}%)`}
                  >
                    {t.account_category.length > 8 ? t.account_category.slice(0, 7) + '…' : t.account_category}
                  </span>
                ))}
                {docTags.length > 2 && (
                  <span className="text-[8px] text-muted-foreground">+{docTags.length - 2}</span>
                )}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0">{formatSize(doc.file_size)}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onPreview(doc)}>Preview</ContextMenuItem>
          <ContextMenuItem onClick={() => {
            vdrDocs.getDownloadUrl(doc.file_path).then((url: string | null) => {
              if (url) { const a = document.createElement('a'); a.href = url; a.download = doc.filename; a.click(); }
            });
          }}>Download</ContextMenuItem>
          <ContextMenuItem onClick={() => toast.info('Move coming soon')}>Move to…</ContextMenuItem>
          <ContextMenuItem onClick={() => { setRenameDialog({ id: doc.id, currentName: doc.filename }); setRenameName(doc.filename); }}>Rename</ContextMenuItem>
          <ContextMenuItem className="text-destructive" onClick={() => vdrDocs.deleteDocument(doc)}>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* File Tree */}
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
            <h2 className="text-sm font-semibold">Dataroom</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{vdrDocs.fileCount} files</Badge>
            {processingCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {processingCount} indexing
              </Badge>
            )}
            {indexedCount > 0 && processingCount === 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {indexedCount} indexed
              </Badge>
            )}
            <div className="ml-auto flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setNewFolderDialog({ parentPath: '/' }); setNewFolderName(''); }} title="New folder">
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleUploadClick('/')} title="Upload files">
                <Plus className="h-3.5 w-3.5" />
              </Button>
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

          {/* Tree */}
          <div className="flex-1 overflow-auto px-1 pb-2">
            {documentsLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Loading…</div>
            ) : (
              filteredTree.map(node => renderNode(node))
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
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* Right Panel - Duplicate File Tree */}
      <ResizablePanel defaultSize={65} minSize={30}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
            <h2 className="text-sm font-semibold">Dataroom</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{vdrDocs.fileCount} files</Badge>
            {processingCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {processingCount} indexing
              </Badge>
            )}
            {indexedCount > 0 && processingCount === 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {indexedCount} indexed
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-1">
              {canPushToFlex && (
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleUploadClick('/')} title="Upload files">
                <Plus className="h-3.5 w-3.5" />
              </Button>
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

          {/* Tree */}
          <div className="flex-1 overflow-auto px-1 pb-2">
            {documentsLoading ? (
              <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">Loading…</div>
            ) : (
              filteredTree.map(node => renderNode(node))
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
