import { useState, useCallback, useRef } from 'react';
import { ArrowLeftRight, MessageSquare, ListChecks, Inbox, CheckSquare, Folder, MoreHorizontal, User, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import type { VdrView, VdrDealStatus } from './types';
import type { Deal } from '@/types/deal';

interface VdrSidebarProps {
  dealId: string;
  deals: Deal[];
  currentDeal: Deal | undefined;
  activeView: VdrView;
  onViewChange: (view: VdrView) => void;
  onDealChange: (dealId: string) => void;
  fileCount: number;
  ingestionStats?: { pending: number; processing: number; complete: number; failed: number };
  profile: any;
  onFileDrop: (files: File[]) => void;
}

const NAV_ITEMS: { id: VdrView; label: string; icon: React.ElementType }[] = [
  { id: 'chat-dataroom', label: 'Chat & Dataroom', icon: MessageSquare },
  { id: 'irl-tracker', label: 'IRL Tracker', icon: ListChecks },
  { id: 'incoming-data', label: 'Incoming Data', icon: Inbox },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
];

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
  activeView,
  onViewChange,
  onDealChange,
  fileCount,
  ingestionStats,
  profile,
  onFileDrop,
}: VdrSidebarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const statusBadge = getStatusBadge(currentDeal?.status);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFileDrop(files);
  }, [onFileDrop]);

  // Get top deals for the selector
  const dealOptions = deals.filter(d => d.status !== 'archived').slice(0, 50);

  return (
    <aside className="flex flex-col w-[220px] min-w-[220px] text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-xs font-bold text-primary-foreground">n</span>
        </div>
        <span className="font-semibold text-sm tracking-tight">nAItive</span>
        <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 leading-tight border-primary/30 text-primary">VDR</Badge>
      </div>

      {/* Deal Selector */}
      <div className="px-3 pb-3">
        <Select value={dealId} onValueChange={onDealChange}>
          <SelectTrigger className="h-9 text-xs bg-secondary/50 border-border/50">
            <SelectValue placeholder="Select deal..." />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {dealOptions.map(d => (
              <SelectItem key={d.id} value={d.id} className="text-xs">
                <span className="font-medium">{d.company || 'Unnamed Deal'}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

        {/* Team Comms Drop Zone */}
        <div className="pt-1">
          <p className="text-[10px] text-muted-foreground mb-1">Team Comms</p>
          <div
            ref={dropRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'rounded-lg border border-dashed p-3 text-center transition-colors cursor-pointer',
              isDragOver
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/40'
            )}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.onchange = () => {
                const files = Array.from(input.files || []);
                if (files.length > 0) onFileDrop(files);
              };
              input.click();
            }}
          >
            <p className="text-[10px] leading-relaxed">Drop files or click to upload</p>
          </div>
        </div>
      </div>

      {/* Views Navigation */}
      <div className="px-3 pb-3 space-y-0.5 flex-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium px-1 pb-1">Views</p>
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-auto px-3 py-3 border-t border-border/40">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={profile?.avatar_url} />
            <AvatarFallback className="text-[10px] bg-secondary">
              {(profile?.display_name || profile?.email || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{profile?.display_name || 'User'}</p>
            <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
