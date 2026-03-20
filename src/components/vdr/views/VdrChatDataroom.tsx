import { useState, useMemo, useCallback, useRef } from 'react';
import { Search, List, Grid, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, FileText, FileSpreadsheet, Presentation, Eye, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { VdrDocument } from '../types';
import { NaitiveIcon as Sparkles } from '@/components/NaitiveIcon';

interface VdrChatDataroomProps {
  dealId: string;
  documents: VdrDocument[];
  documentsLoading: boolean;
  onPreview: (doc: VdrDocument) => void;
  vdrDocs: any;
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

function formatSize(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Build tree structure from flat documents
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
      // Subfolders
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

  // Root-level files (not in any folder)
  const rootFiles = docs
    .filter(d => !d.is_folder && d.folder_path === '/')
    .map(d => ({ doc: d, children: [] }));

  return [...tree, ...rootFiles];
}

export function VdrChatDataroom({ dealId, documents, documentsLoading, onPreview, vdrDocs }: VdrChatDataroomProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderDialog, setNewFolderDialog] = useState<{ parentPath: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<string>('/');

  const tree = useMemo(() => buildTree(documents), [documents]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();
    function filterNode(node: TreeNode): TreeNode | null {
      if (!node.doc.is_folder) {
        return node.doc.filename.toLowerCase().includes(q) ? node : null;
      }
      const filteredChildren = node.children.map(filterNode).filter(Boolean) as TreeNode[];
      if (filteredChildren.length > 0 || node.doc.filename.toLowerCase().includes(q)) {
        return { ...node, children: filteredChildren };
      }
      return null;
    }
    return tree.map(filterNode).filter(Boolean) as TreeNode[];
  }, [tree, searchQuery]);

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
      // Internal drag (move file)
      const docId = e.dataTransfer.getData('text/vdr-doc-id');
      if (docId) {
        await vdrDocs.moveDocument(docId, folderPath);
        toast.success('File moved');
      }
    }
  };

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
              <ContextMenuItem onClick={() => toast.info('Rename coming soon')}>Rename</ContextMenuItem>
              <ContextMenuItem className="text-destructive" onClick={() => vdrDocs.deleteDocument(doc)}>Delete</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }

    // File node
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
            {getFileIcon(doc.filename)}
            <span className="truncate flex-1">{doc.filename}</span>
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">{formatSize(doc.file_size)}</span>
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
          <ContextMenuItem onClick={() => toast.info('Rename coming soon')}>Rename</ContextMenuItem>
          <ContextMenuItem className="text-destructive" onClick={() => vdrDocs.deleteDocument(doc)}>Delete</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // Suggested prompts for the chat placeholder
  const suggestedPrompts = [
    'Summarize the latest financial statements',
    'What are the key risks in this deal?',
    'Compare revenue trends across years',
    'List all outstanding compliance items',
  ];

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      {/* File Tree */}
      <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
        <div className="flex flex-col h-full border-r border-border/40">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
            <h2 className="text-sm font-semibold">Dataroom</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{vdrDocs.fileCount} files</Badge>
            <div className="ml-auto flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleUploadClick('/')} title="Upload files">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter files..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-7 bg-secondary/30"
              />
            </div>
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
              <DialogHeader><DialogTitle>New Subfolder</DialogTitle></DialogHeader>
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
        </div>
      </ResizablePanel>

      <ResizableHandle />

      {/* Chat Placeholder */}
      <ResizablePanel defaultSize={65} minSize={30}>
        <div className="flex flex-col h-full">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-auto px-6 py-8">
            {/* Welcome Message */}
            <div className="flex gap-3 max-w-2xl">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-3">
                <p className="text-sm leading-relaxed">
                  Welcome to nAItive. I've analyzed all documents in the dataroom and mapped them to financial accounts. You can browse the file tree on the left to navigate, or ask me anything about the deal.
                </p>
                <div className="text-sm leading-relaxed">
                  <p className="font-medium mb-1">I can help with:</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                    <li>Finding and summarizing specific documents</li>
                    <li>Answering questions about deal context and financials</li>
                    <li>Identifying potential QoE adjustments or red flags</li>
                    <li>Comparing data across multiple documents</li>
                  </ul>
                </div>
                <p className="text-sm">What would you like to explore?</p>

                {/* Suggested prompts */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {suggestedPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      className="px-3 py-1.5 rounded-full text-xs bg-secondary/60 text-foreground/80 hover:bg-secondary hover:text-foreground transition-colors border border-border/40"
                      onClick={() => toast.info('AI chat coming in Phase 2')}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Chat Input */}
          <div className="border-t border-border/40 px-6 py-3">
            <div className="flex gap-2 max-w-2xl">
              <Input
                placeholder="Ask anything about the dataroom..."
                className="flex-1 h-9 text-sm"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    toast.info('AI-powered responses coming soon. Browse the file tree to explore your documents.');
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <Button
                size="sm"
                className="h-9"
                onClick={() => toast.info('AI-powered responses coming soon.')}
              >
                Send
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 max-w-2xl">
              Responses are grounded in the indexed dataroom. All answers include citations to source documents.
            </p>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
