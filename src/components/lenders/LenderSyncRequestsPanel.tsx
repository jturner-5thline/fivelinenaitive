import { useState } from 'react';
import { Bell, Check, X, GitMerge, ChevronDown, ChevronRight, AlertTriangle, UserPlus, RefreshCw, CheckCheck, Loader2, Search, Layers, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useLenderSyncRequests, LenderSyncRequest } from '@/hooks/useLenderSyncRequests';
import { supabase } from '@/integrations/supabase/client';
import { MergeConflictDialog } from '@/components/lenders/MergeConflictDialog';
import { ConflictResolutionPanel } from '@/components/lenders/ConflictResolutionPanel';
import { GroupedSyncRequestCard } from '@/components/lenders/GroupedSyncRequestCard';
import { LenderSyncReviewDrawer } from '@/components/lenders/LenderSyncReviewDrawer';
import { LenderSyncSettingsPopover } from '@/components/lenders/LenderSyncSettingsPopover';
import { groupSyncRequests, getRequestConfidence } from '@/lib/lenderRequestGrouping';
import { formatDistanceToNow } from 'date-fns';

interface FieldChangeProps {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

function FieldChange({ field, oldValue, newValue }: FieldChangeProps) {
  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '(empty)';
    if (Array.isArray(val)) return val.join(', ') || '(empty)';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return String(val);
  };

  return (
    <div className="text-sm py-1">
      <span className="font-medium text-muted-foreground capitalize">{field.replace(/_/g, ' ')}:</span>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-destructive line-through">{formatValue(oldValue)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-green-600 dark:text-green-400">{formatValue(newValue)}</span>
      </div>
    </div>
  );
}

interface SyncRequestCardProps {
  request: LenderSyncRequest;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
  onMerge: (id: string, data: Record<string, unknown>) => Promise<boolean>;
  onReview?: (id: string) => void;
  /** Total members in this funding source's duplicate cluster (incl. self). 1 = unique. */
  clusterSize?: number;
}

function SyncRequestCard({ request, isSelected, onToggleSelect, onApprove, onReject, onMerge, onReview, clusterSize = 1 }: SyncRequestCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

  const incomingData = request.incoming_data as Record<string, unknown>;
  const lenderName = incomingData.name as string;

  const handleApprove = async () => {
    setIsProcessing(true);
    const success = await onApprove(request.id);
    setIsProcessing(false);
    if (success) {
      toast({ title: 'Approved', description: `${lenderName} has been added to the database.` });
    } else {
      toast({ title: 'Error', description: 'Failed to approve request.', variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    const success = await onReject(request.id);
    setIsProcessing(false);
    if (success) {
      toast({ title: 'Rejected', description: `Request for ${lenderName} has been rejected.` });
    } else {
      toast({ title: 'Error', description: 'Failed to reject request.', variant: 'destructive' });
    }
  };

  const handleMerge = async (mergedData: Record<string, unknown>) => {
    setIsProcessing(true);
    const success = await onMerge(request.id, mergedData);
    setIsProcessing(false);
    if (success) {
      toast({ title: 'Merged', description: `${lenderName} has been updated with your selected values.` });
    } else {
      toast({ title: 'Error', description: 'Failed to merge request.', variant: 'destructive' });
    }
  };

  const getTypeIcon = () => {
    switch (request.request_type) {
      case 'new_lender': return <UserPlus className="h-4 w-4 text-green-500" />;
      case 'update_existing': return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'merge_conflict': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
  };

  const getTypeBadge = () => {
    switch (request.request_type) {
      case 'new_lender': return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">New Funding Source</Badge>;
      case 'update_existing': return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Update</Badge>;
      case 'merge_conflict': return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Merge Conflict</Badge>;
    }
  };

  const isPending = request.status === 'pending';

  return (
    <>
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border rounded-lg p-3 bg-card ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isPending && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(request.id)}
                className="shrink-0"
              />
            )}
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            {getTypeIcon()}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{lenderName}</span>
                {getTypeBadge()}
                {clusterSize > 1 && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40 text-[10px] gap-1">
                    <Layers className="h-3 w-3" />
                    Cluster ×{clusterSize}
                  </Badge>
                )}
                {(() => {
                  const c = getRequestConfidence(request);
                  return c.level !== 'none' ? (
                    <Badge variant="outline" className={`text-[10px] ${c.className}`}>{c.label}</Badge>
                  ) : null;
                })()}
                {request.confidence && request.confidence !== 'none' && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      request.confidence === 'exact_duplicate' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : request.confidence === 'likely_duplicate' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40'
                      : request.confidence === 'possible_match' ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/40'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40'
                    }`}
                    title={request.match_reason || undefined}
                  >
                    {request.confidence.replace('_', ' ')}
                  </Badge>
                )}
                {request.suggested_action && (
                  <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/30 text-primary">
                    Suggested: {request.suggested_action}
                  </Badge>
                )}
                {(request.conflict_count ?? 0) > 0 && (
                  <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">
                    {request.conflict_count} conflict{request.conflict_count === 1 ? '' : 's'}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                {request.existing_lender_name && ` • Matches "${request.existing_lender_name}"`}
              </p>
            </div>
          </div>
          
          {isPending && (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {request.request_type === 'merge_conflict' ? (
                <>
                  <Button size="sm" variant="outline" onClick={handleReject} disabled={isProcessing}>
                    <X className="h-3 w-3 mr-1" />
                    Keep Existing
                  </Button>
                  {onReview && (
                    <Button size="sm" variant="outline" onClick={() => onReview(request.id)} disabled={isProcessing}>
                      <Search className="h-3 w-3 mr-1" />
                      Review
                    </Button>
                  )}
                  <Button size="sm" variant="default" onClick={() => setShowMergeDialog(true)} disabled={isProcessing}>
                    <GitMerge className="h-3 w-3 mr-1" />
                    Resolve Conflict
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={handleReject} disabled={isProcessing}>
                    <X className="h-3 w-3" />
                  </Button>
                  {onReview && (
                    <Button size="sm" variant="outline" onClick={() => onReview(request.id)} disabled={isProcessing}>
                      <Search className="h-3 w-3 mr-1" />
                      Review
                    </Button>
                  )}
                  <Button size="sm" className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground hover:from-primary/90 hover:to-primary/60 shadow-sm" onClick={handleApprove} disabled={isProcessing}>
                    <Check className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                </>
              )}
            </div>
          )}
          
          {!isPending && (
            <Badge variant={request.status === 'approved' || request.status === 'merged' ? 'default' : 'secondary'}>
              {request.status}
            </Badge>
          )}
        </div>
        
        <CollapsibleContent>
          <Separator className="my-3" />
          
          {/* Show diff for updates/conflicts */}
          {request.changes_diff && Object.keys(request.changes_diff).length > 0 && (
            <div className="space-y-1 mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">Changes</p>
              {Object.entries(request.changes_diff).map(([field, { old: oldVal, new: newVal }]) => (
                <FieldChange key={field} field={field} oldValue={oldVal} newValue={newVal} />
              ))}
            </div>
          )}
          
          {/* Show incoming data for new lenders */}
          {request.request_type === 'new_lender' && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Funding Source Details</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {incomingData.lender_type && (
                  <div><span className="text-muted-foreground">Type:</span> {String(incomingData.lender_type)}</div>
                )}
                {incomingData.email && (
                  <div><span className="text-muted-foreground">Email:</span> {String(incomingData.email)}</div>
                )}
                {incomingData.contact_name && (
                  <div><span className="text-muted-foreground">Contact:</span> {String(incomingData.contact_name)}</div>
                )}
                {incomingData.geo && (
                  <div><span className="text-muted-foreground">Geography:</span> {String(incomingData.geo)}</div>
                )}
                {(incomingData.min_deal || incomingData.max_deal) && (
                  <div>
                    <span className="text-muted-foreground">Deal Size:</span>{' '}
                    {incomingData.min_deal ? `$${Number(incomingData.min_deal).toLocaleString()}` : '?'} -{' '}
                    {incomingData.max_deal ? `$${Number(incomingData.max_deal).toLocaleString()}` : '?'}
                  </div>
                )}
                {Array.isArray(incomingData.industries) && incomingData.industries.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Industries:</span> {incomingData.industries.join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Processing info */}
          {request.processed_at && (
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
              Processed {formatDistanceToNow(new Date(request.processed_at), { addSuffix: true })}
              {request.processing_notes && ` • ${request.processing_notes}`}
            </div>
          )}
        </CollapsibleContent>
      </div>

      {/* Merge conflict resolution dialog */}
      {request.request_type === 'merge_conflict' && request.changes_diff && (
        <MergeConflictDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          lenderName={lenderName}
          changesDiff={request.changes_diff as Record<string, { old: unknown; new: unknown }>}
          incomingData={incomingData}
          onMerge={handleMerge}
        />
      )}
    </Collapsible>
  );
}

interface LenderSyncRequestsPanelProps {
  onLenderApproved?: () => void;
}

export function LenderSyncRequestsPanel({ onLenderApproved }: LenderSyncRequestsPanelProps) {
  const { requests, pendingCount, loading, refetch, approveRequest, rejectRequest, mergeRequest } = useLenderSyncRequests();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isRematching, setIsRematching] = useState(false);
  const [confirmDismissAllOpen, setConfirmDismissAllOpen] = useState(false);
  const [isDismissingAll, setIsDismissingAll] = useState(false);

  // Bulk dismiss the entire pending queue. Queue cleanup only — does not touch
  // permissions, lenders, or sync settings. Marks pending rows as 'rejected'
  // with a clear processing note so they're filtered out of the active queue.
  const handleDismissAll = async () => {
    setIsDismissingAll(true);
    try {
      const { data, error } = await supabase
        .from('lender_sync_requests')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processing_notes: 'Queue cleanup — bulk dismissed (no permission or access changes)',
        })
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      const count = data?.length ?? 0;
      toast({
        title: 'Sync request queue cleared',
        description: `Dismissed ${count} pending request${count === 1 ? '' : 's'}. No permissions, access, or lender records were changed.`,
      });
      setConfirmDismissAllOpen(false);
      await refetch();
    } catch (err) {
      toast({
        title: 'Failed to dismiss queue',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsDismissingAll(false);
    }
  };

  const handleRerunMatching = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRematching(true);
    try {
      const { error } = await supabase.functions.invoke('match-lender-sync-request', {
        body: { backfill_all: true },
      });
      if (error) throw error;
      toast({ title: 'Matching refreshed', description: 'Confidence and suggested actions recomputed.' });
      await refetch();
    } catch (err) {
      toast({ title: 'Matching failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsRematching(false);
    }
  };

  // Wrap approve/merge to also notify parent to refresh lenders
  const handleApprove = async (id: string) => {
    const success = await approveRequest(id);
    if (success && onLenderApproved) {
      onLenderApproved();
    }
    return success;
  };

  const handleMerge = async (id: string, data: Record<string, unknown>) => {
    const success = await mergeRequest(id, data);
    if (success && onLenderApproved) {
      onLenderApproved();
    }
    return success;
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  // Get approvable requests (new_lender and update_existing, not merge_conflict)
  const approvableRequests = pendingRequests.filter(r => r.request_type !== 'merge_conflict');
  const selectedApprovable = approvableRequests.filter(r => selectedIds.has(r.id));

  // Phase 4 safety gate: bulk approve is only "safe" when every selected request is
  // either a clean new lender (no candidate matches) OR an exact duplicate / update
  // with zero populated-field conflicts. Anything else must be reviewed individually.
  const isSafeForBulk = (r: LenderSyncRequest) => {
    const conflicts = r.conflict_count ?? 0;
    if (conflicts > 0) return false;
    if (r.request_type === 'new_lender') {
      // safe if matching engine found nothing strong
      const hasStrong = (r.match_candidates || []).some(c => (c.score ?? 0) >= 0.82);
      return !hasStrong;
    }
    if (r.request_type === 'update_existing') {
      return r.confidence === 'exact_duplicate' || r.suggested_action === 'update';
    }
    return false;
  };
  const safeSelected = selectedApprovable.filter(isSafeForBulk);
  const unsafeSelectedCount = selectedApprovable.length - safeSelected.length;

  // Categorize pending requests for tabs
  const newLenderRequests = pendingRequests.filter(r => r.request_type === 'new_lender');
  // Conflict Review: anything with unresolved field conflicts OR explicit pending_conflict_review status.
  // Falls back to legacy `request_type === 'merge_conflict'` until backend backfills `conflict_count`.
  const conflictRequests = pendingRequests.filter(r =>
    (r.conflict_count ?? 0) > 0
    || r.status === 'pending_conflict_review'
    || r.request_type === 'merge_conflict',
  );
  // Likely Match: matching engine flagged at least one strong candidate and request is not in conflict.
  const likelyMatchRequests = pendingRequests.filter(r =>
    !conflictRequests.includes(r)
    && (
      r.suggested_action === 'update'
      || r.suggested_action === 'merge'
      || r.confidence === 'likely_duplicate'
      || r.confidence === 'exact_duplicate'
      || (r.match_candidates && r.match_candidates.length > 0)
    ),
  );

  // Dedupe-aware groupings used across every tab. Single-member groups render as
  // normal request cards; multi-member groups collapse into a parent row with
  // batch actions.
  const allGroups = groupSyncRequests(pendingRequests);

  // Potential Duplicates: only groups with 2+ members, plus any lone request whose
  // name is flagged as matching an existing lender (the soft-dup signal from Flex).
  const duplicateGroups = allGroups.filter(g => g.isDuplicate);
  const softDupRequests = pendingRequests.filter(
    r => r.request_type === 'new_lender'
      && !!r.existing_lender_name
      && !duplicateGroups.some(g => g.members.some(m => m.id === r.id)),
  );
  const duplicateCount = duplicateGroups.reduce((s, g) => s + g.members.length, 0) + softDupRequests.length;

  // Default to the most actionable tab per spec: Conflict Review > Likely Match > New > Completed.
  const defaultTab =
    conflictRequests.length > 0 ? 'conflicts'
    : likelyMatchRequests.length > 0 ? 'likely'
    : newLenderRequests.length > 0 ? 'new'
    : 'completed';
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  // Per-tab search + type filter (each tab keeps its own state so switching tabs
  // doesn't blow away the user's current filter).
  const [tabFilters, setTabFilters] = useState<Record<string, { q: string; type: string }>>({});
  const currentFilter = tabFilters[activeTab] || { q: '', type: 'all' };
  const setCurrentFilter = (next: { q: string; type: string }) => {
    setTabFilters(prev => ({ ...prev, [activeTab]: next }));
  };

  const applyFilters = (list: LenderSyncRequest[], opts?: { allowTypeFilter?: boolean }) => {
    const { q, type } = currentFilter;
    const allowType = opts?.allowTypeFilter !== false;
    const needle = q.trim().toLowerCase();
    return list.filter(r => {
      if (allowType && type !== 'all' && r.request_type !== type) return false;
      if (!needle) return true;
      const data = (r.incoming_data || {}) as Record<string, unknown>;
      const name = String(data.name || '').toLowerCase();
      const existing = (r.existing_lender_name || '').toLowerCase();
      const aliases = Array.isArray(data.aliases)
        ? (data.aliases as unknown[]).map(a => String(a).toLowerCase()).join(' ')
        : '';
      return name.includes(needle) || existing.includes(needle) || aliases.includes(needle);
    });
  };

  // Conflict resolution side panel state
  const [conflictPanelOpen, setConflictPanelOpen] = useState(false);
  const [conflictIndex, setConflictIndex] = useState(0);
  const openConflict = (id: string) => {
    const idx = conflictRequests.findIndex(r => r.id === id);
    if (idx >= 0) {
      setConflictIndex(idx);
      setConflictPanelOpen(true);
    }
  };

  // Side-by-side review drawer state.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const openReview = (id: string) => {
    setReviewRequestId(id);
    setReviewOpen(true);
  };
  const reviewRequest = requests.find(r => r.id === reviewRequestId) || null;

  // High-confidence exact duplicates: merge conflicts whose changes_diff is empty
  // (i.e. Flex sent us a record that is byte-for-byte identical to the existing one).
  const exactDuplicateConflicts = conflictRequests.filter(
    r => !r.changes_diff || Object.keys(r.changes_diff).length === 0,
  );

  const handleBatchKeepExisting = async () => {
    if (exactDuplicateConflicts.length === 0) return;
    setIsBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    for (const r of exactDuplicateConflicts) {
      const success = await rejectRequest(r.id, 'Batch: kept existing (exact duplicate)');
      if (success) ok++; else fail++;
    }
    setIsBulkProcessing(false);
    if (fail === 0) {
      toast({ title: 'Batch complete', description: `Kept existing for ${ok} exact duplicate${ok === 1 ? '' : 's'}.` });
    } else {
      toast({ title: 'Partial success', description: `Resolved ${ok}, failed ${fail}.`, variant: 'destructive' });
    }
  };

  // Map each pending request id → cluster size, so SyncRequestCard can show the
  // duplicate-cluster badge even when rendered outside a GroupedSyncRequestCard.
  const clusterSizeById = new Map<string, number>();
  for (const g of allGroups) {
    for (const m of g.members) clusterSizeById.set(m.id, g.members.length);
  }

  // Render a single underlying request — used by GroupedSyncRequestCard for both
  // single-member and multi-member groups.
  const renderMember = (request: LenderSyncRequest) => (
    <SyncRequestCard
      request={request}
      isSelected={selectedIds.has(request.id)}
      onToggleSelect={toggleSelect}
      onApprove={handleApprove}
      onReject={rejectRequest}
      onMerge={handleMerge}
      onReview={openReview}
      clusterSize={clusterSizeById.get(request.id) || 1}
    />
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(approvableRequests.map(r => r.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBulkApprove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeSelected.length === 0) return;
    
    setIsBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const request of safeSelected) {
      const success = await approveRequest(request.id);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsBulkProcessing(false);
    setSelectedIds(new Set());

    if (onLenderApproved) {
      onLenderApproved();
    }

    if (failCount === 0) {
      toast({ title: 'Bulk Approved', description: `Successfully approved ${successCount} lender(s).` });
    } else {
      toast({ 
        title: 'Partial Success', 
        description: `Approved ${successCount}, failed ${failCount}.`,
        variant: 'destructive'
      });
    }
  };

  const handleBulkReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedApprovable.length === 0) return;
    
    setIsBulkProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const request of selectedApprovable) {
      const success = await rejectRequest(request.id);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsBulkProcessing(false);
    setSelectedIds(new Set());

    if (failCount === 0) {
      toast({ title: 'Bulk Declined', description: `Successfully declined ${successCount} request(s).` });
    } else {
      toast({ 
        title: 'Partial Success', 
        description: `Declined ${successCount}, failed ${failCount}.`,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return null;
  }

  // Always show when rendered - parent controls visibility

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-4 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-destructive border border-destructive rounded-sm p-0.5" />
                <CardTitle className="text-base">Flex Sync Requests</CardTitle>
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="rounded-full h-6 w-6 p-0 flex items-center justify-center text-xs">
                    {pendingCount}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            {/* Sticky summary bar — gives a queue-wide read-out without scrolling */}
            <div className="sticky top-0 z-10 -mx-6 px-6 py-2 mb-3 bg-card/95 backdrop-blur border-b">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" className="gap-1">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold text-foreground">{pendingRequests.length}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    Conflicts <span className="font-semibold">{conflictRequests.length}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1 bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400">
                    <Layers className="h-3 w-3" />
                    Duplicates <span className="font-semibold">{duplicateCount}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1 bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400">
                    <UserPlus className="h-3 w-3" />
                    New <span className="font-semibold">{newLenderRequests.length}</span>
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <CheckCheck className="h-3 w-3" />
                    Selected <span className="font-semibold">{selectedIds.size}</span>
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRerunMatching}
                    disabled={isRematching}
                    title="Re-run entity matching engine across pending requests"
                  >
                    {isRematching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Layers className="h-3 w-3 mr-1" />}
                    Re-match
                  </Button>
                  {pendingRequests.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setConfirmDismissAllOpen(true); }}
                      disabled={isDismissingAll}
                      title="Dismiss all current pending sync requests (queue cleanup only — does not change any permissions)"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {isDismissingAll ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3 mr-1" />
                      )}
                      Dismiss queue
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); refetch(); }}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <LenderSyncSettingsPopover />
                </div>
              </div>
            </div>

            {/* Bulk actions bar */}
            {approvableRequests.length > 0 && (
              <div className="flex items-center justify-between mb-3 pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.size === approvableRequests.length && approvableRequests.length > 0}
                    onCheckedChange={(checked) => checked ? selectAll() : deselectAll()}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size > 0 
                      ? `${selectedApprovable.length} of ${approvableRequests.length} selected`
                      : `Select all (${approvableRequests.length})`
                    }
                  </span>
                </div>
                {selectedApprovable.length > 0 && (
                  <div className="flex items-center gap-2">
                    {unsafeSelectedCount > 0 && (
                      <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {unsafeSelectedCount} need individual review
                      </span>
                    )}
                    <Button 
                      size="sm" 
                      className="bg-gradient-to-r from-destructive to-destructive/70 text-destructive-foreground hover:from-destructive/90 hover:to-destructive/60 shadow-sm"
                      onClick={handleBulkReject}
                      disabled={isBulkProcessing}
                    >
                      {isBulkProcessing ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <X className="h-4 w-4 mr-1" />
                      )}
                      Decline All ({selectedApprovable.length})
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground hover:from-primary/90 hover:to-primary/60 shadow-sm"
                      onClick={handleBulkApprove}
                      disabled={isBulkProcessing || safeSelected.length === 0}
                      title={unsafeSelectedCount > 0
                        ? `Only ${safeSelected.length} of ${selectedApprovable.length} are safe to bulk-approve. Review the rest individually.`
                        : 'Approve all selected'}
                    >
                      {isBulkProcessing ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <CheckCheck className="h-4 w-4 mr-1" />
                      )}
                      Approve Safe ({safeSelected.length})
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full grid grid-cols-4">
                <TabsTrigger value="new" className="gap-1.5">
                  New
                  {newLenderRequests.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30">
                      {newLenderRequests.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="likely" className="gap-1.5">
                  Likely Match
                  {likelyMatchRequests.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      {likelyMatchRequests.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="conflicts" className="gap-1.5">
                  Conflict Review
                  {conflictRequests.length > 0 && (
                    <Badge variant="destructive" className="h-5 px-1.5 text-xs">{conflictRequests.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-1.5">
                  Completed
                  {processedRequests.length > 0 && (
                    <Badge variant="outline" className="h-5 px-1.5 text-xs">{processedRequests.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Per-tab search + filter row. State is scoped per tab. */}
              <div className="flex items-center gap-2 mt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={currentFilter.q}
                    onChange={(e) => setCurrentFilter({ ...currentFilter, q: e.target.value })}
                    placeholder="Search by name, alias, or matched lender…"
                    className="h-8 pl-7 text-sm"
                  />
                </div>
                {activeTab === 'completed' ? (
                  <Select
                    value={currentFilter.type}
                    onValueChange={(v) => setCurrentFilter({ ...currentFilter, type: v })}
                  >
                    <SelectTrigger className="h-8 w-[170px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="new_lender">New Funding Source</SelectItem>
                      <SelectItem value="update_existing">Update</SelectItem>
                      <SelectItem value="merge_conflict">Merge Conflict</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {(currentFilter.q || currentFilter.type !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => setCurrentFilter({ q: '', type: 'all' })}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <TabsContent value="new" className="mt-3">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {newLenderRequests.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">No new lender approvals waiting.</p>
                    )}
                    {groupSyncRequests(applyFilters(newLenderRequests, { allowTypeFilter: false })).map(group => (
                      <GroupedSyncRequestCard
                        key={group.key + ':' + group.members[0].id}
                        group={group}
                        onApprove={handleApprove}
                        onReject={rejectRequest}
                        onMerge={handleMerge}
                        renderMember={renderMember}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="likely" className="mt-3">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {likelyMatchRequests.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No likely matches. Try "Re-run matching" to refresh confidence.
                      </p>
                    )}
                    {applyFilters(likelyMatchRequests, { allowTypeFilter: false }).map(r => renderMember(r))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="conflicts" className="mt-3">
                {exactDuplicateConflicts.length > 0 && (
                  <div className="flex items-center justify-between mb-3 p-2 rounded-md border border-amber-500/30 bg-amber-500/5">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        {exactDuplicateConflicts.length} exact match{exactDuplicateConflicts.length === 1 ? '' : 'es'}
                      </span>
                      {' '}detected (Flex record is identical to existing). Safe to keep existing in batch.
                    </div>
                    <Button size="sm" variant="outline" onClick={handleBatchKeepExisting} disabled={isBulkProcessing}>
                      {isBulkProcessing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCheck className="h-3 w-3 mr-1" />}
                      Batch keep existing
                    </Button>
                  </div>
                )}
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {conflictRequests.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">No merge conflicts to resolve.</p>
                    )}
                    {applyFilters(conflictRequests, { allowTypeFilter: false }).map((request, idx) => {
                      const name = (request.incoming_data as Record<string, unknown>)?.name as string;
                      const diffCount = Object.keys(request.changes_diff || {}).length;
                      const confidence = getRequestConfidence(request);
                      const cluster = clusterSizeById.get(request.id) || 1;
                      return (
                        <button
                          key={request.id}
                          type="button"
                          onClick={() => openConflict(request.id)}
                          className="w-full text-left border rounded-lg p-3 bg-card hover:bg-muted/40 transition-colors flex items-center gap-3"
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">{name || 'Unknown lender'}</span>
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]">
                                {diffCount === 0 ? 'Exact match' : `${diffCount} field${diffCount === 1 ? '' : 's'} differ`}
                              </Badge>
                              {cluster > 1 && (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40 text-[10px] gap-1">
                                  <Layers className="h-3 w-3" />
                                  Cluster ×{cluster}
                                </Badge>
                              )}
                              {confidence.level !== 'none' && (
                                <Badge variant="outline" className={`text-[10px] ${confidence.className}`}>{confidence.label}</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                              {request.existing_lender_name && ` • Matches "${request.existing_lender_name}"`}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">#{idx + 1}</Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="completed" className="mt-3">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {processedRequests.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-8">Nothing has been processed yet.</p>
                    )}
                    {groupSyncRequests(applyFilters(processedRequests.slice(0, 100))).map(group => (
                      <GroupedSyncRequestCard
                        key={group.key + ':' + group.members[0].id}
                        group={group}
                        onApprove={handleApprove}
                        onReject={rejectRequest}
                        onMerge={handleMerge}
                        renderMember={renderMember}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
      <ConflictResolutionPanel
        open={conflictPanelOpen}
        onOpenChange={setConflictPanelOpen}
        conflicts={conflictRequests}
        initialIndex={conflictIndex}
        onApprove={handleApprove}
        onReject={rejectRequest}
        onMerge={handleMerge}
      />
      <LenderSyncReviewDrawer
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        request={reviewRequest}
        onApprove={handleApprove}
        onReject={rejectRequest}
        onMerge={handleMerge}
      />
    </Collapsible>
    <AlertDialog open={confirmDismissAllOpen} onOpenChange={setConfirmDismissAllOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss all current FLEx sync requests?</AlertDialogTitle>
          <AlertDialogDescription>
            This clears the current sync request queue ({pendingRequests.length} pending — including New, Likely Match, and Conflict Review) so you can start fresh.
            <br /><br />
            This does <strong>not</strong> change permissions, access, sync settings, or existing lender records. Already-completed items are left untouched.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDismissingAll}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDismissAll(); }}
            disabled={isDismissingAll}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDismissingAll ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Dismissing…</>
            ) : (
              <>Dismiss {pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'}</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
