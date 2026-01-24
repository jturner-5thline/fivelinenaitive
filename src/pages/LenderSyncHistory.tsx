import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, History, UserPlus, RefreshCw, AlertTriangle, Check, X, GitMerge, Search, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { DealsHeader } from '@/components/deals/DealsHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLenderSyncRequests, LenderSyncRequest } from '@/hooks/useLenderSyncRequests';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'merged';
type TypeFilter = 'all' | 'new_lender' | 'update_existing' | 'merge_conflict';

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">Pending</Badge>;
    case 'approved':
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">Approved</Badge>;
    case 'rejected':
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">Rejected</Badge>;
    case 'merged':
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">Merged</Badge>;
    case 'auto_approved':
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30">Auto-Approved</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'new_lender':
      return <UserPlus className="h-4 w-4 text-green-500" />;
    case 'update_existing':
      return <RefreshCw className="h-4 w-4 text-blue-500" />;
    case 'merge_conflict':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return null;
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'new_lender':
      return 'New Lender';
    case 'update_existing':
      return 'Update';
    case 'merge_conflict':
      return 'Merge Conflict';
    default:
      return type;
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '(empty)';
  if (Array.isArray(val)) return val.join(', ') || '(empty)';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

interface SyncLogEntryProps {
  request: LenderSyncRequest;
}

function SyncLogEntry({ request }: SyncLogEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const incomingData = request.incoming_data as Record<string, unknown>;
  const lenderName = incomingData.name as string;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            {getTypeIcon(request.request_type)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{lenderName}</span>
                <Badge variant="secondary" className="text-xs">
                  {getTypeLabel(request.request_type)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}</span>
                {request.existing_lender_name && (
                  <>
                    <span>•</span>
                    <span>Matched: {request.existing_lender_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {getStatusBadge(request.status)}
          </div>
        </div>
        
        <CollapsibleContent>
          <Separator />
          <div className="p-4 space-y-4 bg-muted/30">
            {/* Processing info */}
            {request.processed_at && (
              <div className="flex items-center gap-2 text-sm">
                {request.status === 'approved' || request.status === 'auto_approved' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : request.status === 'rejected' ? (
                  <X className="h-4 w-4 text-red-500" />
                ) : request.status === 'merged' ? (
                  <GitMerge className="h-4 w-4 text-blue-500" />
                ) : null}
                <span className="text-muted-foreground">
                  Processed {formatDistanceToNow(new Date(request.processed_at), { addSuffix: true })}
                </span>
                {request.processing_notes && (
                  <span className="text-foreground">— {request.processing_notes}</span>
                )}
              </div>
            )}

            {/* Changes diff */}
            {request.changes_diff && Object.keys(request.changes_diff).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Changes</p>
                <div className="space-y-1.5 text-sm">
                  {Object.entries(request.changes_diff).map(([field, { old: oldVal, new: newVal }]) => (
                    <div key={field} className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground capitalize truncate">{field.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-destructive line-through truncate max-w-[150px]">{formatValue(oldVal)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-green-600 dark:text-green-400 truncate max-w-[150px]">{formatValue(newVal)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Incoming data for new lenders */}
            {request.request_type === 'new_lender' && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Lender Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
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
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-muted-foreground">Industries:</span> {incomingData.industries.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Source info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Source: {request.source_system}</span>
              {request.source_lender_id && <span>Source ID: {request.source_lender_id}</span>}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function LenderSyncHistory() {
  const { requests, loading, error, refetch } = useLenderSyncRequests();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Filter requests
  const filteredRequests = requests.filter(req => {
    const incomingData = req.incoming_data as Record<string, unknown>;
    const lenderName = (incomingData.name as string || '').toLowerCase();
    
    // Search filter
    if (searchQuery && !lenderName.includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Status filter
    if (statusFilter !== 'all' && req.status !== statusFilter) {
      return false;
    }
    
    // Type filter
    if (typeFilter !== 'all' && req.request_type !== typeFilter) {
      return false;
    }
    
    return true;
  });

  // Stats
  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved' || r.status === 'auto_approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    merged: requests.filter(r => r.status === 'merged').length,
  };

  return (
    <>
      <Helmet>
        <title>Lender Sync History - nAItive</title>
        <meta name="description" content="Track all lender changes synced from Flex" />
      </Helmet>

      <div className="bg-background min-h-screen">
        <DealsHeader />

        <main className="container mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" className="gap-2 mb-6" asChild>
            <Link to="/lenders">
              <ArrowLeft className="h-4 w-4" />
              Back to Lenders
            </Link>
          </Button>

          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-2 bg-brand-gradient bg-clip-text text-transparent dark:bg-gradient-to-b dark:from-white dark:to-[hsl(292,46%,72%)]">
                  <History className="h-6 w-6 text-foreground" />
                  Lender Sync History
                </h1>
                <p className="text-muted-foreground">Track all lender changes synced from Flex</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">Total Requests</p>
                </CardContent>
              </Card>
              <Card className="border-amber-500/30">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </CardContent>
              </Card>
              <Card className="border-green-500/30">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </CardContent>
              </Card>
              <Card className="border-red-500/30">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/30">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-blue-600">{stats.merged}</div>
                  <p className="text-xs text-muted-foreground">Merged</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by lender name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="merged">Merged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="new_lender">New Lender</SelectItem>
                      <SelectItem value="update_existing">Update</SelectItem>
                      <SelectItem value="merge_conflict">Merge Conflict</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : error ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>Error loading sync history: {error}</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : filteredRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {requests.length === 0 ? (
                    <p>No sync requests yet. When lenders are synced from Flex, they'll appear here.</p>
                  ) : (
                    <p>No requests match your filters.</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredRequests.length} of {requests.length} requests
                </p>
                {filteredRequests.map(request => (
                  <SyncLogEntry key={request.id} request={request} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
