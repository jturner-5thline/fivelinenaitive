import { Folder, MoreHorizontal, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { VdrDealStatus } from './types';
import type { Deal } from '@/types/deal';

interface VdrSidebarProps {
  dealId: string;
  deals: Deal[];
  currentDeal: Deal | undefined;
  fileCount: number;
  ingestionStats?: { pending: number; processing: number; complete: number; failed: number };
  
  canPushToFlex?: boolean;
  isPushingToFlex?: boolean;
  onPushToFlex?: () => void;
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
  fileCount,
  ingestionStats,
  
  canPushToFlex,
  isPushingToFlex,
  onPushToFlex,
}: VdrSidebarProps) {
  const statusBadge = getStatusBadge(currentDeal?.status);


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

      {/* Sources */}
      <div className="px-4 pb-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Sources</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Documents</span>
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">{fileCount}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 p-0">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => toast.info('Re-sync coming soon')}>Re-sync</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Settings coming soon')}>Settings</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Disconnect coming soon')}>Disconnect</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-[10px] text-muted-foreground pl-5.5">
            {ingestionStats?.processing ? `indexing ${ingestionStats.processing} files…` : 
             ingestionStats?.complete ? `${ingestionStats.complete} indexed` : 'synced just now'}
          </p>
        </div>

        {/* Push to FLEx */}
        {canPushToFlex && (
          <div className="pt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPushToFlex}
                  disabled={isPushingToFlex}
                  className="w-full gap-1.5 h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                >
                  {isPushingToFlex ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Push to FLEx
                </Button>
              </TooltipTrigger>
              <TooltipContent>Push data room files to FLEx</TooltipContent>
            </Tooltip>
          </div>
        )}

      </div>

      <div className="flex-1" />

    </aside>
  );
}
