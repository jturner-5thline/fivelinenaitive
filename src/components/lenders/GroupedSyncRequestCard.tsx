import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Layers, Check, X, GitMerge, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import type { LenderSyncRequest } from '@/hooks/useLenderSyncRequests';
import type { RequestGroup } from '@/lib/lenderRequestGrouping';

interface GroupedSyncRequestCardProps {
  group: RequestGroup;
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string, notes?: string) => Promise<boolean>;
  onMerge: (id: string, data: Record<string, unknown>) => Promise<boolean>;
  /** Render function for an individual underlying request (uses existing SyncRequestCard). */
  renderMember: (req: LenderSyncRequest) => ReactNode;
  defaultOpen?: boolean;
}

export function GroupedSyncRequestCard({
  group,
  onApprove,
  onReject,
  onMerge,
  renderMember,
  defaultOpen = false,
}: GroupedSyncRequestCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);

  // Single-member groups render as the underlying card untouched.
  if (!group.isDuplicate) return <>{renderMember(group.members[0])}</>;

  const pendingMembers = group.members.filter((m) => m.status === 'pending');
  const hasConflicts = pendingMembers.some((m) => m.request_type === 'merge_conflict');
  const allNew = pendingMembers.length > 0 && pendingMembers.every((m) => m.request_type === 'new_lender');
  const canBatchApprove = pendingMembers.length > 0 && !hasConflicts;
  const canBatchMerge = pendingMembers.length > 0 && pendingMembers.every(
    (m) => m.request_type === 'merge_conflict' || m.request_type === 'update_existing',
  );

  const runBatch = async (action: 'approve' | 'dismiss' | 'merge') => {
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const m of pendingMembers) {
      let success = false;
      if (action === 'approve') {
        success = await onApprove(m.id);
      } else if (action === 'dismiss') {
        success = await onReject(m.id, 'Batch dismissed (duplicate)');
      } else {
        const data = (m.incoming_data || {}) as Record<string, unknown>;
        success = await onMerge(m.id, data);
      }
      if (success) ok++;
      else fail++;
    }
    setBusy(false);
    if (fail === 0) {
      toast({ title: 'Batch complete', description: `${ok} request${ok === 1 ? '' : 's'} processed.` });
    } else {
      toast({
        title: 'Partial success',
        description: `${ok} processed, ${fail} failed.`,
        variant: 'destructive',
      });
    }
  };

  const confidenceLabel =
    group.confidence === 'exact' ? 'Exact match'
    : group.confidence === 'alias' ? 'Alias match'
    : group.confidence === 'fuzzy' ? 'High-confidence fuzzy match'
    : '';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg">
        <div className="flex items-center gap-2 p-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <Layers className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{group.displayName}</span>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40 text-[10px]">
                {group.members.length} duplicates
              </Badge>
              {confidenceLabel && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {confidenceLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {pendingMembers.length} pending of {group.members.length}
              {hasConflicts && ' • includes merge conflicts'}
            </p>
          </div>
          {pendingMembers.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {canBatchApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); runBatch('approve'); }}
                  title={allNew ? 'Approve all duplicate new-lender requests' : 'Approve all pending requests in this group'}
                >
                  {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                  Batch approve
                </Button>
              )}
              {!canBatchApprove && canBatchMerge && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); runBatch('merge'); }}
                  title="Merge all duplicate update/conflict requests using incoming values"
                >
                  {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitMerge className="h-3 w-3 mr-1" />}
                  Batch merge
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={(e) => { e.stopPropagation(); runBatch('dismiss'); }}
                title="Dismiss all duplicates"
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss all
              </Button>
            </div>
          )}
        </div>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2 border-t pt-3 border-amber-500/20">
            {group.members.map((m) => (
              <div key={m.id}>{renderMember(m)}</div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
