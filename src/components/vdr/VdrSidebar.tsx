import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Deal } from '@/types/deal';

export type VdrView = 'workspace';

interface VdrSidebarProps {
  dealId: string;
  deals: Deal[];
  currentDeal: Deal | undefined;
  onFilesDropped?: (files: File[]) => void;
  activeView?: VdrView;
  onViewChange?: (view: VdrView) => void;
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
}: VdrSidebarProps) {
  const statusBadge = getStatusBadge(currentDeal?.status);

  return (
    <aside className="flex flex-col w-[220px] min-w-[220px] text-sidebar-foreground overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">n</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">naitive</span>
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

      {/* Workspace hint */}
      <div className="px-4 pb-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Workspace</p>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Checklist, Internal staging, and the external Data Room are all visible side-by-side. Drag files between columns to share or unshare.
        </p>
      </div>

      <div className="flex-1" />
    </aside>
  );
}
