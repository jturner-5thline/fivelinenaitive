import { Link } from 'react-router-dom';
import { Deal } from '@/types/deal';
import { Card } from '@/components/ui/card';
import { differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Trash2, Loader2, Archive as ArchiveIcon, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAdminRole } from '@/hooks/useAdminRole';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { shouldIgnoreOverlayOriginEvent } from '@/lib/overlayClickSuppression';

const ICP_STYLES: Record<string, string> = {
  'Debt Advisory': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  'M&A': 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  'Equity': 'bg-green-500/15 text-green-300 border-green-500/30',
  'Placement Agent': 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'Broker': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  'Other': 'bg-gray-500/15 text-gray-300 border-gray-500/30',
};

const OWNER_STYLES: Record<string, string> = {
  Paz: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
  Flor: 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40',
  James: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
};

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function formatLastActivity(updatedAt?: string) {
  if (!updatedAt) return null;
  const days = differenceInDays(new Date(), new Date(updatedAt));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function formatNextDate(d?: string | null) {
  if (!d) return null;
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return null; }
}

export function NaitiveDealCard({ deal, children, disableLink, onDeleted }: { deal: Deal; children?: React.ReactNode; disableLink?: boolean; onDeleted?: () => void }) {
  const lastActivity = formatLastActivity(deal.updatedAt);
  const nextDate = formatNextDate(deal.nextStepDate);
  const owner = deal.ownedBy || deal.manager;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { isAdmin } = useAdminRole();
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const canHardDelete = isAdmin && deleteConfirmText.trim().toUpperCase() === 'DELETE';

  const handleArchive = async () => {
    setWorking(true);
    try {
      const prevStatus = deal.status;
      const { error } = await supabase
        .from('deals')
        .update({ status: 'archived' })
        .eq('id', deal.id);
      if (error) throw error;
      setConfirmOpen(false);
      onDeleted?.();
      toast.success(`${deal.company || 'Deal'} archived`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error: undoErr } = await supabase
              .from('deals')
              .update({ status: prevStatus || 'on-track' })
              .eq('id', deal.id);
            if (undoErr) {
              toast.error('Failed to undo archive');
            } else {
              toast.success('Archive undone');
              onDeleted?.();
            }
          },
        },
      });
    } catch (e: any) {
      console.error('[naitive] archive deal failed', e);
      toast.error(e?.message || 'Failed to archive deal');
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteForever = async () => {
    setWorking(true);
    try {
      const { error } = await supabase.rpc('hard_delete_deal', { _deal_id: deal.id });
      if (error) throw error;
      toast.success('Deal permanently deleted');
      setConfirmDeleteOpen(false);
      setConfirmOpen(false);
      setDeleteConfirmText('');
      onDeleted?.();
    } catch (e: any) {
      console.error('[naitive] delete deal failed', e);
      toast.error(e?.message || 'Failed to delete deal');
    } finally {
      setWorking(false);
    }
  };

  const inner = (
    <Card className="deal-glass deal-tile group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 p-3 space-y-2">
        {onDeleted && (
          <button
            type="button"
            data-no-card-open
            onPointerDown={(e) => { e.stopPropagation(); }}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); setConfirmOpen(true); }}
            style={{ zIndex: 30 }}
            className="absolute right-10 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground shadow-sm opacity-60 pointer-events-auto transition-all hover:opacity-100 hover:bg-destructive/15 hover:text-destructive hover:border-destructive/50 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 group-hover:opacity-100"
            aria-label={`Delete ${deal.company || 'deal'}`}
            title="Delete deal"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Line 1 */}
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-tight truncate" style={{ color: '#f1f6fc' }}>
            {deal.company || 'Unnamed'}
          </h3>
          {deal.contact && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{deal.contact}</p>
          )}
        </div>

        {/* Line 2 + 3: chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {deal.icpCategory && (
            <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border', ICP_STYLES[deal.icpCategory] || ICP_STYLES['Other'])}>
              {deal.icpCategory}
            </span>
          )}
          {owner && (
            <span
              className={cn(
                'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-semibold border',
                OWNER_STYLES[owner] || 'bg-muted text-muted-foreground border-border'
              )}
              title={`Owned by ${owner}`}
            >
              {getInitials(owner)}
            </span>
          )}
        </div>

        {/* Line 4: last activity */}
        {lastActivity && (
          <p className="text-[11px] text-muted-foreground">Last activity: {lastActivity}</p>
        )}

        {/* Line 5: Next step */}
        {(deal.nextStep || nextDate) && (
          <p className="text-[11px] text-muted-foreground truncate">
            Next: {deal.nextStep || '—'}{nextDate ? ` · ${nextDate}` : ''}
          </p>
        )}

        {children}
    </Card>
  );

  const wrapped = onDeleted ? (
    <>
      {inner}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!working) setConfirmOpen(o); }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove deal?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose how to remove <span className="font-semibold text-foreground">{deal.company || 'this deal'}</span> from the active pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <button
              type="button"
              disabled={working}
              onClick={(e) => { e.preventDefault(); void handleArchive(); }}
              className="w-full text-left rounded-md border border-border/60 bg-background/40 hover:bg-accent/40 transition p-3 disabled:opacity-50"
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <ArchiveIcon className="h-4 w-4" />
                Archive
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Hide from active deals but keep all data. You can restore it later.
              </p>
            </button>
            {isAdmin && (
              <button
                type="button"
                disabled={working}
                onClick={(e) => { e.preventDefault(); setConfirmDeleteOpen(true); }}
                className="w-full text-left rounded-md border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 transition p-3 disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Remove this deal and all its data. This cannot be undone.
                </p>
              </button>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={(o) => { if (!working) { setConfirmDeleteOpen(o); if (!o) setDeleteConfirmText(''); } }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Permanently delete deal?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-semibold text-foreground">{deal.company || 'this deal'}</span> and every related record — lenders, tasks, notes, emails, meetings, attachments, milestones, audit history, and all join-table references. It will be as if this deal never existed. <span className="text-destructive font-medium">This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor={`confirm-delete-${deal.id}`} className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
            </Label>
            <Input
              id={`confirm-delete-${deal.id}`}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={working}
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={working || !canHardDelete}
              onClick={(e) => { e.preventDefault(); void handleDeleteForever(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {working ? (<><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Deleting…</>) : 'Delete Forever'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  ) : inner;

  if (disableLink) {
    return <div className="block w-full min-w-0">{wrapped}</div>;
  }
  return (
    <Link
      to={`/deal/${deal.id}`}
      className="block w-full min-w-0"
      onClick={(e) => {
        if (shouldIgnoreOverlayOriginEvent(e, e.currentTarget)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {wrapped}
    </Link>
  );
}