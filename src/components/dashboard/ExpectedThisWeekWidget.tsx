import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useDealsContext } from '@/contexts/DealsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarDays, RefreshCw, ChevronDown, ChevronRight, Milestone, ClipboardList, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { startOfWeek, endOfWeek, isToday, isBefore, startOfDay, format } from 'date-fns';

const TOGGLE_STORAGE_KEY = 'expected-this-week-mode';

type ViewMode = 'week' | 'today';

interface MilestoneItem {
  id: string;
  title: string;
  due_date: string;
  completed: boolean;
  deal_id: string;
  deal_name: string;
}

interface OutstandingItem {
  id: string;
  description: string;
  due_date: string | null;
  eta: string | null;
  assigned_to: string | null;
  status: string;
  deal_id: string;
  deal_name: string;
}

interface DealGroup {
  dealId: string;
  dealName: string;
  milestones: MilestoneItem[];
  outstandingItems: OutstandingItem[];
}

function getDateBadge(dateStr: string) {
  const date = startOfDay(new Date(dateStr));
  const today = startOfDay(new Date());

  if (isBefore(date, today)) {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue</Badge>;
  }
  if (isToday(date)) {
    return <Badge className="bg-warning text-warning-foreground text-[10px] px-1.5 py-0">Due Today</Badge>;
  }
  return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">This Week</Badge>;
}

export function ExpectedThisWeekWidget() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { deals } = useDealsContext();
  const displayName = profile?.display_name || '';

  const [mode, setMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(TOGGLE_STORAGE_KEY);
    return saved === 'today' ? 'today' : 'week';
  });

  const toggleMode = (m: ViewMode) => {
    setMode(m);
    localStorage.setItem(TOGGLE_STORAGE_KEY, m);
  };

  // Determine date range
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    if (mode === 'today') {
      const s = startOfDay(now);
      const e = new Date(s);
      e.setHours(23, 59, 59, 999);
      return { rangeStart: s, rangeEnd: e };
    }
    return {
      rangeStart: startOfWeek(now, { weekStartsOn: 1 }),
      rangeEnd: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }, [mode]);

  const startStr = format(rangeStart, 'yyyy-MM-dd');
  const endStr = format(rangeEnd, 'yyyy-MM-dd');

  // Build deal ID set based on role logic
  const relevantDealIds = useMemo(() => {
    if (!displayName || !deals.length) return [];

    const ids = new Set<string>();
    const lowerName = displayName.toLowerCase();

    deals.forEach(deal => {
      const isManager = deal.manager?.toLowerCase() === lowerName;
      const isAnalyst = deal.analyst?.toLowerCase() === lowerName;
      const isOwner = deal.dealOwner?.toLowerCase() === lowerName;

      if (isManager) {
        // MODE 1: manager sees ALL their deals regardless of status
        ids.add(deal.id);
      } else if (isAnalyst || isOwner) {
        // MODE 2: team member only sees active deals
        const inactiveStatuses = ['archived'];
        const inactiveStages = ['closed-lost', 'closed-won', 'on-hold'];
        if (!inactiveStatuses.includes(deal.status ?? '') && !inactiveStages.includes(deal.stage)) {
          ids.add(deal.id);
        }
      }
    });

    return Array.from(ids);
  }, [deals, displayName]);

  // Fetch milestones for the week
  const { data: milestones = [], isLoading: milestonesLoading, refetch: refetchMilestones } = useQuery({
    queryKey: ['expected-milestones', startStr, endStr, relevantDealIds.join(',')],
    enabled: relevantDealIds.length > 0,
    queryFn: async () => {
      if (relevantDealIds.length === 0) return [];
      const { data, error } = await supabase
        .from('deal_milestones')
        .select('id, title, due_date, completed, deal_id')
        .in('deal_id', relevantDealIds)
        .eq('completed', false)
        .gte('due_date', startStr)
        .lte('due_date', endStr)
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Also fetch overdue (past due_date, not completed)
      const { data: overdueData, error: overdueErr } = await supabase
        .from('deal_milestones')
        .select('id, title, due_date, completed, deal_id')
        .in('deal_id', relevantDealIds)
        .eq('completed', false)
        .lt('due_date', startStr)
        .order('due_date', { ascending: true });

      if (overdueErr) throw overdueErr;

      return [...(overdueData || []), ...(data || [])];
    },
  });

  // Fetch outstanding items for the week
  const { data: outstandingItems = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['expected-outstanding', startStr, endStr, relevantDealIds.join(',')],
    enabled: relevantDealIds.length > 0,
    queryFn: async () => {
      if (relevantDealIds.length === 0) return [];

      // Items with due_date or eta in range
      const { data, error } = await supabase
        .from('outstanding_items')
        .select('id, description, due_date, eta, assigned_to, status, deal_id')
        .in('deal_id', relevantDealIds)
        .neq('status', 'completed')
        .or(`due_date.gte.${startStr},eta.gte.${startStr}`)
        .or(`due_date.lte.${endStr},eta.lte.${endStr}`)
        .order('due_date', { ascending: true });

      if (error) throw error;

      // Also fetch overdue
      const { data: overdueData, error: overdueErr } = await supabase
        .from('outstanding_items')
        .select('id, description, due_date, eta, assigned_to, status, deal_id')
        .in('deal_id', relevantDealIds)
        .neq('status', 'completed')
        .not('due_date', 'is', null)
        .lt('due_date', startStr)
        .order('due_date', { ascending: true });

      if (overdueErr) throw overdueErr;

      // Deduplicate
      const all = [...(overdueData || []), ...(data || [])];
      const seen = new Set<string>();
      return all.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    },
  });

  // Build deal name map
  const dealNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    deals.forEach(d => { map[d.id] = d.company; });
    return map;
  }, [deals]);

  // Group by deal
  const dealGroups = useMemo(() => {
    const groupMap: Record<string, DealGroup> = {};

    milestones.forEach(m => {
      if (!groupMap[m.deal_id]) {
        groupMap[m.deal_id] = {
          dealId: m.deal_id,
          dealName: dealNameMap[m.deal_id] || 'Unknown Deal',
          milestones: [],
          outstandingItems: [],
        };
      }
      groupMap[m.deal_id].milestones.push({
        ...m,
        deal_name: dealNameMap[m.deal_id] || 'Unknown Deal',
      });
    });

    outstandingItems.forEach(item => {
      if (!groupMap[item.deal_id]) {
        groupMap[item.deal_id] = {
          dealId: item.deal_id,
          dealName: dealNameMap[item.deal_id] || 'Unknown Deal',
          milestones: [],
          outstandingItems: [],
        };
      }
      groupMap[item.deal_id].outstandingItems.push({
        ...item,
        deal_name: dealNameMap[item.deal_id] || 'Unknown Deal',
      });
    });

    return Object.values(groupMap).sort((a, b) => a.dealName.localeCompare(b.dealName));
  }, [milestones, outstandingItems, dealNameMap]);

  const totalCount = milestones.length + outstandingItems.length;
  const isLoading = milestonesLoading || itemsLoading;

  const handleRefresh = useCallback(() => {
    refetchMilestones();
    refetchItems();
  }, [refetchMilestones, refetchItems]);

  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Expected {mode === 'today' ? 'Today' : 'This Week'}
            {totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">{totalCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border bg-muted/50 p-0.5">
              <Button
                variant={mode === 'today' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => toggleMode('today')}
              >
                Today
              </Button>
              <Button
                variant={mode === 'week' ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => toggleMode('week')}
              >
                This Week
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh}>
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : dealGroups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No milestones or pending items due {mode === 'today' ? 'today' : 'this week'}.</p>
            <p className="text-xs mt-1">You're all caught up.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {dealGroups.map(group => (
              <DealGroupCard key={group.dealId} group={group} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DealGroupCard({ group }: { group: DealGroup }) {
  const [isOpen, setIsOpen] = useState(true);
  const itemCount = group.milestones.length + group.outstandingItems.length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors w-full text-left">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="font-medium text-sm text-foreground truncate">{group.dealName}</span>
          <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{itemCount}</Badge>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 pr-2 pb-2 space-y-1">
          {group.milestones.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1 pt-1">
                <Milestone className="h-3 w-3" /> Milestones
              </p>
              {group.milestones.map(m => (
                <Link
                  key={m.id}
                  to={`/deal/${m.deal_id}?tab=milestones`}
                  className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  <span className="text-sm text-foreground truncate flex-1">{m.title}</span>
                  {m.due_date && getDateBadge(m.due_date)}
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {m.due_date ? format(new Date(m.due_date), 'EEE, MMM d') : ''}
                  </span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              ))}
            </div>
          )}
          {group.outstandingItems.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1 pt-1">
                <ClipboardList className="h-3 w-3" /> Pending Items
              </p>
              {group.outstandingItems.map(item => {
                const effectiveDate = item.due_date || item.eta;
                return (
                  <Link
                    key={item.id}
                    to={`/deal/${item.deal_id}?tab=outstanding`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-sm text-foreground truncate flex-1">{item.description}</span>
                    {item.assigned_to && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{item.assigned_to}</span>
                    )}
                    {effectiveDate && getDateBadge(effectiveDate)}
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {effectiveDate ? format(new Date(effectiveDate), 'EEE, MMM d') : ''}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
