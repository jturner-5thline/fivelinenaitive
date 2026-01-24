import { useState } from 'react';
import { Bell, Check, X, GitMerge, ChevronDown, ChevronRight, AlertTriangle, UserPlus, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { useLenderSyncRequests, LenderSyncRequest } from '@/hooks/useLenderSyncRequests';
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
  onApprove: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
  onMerge: (id: string, data: Record<string, unknown>) => Promise<boolean>;
}

function SyncRequestCard({ request, onApprove, onReject, onMerge }: SyncRequestCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleMerge = async () => {
    // For merge conflicts, we'll use the incoming data for now
    // A more sophisticated UI could let users pick field-by-field
    setIsProcessing(true);
    const success = await onMerge(request.id, incomingData);
    setIsProcessing(false);
    if (success) {
      toast({ title: 'Merged', description: `${lenderName} has been updated with Flex data.` });
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
      case 'new_lender': return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">New Lender</Badge>;
      case 'update_existing': return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Update</Badge>;
      case 'merge_conflict': return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Merge Conflict</Badge>;
    }
  };

  const isPending = request.status === 'pending';

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg p-3 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
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
                  <Button size="sm" variant="default" onClick={handleMerge} disabled={isProcessing}>
                    <GitMerge className="h-3 w-3 mr-1" />
                    Use Flex Data
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={handleReject} disabled={isProcessing}>
                    <X className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="default" onClick={handleApprove} disabled={isProcessing}>
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
              <p className="text-xs font-medium text-muted-foreground uppercase">Lender Details</p>
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
    </Collapsible>
  );
}

export function LenderSyncRequestsPanel() {
  const { requests, pendingCount, loading, refetch, approveRequest, rejectRequest, mergeRequest } = useLenderSyncRequests();
  const [showAll, setShowAll] = useState(false);

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  if (loading) {
    return null;
  }

  if (pendingCount === 0 && !showAll) {
    return null;
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-base">Flex Sync Requests</CardTitle>
            {pendingCount > 0 && (
              <Badge variant="destructive" className="rounded-full">
                {pendingCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show Pending Only' : 'Show All'}
            </Button>
          </div>
        </div>
        <CardDescription>
          Review and approve lender changes from Flex
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {pendingRequests.map(request => (
              <SyncRequestCard
                key={request.id}
                request={request}
                onApprove={approveRequest}
                onReject={rejectRequest}
                onMerge={mergeRequest}
              />
            ))}
            
            {showAll && processedRequests.length > 0 && (
              <>
                <Separator className="my-4" />
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Previously Processed</p>
                {processedRequests.slice(0, 10).map(request => (
                  <SyncRequestCard
                    key={request.id}
                    request={request}
                    onApprove={approveRequest}
                    onReject={rejectRequest}
                    onMerge={mergeRequest}
                  />
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
