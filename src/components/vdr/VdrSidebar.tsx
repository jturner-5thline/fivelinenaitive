import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { FolderLock, FolderOpen, Upload } from 'lucide-react';
import type { Deal } from '@/types/deal';

export type VdrView = 'internal' | 'dataroom';

interface VdrSidebarProps {
  dealId: string;
  deals: Deal[];
  currentDeal: Deal | undefined;
  onFilesDropped?: (files: File[]) => void;
  activeView: VdrView;
  onViewChange: (view: VdrView) => void;
}

function getStatusBadge(status: string | undefined) {
  const s = (status || 'active').toLowerCase();
  if (s === 'ready' || s === 'active') return { label: 'Ready', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
  if (s === 'in_progress' || s === 'in progress') return { label: 'In Progress', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
  if (s === 'review') return { label: 'Review', className: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
  if (s === 'closed' || s === 'archived') return { label: 'Closed', className: 'bg-muted text-muted-foreground border-border' };
  return { label: status || 'Active', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
}

export function VdrSidebar({
  dealId,
  deals,
  currentDeal,
  onFilesDropped,
  activeView,
  onViewChange,
}: VdrSidebarProps) {
  const statusBadge = getStatusBadge(currentDeal?.status);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFilesDropped) onFilesDropped(files);
  }, [onFilesDropped]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFilesDropped) onFilesDropped(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onFilesDropped]);

  return (
    <aside className="flex flex-col w-[220px] min-w-[220px] text-sidebar-foreground overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">n</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">nAItive</span>
        <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 leading-tight border-primary/30 text-primary">VDR</Badge>
      </div>

      {/* Deal Info */}
      <div className="px-4 pb-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Deal Info</p>
        <div className="space-y-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-muted-foreground">Target:</span>
            <span className="text-xs font-medium truncate">{currentDeal?.company || '—'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Status:</span>
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 leading-tight border', statusBadge.className)}>
              {statusBadge.label}
            </Badge>
          </div>
        </div>
      </div>

      {/* Views */}
      <div className="px-4 pb-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Views</p>
        <div className="space-y-0.5">
          <button
            onClick={() => onViewChange('internal')}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeView === 'internal' ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <FolderLock className="h-3.5 w-3.5 text-muted-foreground" />
            Internal
          </button>
          <button
            onClick={() => onViewChange('dataroom')}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeView === 'dataroom' ? "text-foreground bg-secondary/50" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            Data Room
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Upload Drop Zone */}
      <div className="px-4 pb-4" style={{ minHeight: '40%' }}>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInput} />
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'h-full min-h-[180px] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors',
            isDragOver
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground/70'
          )}
        >
          <Upload className="h-6 w-6" />
          <p className="text-xs font-medium text-center px-3">Drag & drop files here</p>
          <p className="text-[10px] opacity-60">or click to browse</p>
        </div>
      </div>
    </aside>
  );
}
