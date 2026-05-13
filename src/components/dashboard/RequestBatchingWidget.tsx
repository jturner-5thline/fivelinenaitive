import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import {
  Inbox, CheckCircle2, XCircle, Eye, RefreshCw, Clock, AlertTriangle,
  ChevronDown, ChevronRight, Send, FileText, Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import DOMPurify from 'dompurify';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useClientRequests,
  useClientRequestDrafts,
  useDraftRequests,
  useApproveDraft,
  useRejectDraft,
  usePendingRequestStats,
  type ClientRequestDraft,
} from '@/hooks/useClientRequests';

const COUNT_THRESHOLD = 5;
const DAYS_THRESHOLD = 5;

/* ---------- Pending Requests Tab ---------- */
function PendingRequestsView() {
  const { data: stats, isLoading } = usePendingRequestStats();

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!stats || stats.totalPending === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
        <Inbox className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No pending requests</p>
      </div>
    );
  }

  const dealEntries = Object.entries(stats.byDeal);

  return (
    <div className="space-y-2">
      {dealEntries.map(([dealId, info]) => {
        const ageInDays = differenceInDays(new Date(), new Date(info.oldest));
        const countUntilTrigger = COUNT_THRESHOLD - info.count;
        const daysUntilTrigger = DAYS_THRESHOLD - ageInDays;

        let triggerLabel = '';
        if (info.count >= COUNT_THRESHOLD) {
          triggerLabel = 'Ready to batch';
        } else if (ageInDays >= DAYS_THRESHOLD) {
          triggerLabel = 'Time threshold reached';
        } else if (countUntilTrigger <= daysUntilTrigger) {
          triggerLabel = `${countUntilTrigger} request${countUntilTrigger !== 1 ? 's' : ''} away`;
        } else {
          triggerLabel = `Triggers in ${daysUntilTrigger}d`;
        }

        const isReady = info.count >= COUNT_THRESHOLD || ageInDays >= DAYS_THRESHOLD;

        return (
          <div key={dealId} className="flex items-center justify-between p-2.5 rounded-md border border-border/40 bg-muted/10">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{info.client_name || 'Unknown Client'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">{info.count} pending</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Oldest: {ageInDays}d ago</span>
              </div>
            </div>
            <Badge variant={isReady ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
              {isReady && <AlertTriangle className="h-3 w-3 mr-1" />}
              {triggerLabel}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Draft Preview Dialog ---------- */
function DraftPreviewDialog({
  draft,
  open,
  onOpenChange,
}: {
  draft: ClientRequestDraft;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: linkedRequests } = useDraftRequests(draft.id);
  const approveMut = useApproveDraft();
  const rejectMut = useRejectDraft();
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Draft Preview
            {draft.new_requests_pending && (
              <Badge variant="outline" className="text-[10px] border-warning text-warning">
                New requests pending
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Meta */}
          <div className="text-sm space-y-1">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-16">To:</span>
              <span>{draft.client_name} {draft.client_email ? `<${draft.client_email}>` : ''}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-16">Trigger:</span>
              <Badge variant="secondary" className="text-[10px]">{draft.trigger_reason}</Badge>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-16">Requests:</span>
              <span>{draft.request_count} items</span>
            </div>
          </div>

          <Separator />

          {/* Included requests */}
          {linkedRequests && linkedRequests.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-3 w-3" />
                View included requests ({linkedRequests.length})
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-1">
                {linkedRequests.map((r, i) => (
                  <div key={r.id} className="text-xs p-2 rounded bg-muted/20 border border-border/20">
                    <span className="font-medium">{i + 1}. {r.title}</span>
                    {r.description && <p className="text-muted-foreground mt-0.5">{r.description}</p>}
                    <p className="text-muted-foreground mt-0.5">
                      Added {format(new Date(r.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Email body preview */}
          <div className="border border-border/30 rounded-md p-4 bg-background">
            <div
              className="text-sm prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.body_html || '', { USE_PROFILES: { html: true } }) }}
            />
          </div>

          {/* Reject form */}
          {showRejectForm && (
            <div className="space-y-2">
              <Textarea
                placeholder="Rejection notes (optional)..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="text-sm"
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!showRejectForm ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectForm(true)}
                disabled={draft.status !== 'needs_approval'}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  approveMut.mutate(draft.id);
                  onOpenChange(false);
                }}
                disabled={approveMut.isPending || draft.status !== 'needs_approval'}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Approve
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowRejectForm(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  rejectMut.mutate({ draftId: draft.id, notes: rejectionNotes });
                  onOpenChange(false);
                }}
                disabled={rejectMut.isPending}
              >
                Confirm Rejection
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Draft Approval Tab ---------- */
function DraftApprovalView() {
  const { data: drafts, isLoading, refetch } = useClientRequestDrafts();
  const [previewDraft, setPreviewDraft] = useState<ClientRequestDraft | null>(null);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const needsApproval = drafts?.filter(d => d.status === 'needs_approval') || [];
  const processed = drafts?.filter(d => d.status !== 'needs_approval') || [];

  return (
    <>
      {previewDraft && (
        <DraftPreviewDialog
          draft={previewDraft}
          open={!!previewDraft}
          onOpenChange={(v) => !v && setPreviewDraft(null)}
        />
      )}

      {needsApproval.length === 0 && processed.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No drafts to review</p>
        </div>
      ) : (
        <div className="space-y-3">
          {needsApproval.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Needs Approval ({needsApproval.length})
              </p>
              {needsApproval.map(draft => (
                <DraftRow key={draft.id} draft={draft} onPreview={() => setPreviewDraft(draft)} />
              ))}
            </div>
          )}
          {processed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Processed ({processed.length})
              </p>
              {processed.slice(0, 5).map(draft => (
                <DraftRow key={draft.id} draft={draft} onPreview={() => setPreviewDraft(draft)} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DraftRow({ draft, onPreview }: { draft: ClientRequestDraft; onPreview: () => void }) {
  const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    needs_approval: { variant: 'default', label: 'Needs Approval' },
    approved: { variant: 'outline', label: 'Approved' },
    rejected: { variant: 'destructive', label: 'Rejected' },
    sent: { variant: 'secondary', label: 'Sent' },
  };
  const cfg = statusConfig[draft.status] || statusConfig.needs_approval;

  return (
    <div
      className="flex items-center justify-between p-2.5 rounded-md border border-border/40 bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors"
      onClick={onPreview}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{draft.client_name || 'Unknown Client'}</p>
          {draft.new_requests_pending && (
            <Badge variant="outline" className="text-[10px] border-warning text-warning">New</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {draft.request_count} requests · {format(new Date(draft.created_at), 'MMM d, h:mm a')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

/* ---------- Main Widget ---------- */
export function RequestBatchingWidget() {
  const { data: stats } = usePendingRequestStats();
  const { data: drafts } = useClientRequestDrafts('needs_approval');
  const [tab, setTab] = useState<string>('pending');

  const pendingCount = stats?.totalPending || 0;
  const approvalCount = drafts?.length || 0;
  const totalBadge = pendingCount + approvalCount;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Request Batching
          {totalBadge > 0 && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{totalBadge}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto pt-0">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full h-8 mb-3">
            <TabsTrigger value="pending" className="flex-1 text-xs gap-1">
              <Clock className="h-3 w-3" />
              Pending
              {pendingCount > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-1">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex-1 text-xs gap-1">
              <FileText className="h-3 w-3" />
              Drafts
              {approvalCount > 0 && <Badge variant="default" className="text-[9px] h-4 px-1 ml-1">{approvalCount}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-0">
            <PendingRequestsView />
          </TabsContent>
          <TabsContent value="drafts" className="mt-0">
            <DraftApprovalView />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
