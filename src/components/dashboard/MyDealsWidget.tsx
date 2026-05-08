import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Briefcase, ArrowUpRight, ChevronDown, ChevronUp, Clock, AlertCircle, MessageSquare, Search, Users, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useDealsContext } from '@/contexts/DealsContext';
import { usePipelineContext } from '@/contexts/PipelineContext';
import { useProfile } from '@/hooks/useProfile';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { useCompany } from '@/hooks/useCompany';
import { useIsDemoAccount } from '@/hooks/useIsDemoAccount';
import { DEMO_STALE_LIMIT } from '@/lib/demoAccount';
import { Deal, STAGE_CONFIG, STATUS_CONFIG } from '@/types/deal';
import { differenceInDays } from 'date-fns';
import { stripHtml } from '@/lib/stripHtml';

type DealScope = 'my' | 'all';
type StageFilter = 'all' | 'active' | 'at-risk' | 'stale';

interface MyDealsWidgetProps {
  variant?: 'compact' | 'expanded' | 'table';
  maxItems?: number;
}

export function MyDealsWidget({ variant = 'expanded', maxItems }: MyDealsWidgetProps) {
  const navigate = useNavigate();
  const { deals, isLoading } = useDealsContext();
  const { activePipelineId } = usePipelineContext();
  const { profile } = useProfile();
  const { preferences } = usePreferences();
  const { toggles } = useDashboardLayout();
  const { isAdmin } = useCompany();
  const isDemoAccount = useIsDemoAccount();
  const [filter, setFilter] = useState<StageFilter>('all');
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<DealScope>(isAdmin ? 'all' : 'my');
  // Non-admins are locked to 'my' scope — they can never view org-wide deals.
  const effectiveScope: DealScope = isAdmin ? scope : 'my';

  const myDeals = useMemo(() => {
    const displayName = profile?.display_name || profile?.first_name || '';
    const ACTIVE_STATUSES = new Set(['on-track', 'off-track', 'at-risk']);
    let filtered = deals.filter(d => {
      const status = (d.status || '').toLowerCase();
      // Restrict to active pipeline only
      if (activePipelineId && d.pipelineId && d.pipelineId !== activePipelineId) return false;
      // Restrict to active health statuses only (On Track, Off Track, At Risk)
      if (!ACTIVE_STATUSES.has(status)) return false;
      if (effectiveScope === 'my') {
        return d.manager?.toLowerCase() === displayName?.toLowerCase();
      }
      return true; // 'all' scope (admins only) — company RLS already scopes data
    });

    // Apply search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.company?.toLowerCase().includes(q) ||
        d.notes?.toLowerCase().includes(q) ||
        d.lenders?.some(l => l.name.toLowerCase().includes(q)) ||
        d.stage?.toLowerCase().includes(q)
      );
    }

    // Apply filter — "all" truly means ALL non-archived
    if (filter === 'active') {
      filtered = filtered.filter(d => d.status === 'on-track');
    } else if (filter === 'at-risk') {
      filtered = filtered.filter(d => d.status === 'at-risk' || d.status === 'off-track');
    } else if (filter === 'stale') {
      const yellowThreshold = preferences?.lenderUpdateYellowDays ?? 7;
      filtered = filtered.filter(d => {
        return d.lenders?.some(l => {
          if (l.trackingStatus !== 'active' || !l.updatedAt) return false;
          return differenceInDays(new Date(), new Date(l.updatedAt)) >= yellowThreshold;
        });
      });
    }
    // 'all' — no additional filtering, includes on-track, at-risk, off-track, on-hold, etc.

    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [deals, profile, filter, preferences, searchQuery, effectiveScope, activePipelineId]);

  // Demo account: cap the "stale" filter to exactly DEMO_STALE_LIMIT deals.
  const cappedDeals = (isDemoAccount && filter === 'stale')
    ? myDeals.slice(0, DEMO_STALE_LIMIT)
    : myDeals;
  const displayDeals = maxItems ? cappedDeals.slice(0, maxItems) : cappedDeals;

  // Count deals by status for filter badges
  const statusCounts = useMemo(() => {
    const displayName = profile?.display_name || profile?.first_name || '';
    const ACTIVE_STATUSES = new Set(['on-track', 'off-track', 'at-risk']);
    const mine = deals.filter(d => {
      const status = (d.status || '').toLowerCase();
      if (activePipelineId && d.pipelineId && d.pipelineId !== activePipelineId) return false;
      if (!ACTIVE_STATUSES.has(status)) return false;
      if (effectiveScope === 'my') return d.manager?.toLowerCase() === displayName?.toLowerCase();
      return true;
    });
    return {
      all: mine.length,
      active: mine.filter(d => d.status === 'on-track').length,
      atRisk: mine.filter(d => d.status === 'at-risk' || d.status === 'off-track').length,
    };
  }, [deals, profile, effectiveScope, activePipelineId]);

  const getStatusDot = (status: string) => {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
    return config ? config.dotColor : 'bg-muted';
  };

  const getStageLabel = (stage: string) => {
    const config = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG];
    return config ? config.label : stage;
  };

  const activeLenderCount = (deal: Deal) => deal.lenders?.filter(l => l.trackingStatus === 'active').length || 0;

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="h-full">
      <Card className="h-full flex flex-col">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-base font-medium flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                {effectiveScope === 'all' ? 'All Deals' : 'My Deals'}
                <Badge variant="secondary" className="text-xs">{statusCounts.all}</Badge>
              </div>
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <ToggleGroup
                    type="single"
                    value={effectiveScope}
                    onValueChange={(v) => { if (v) setScope(v as DealScope); }}
                    className="mr-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ToggleGroupItem value="my" className="text-[10px] h-6 px-2">Mine</ToggleGroupItem>
                    <ToggleGroupItem value="all" className="text-[10px] h-6 px-2">All</ToggleGroupItem>
                  </ToggleGroup>
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex-1 min-h-0 flex flex-col">
          <CardContent className="pt-0 space-y-3 flex-1 min-h-0 flex flex-col">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search deals, lenders, notes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Filters */}
            <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as StageFilter)} className="justify-start">
              <ToggleGroupItem value="all" className="text-xs h-7 px-2.5">All</ToggleGroupItem>
              <ToggleGroupItem value="active" className="text-xs h-7 px-2.5">On Track</ToggleGroupItem>
              <ToggleGroupItem value="at-risk" className="text-xs h-7 px-2.5 gap-1">
                <AlertCircle className="h-3 w-3" />At Risk
                {statusCounts.atRisk > 0 && <span className="text-[10px] text-destructive">({statusCounts.atRisk})</span>}
              </ToggleGroupItem>
              <ToggleGroupItem value="stale" className="text-xs h-7 px-2.5 gap-1">
                <Clock className="h-3 w-3" />Stale
              </ToggleGroupItem>
            </ToggleGroup>

            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-1">
                {displayDeals.length === 0 ? (
                  <div className="text-center py-6">
                    <Briefcase className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No deals match your search.' : 'No deals match this filter.'}
                    </p>
                    {!searchQuery && filter !== 'all' && (
                      <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setFilter('all')}>
                        View all deals
                      </Button>
                    )}
                  </div>
                ) : displayDeals.map(deal => {
                  const lenderCount = activeLenderCount(deal);
                  return (
                    <TooltipProvider key={deal.id}>
                      <Tooltip delayDuration={400}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => navigate(`/deal/${deal.id}`)}
                            className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                          >
                            {/* Status dot */}
                            <div className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${getStatusDot(deal.status)}`} />

                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">{deal.company}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">{getStageLabel(deal.stage)}</Badge>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{lenderCount} active lender{lenderCount !== 1 ? 's' : ''}</span>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                                </span>
                              </div>

                              {/* Status note preview - strip HTML for compact view */}
                              {toggles.showStatusNotes && deal.notes && (
                                <div className="flex items-start gap-1.5 mt-1">
                                  <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                                  <p className="text-xs text-muted-foreground line-clamp-1">{stripHtml(deal.notes)}</p>
                                </div>
                              )}

                              {/* Next milestone */}
                              {deal.milestones?.filter(m => !m.completed && m.dueDate).sort((a, b) => 
                                new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
                              ).slice(0, 1).map(m => (
                                <div key={m.id} className="flex items-center gap-1.5 text-xs text-primary mt-0.5">
                                  <span className="font-medium">Next:</span>
                                  <span className="truncate">{m.title}</span>
                                  {m.dueDate && <span className="text-muted-foreground shrink-0">· {new Date(m.dueDate).toLocaleDateString()}</span>}
                                </div>
                              ))}
                            </div>

                            <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs p-3 space-y-2">
                          <p className="text-sm font-medium">{deal.company}</p>
                          {deal.lenders && deal.lenders.filter(l => l.trackingStatus === 'active').length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <Users className="h-3 w-3" /> Top Lenders
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {deal.lenders.filter(l => l.trackingStatus === 'active').slice(0, 4).map(l => (
                                  <Badge key={l.id} variant="outline" className="text-[10px]">{l.name}</Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {deal.milestones?.filter(m => !m.completed && m.dueDate).sort((a, b) => 
                            new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
                          ).slice(0, 1).map(m => (
                            <div key={m.id} className="text-xs">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                Next: {m.title} · {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : 'No date'}
                              </span>
                            </div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </ScrollArea>

            {maxItems && myDeals.length > maxItems && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => navigate('/deals')}>
                View all {myDeals.length} deals
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
