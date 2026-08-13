import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Search, RefreshCw, FolderOpen, ChevronRight, ChevronDown, FileText, FileSpreadsheet,
  Presentation, Eye, Loader2, Download, Link2, ExternalLink, AlertCircle, Unlink,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useDealDriveRoom, type DriveNode } from '@/hooks/useDealDriveRoom';
import { DriveFolderSetup } from './DriveFolderSetup';

interface Props {
  dealId: string;
  dealName?: string;
  companyName?: string;
  /** Switch back to the classic uploaded-documents workspace. */
  onUseUploads?: () => void;
}

function iconFor(node: DriveNode, className = 'h-3.5 w-3.5') {
  const mime = node.mimeType || '';
  const ext = node.name.includes('.') ? node.name.split('.').pop()?.toLowerCase() : '';
  if (mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext || '')) {
    return <FileSpreadsheet className={cn(className, 'text-green-400')} />;
  }
  if (mime.includes('presentation') || ['ppt', 'pptx'].includes(ext || '')) {
    return <Presentation className={cn(className, 'text-orange-400')} />;
  }
  if (mime === 'application/pdf' || ext === 'pdf') return <FileText className={cn(className, 'text-red-400')} />;
  if (mime.startsWith('image/')) return <Eye className={cn(className, 'text-purple-400')} />;
  return <FileText className={cn(className, 'text-foreground/70')} />;
}

function formatSize(size?: string) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * DriveDataRoomPanel
 * ------------------
 * Renders a deal's data room straight from its linked Google Drive folder.
 * Nothing is uploaded or copied — the folder tree below is Drive's live state.
 */
export function DriveDataRoomPanel({ dealId, dealName, companyName, onUseUploads }: Props) {
  const drive = useDealDriveRoom(dealId);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busyFileId, setBusyFileId] = useState<string | null>(null);

  const toggleFolder = useCallback((path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  /** Files grouped by their containing folder path (root files under ""). */
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, DriveNode[]>();
    for (const node of drive.files) {
      if (q && !node.name.toLowerCase().includes(q) && !node.parentPath.toLowerCase().includes(q)) continue;
      const key = node.parentPath;
      const bucket = map.get(key);
      if (bucket) bucket.push(node); else map.set(key, [node]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [drive.files, search]);

  const totalShown = useMemo(() => grouped.reduce((sum, [, list]) => sum + list.length, 0), [grouped]);

  const handleDownload = useCallback(async (node: DriveNode) => {
    setBusyFileId(node.id);
    try {
      const { url } = await drive.getFileBlobUrl(node);
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      toast.error('Download failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyFileId(null);
    }
  }, [drive]);

  const handlePreview = useCallback(async (node: DriveNode) => {
    setBusyFileId(node.id);
    try {
      const { url } = await drive.getFileBlobUrl(node);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error('Preview failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusyFileId(null);
    }
  }, [drive]);

  if (drive.linkLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading data room…
      </div>
    );
  }

  if (!drive.link) {
    return (
      <DriveFolderSetup
        dealName={dealName}
        companyName={companyName}
        findMatches={drive.findMatches}
        onLink={drive.linkFolder}
        onUseUploads={onUseUploads}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 min-h-[2.5rem] border-b border-border/40">
        <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold truncate">{drive.link.folder_name || 'Google Drive folder'}</span>
        <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-primary/30 text-primary shrink-0">
          Live from Drive
        </Badge>
        <div className="flex-1" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => drive.refreshTree()} disabled={drive.treeLoading}>
                <RefreshCw className={cn('h-3.5 w-3.5', drive.treeLoading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh from Drive</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {drive.link.folder_url && (
          <Button variant="ghost" size="sm" className="h-6 px-2" asChild>
            <a href={drive.link.folder_url} target="_blank" rel="noopener noreferrer" title="Open in Google Drive">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={drive.unlinkFolder}>
          <Unlink className="h-3 w-3" /> Change folder
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files and folders…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto min-h-0">
        {drive.treeError ? (
          <div className="p-4 flex flex-col items-center gap-2 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-xs text-destructive">{drive.treeError}</p>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => drive.refreshTree()}>
              Try again
            </Button>
          </div>
        ) : drive.treeLoading && drive.files.length === 0 ? (
          <div className="p-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading folder from Google Drive…
          </div>
        ) : totalShown === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {search ? 'No files match that search.' : 'This Drive folder is empty.'}
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {grouped.map(([folderPath, list]) => {
              const isCollapsed = collapsed.has(folderPath);
              const label = folderPath || 'Root';
              return (
                <div key={folderPath || '__root'} className="rounded-md border border-border/40 overflow-hidden">
                  <button
                    onClick={() => toggleFolder(folderPath)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
                  >
                    {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    <FolderOpen className="h-3.5 w-3.5 text-primary/70" />
                    <span className="text-[11px] font-medium truncate">{label}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{list.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y divide-border/30">
                      {list.map(node => (
                        <div key={node.id} className="group flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                          {iconFor(node)}
                          <span className="text-xs truncate flex-1">{node.name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">{formatSize(node.size)}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline">{formatModified(node.modifiedTime)}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              variant="ghost" size="sm" className="h-6 w-6 p-0"
                              onClick={() => handlePreview(node)}
                              disabled={busyFileId === node.id}
                              title="Preview"
                            >
                              {busyFileId === node.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button
                              variant="ghost" size="sm" className="h-6 w-6 p-0"
                              onClick={() => handleDownload(node)}
                              disabled={busyFileId === node.id}
                              title="Download"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                            {node.webViewLink && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" asChild title="Open in Drive">
                                <a href={node.webViewLink} target="_blank" rel="noopener noreferrer">
                                  <Link2 className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border/40 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">
          {drive.files.length} file{drive.files.length === 1 ? '' : 's'} · {drive.folderPaths.length} folder{drive.folderPaths.length === 1 ? '' : 's'}
          {drive.truncated ? ' · showing first 3,000 items' : ''}
        </span>
        {onUseUploads && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={onUseUploads}>
            Uploaded documents
          </Button>
        )}
      </div>
    </div>
  );
}
