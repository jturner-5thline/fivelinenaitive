import { useState, useMemo, useRef, useCallback } from 'react';
import { Deal } from '@/types/deal';
import { useMultiDealPipelineConfigs, DealPipelineConfig } from '@/hooks/useDealPipelineConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { CalendarDays, Minus, Plus, Clock, ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff, Settings2, Trash2, PlusCircle, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, differenceInCalendarWeeks, min as dateMin, max as dateMax } from 'date-fns';

interface DealsTimelineViewProps {
  deals: Deal[];
}

const STAGE_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
];

// Deal-level row colors for multi-deal Gantt differentiation
const DEAL_ROW_COLORS = [
  'border-l-blue-500',
  'border-l-violet-500',
  'border-l-amber-500',
  'border-l-emerald-500',
  'border-l-rose-500',
  'border-l-cyan-500',
  'border-l-indigo-500',
  'border-l-pink-500',
];

function computeStageRanges(config: DealPipelineConfig) {
  const startDate = new Date(config.startDate + 'T00:00:00');
  return config.stages.map((stage, i) => {
    const prevWeeks = config.stages.slice(0, i).reduce((sum, s) => sum + s.weeks, 0);
    const stageStart = addDays(startDate, prevWeeks * 7);
    const stageEnd = addDays(stageStart, stage.weeks * 7);
    return { ...stage, startDate: stageStart, endDate: stageEnd };
  });
}

function getTotalWeeks(config: DealPipelineConfig) {
  return config.stages.reduce((sum, s) => sum + s.weeks, 0);
}

export function DealsTimelineView({ deals }: DealsTimelineViewProps) {
  // Track which deals are visible on the timeline
  const [visibleDealIds, setVisibleDealIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('timeline-visible-deals');
    if (stored) {
      try { return new Set(JSON.parse(stored)); } catch { /* ignore */ }
    }
    return new Set(deals.slice(0, 5).map(d => d.id));
  });

  // Track which deal's editor is expanded
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  // Drag state
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; origStartDate: string; containerWidth: number; globalWeeks: number; globalStartDate: Date } | null>(null);

  const dealCreatedAtMap = useMemo(() => {
    const map: Record<string, string> = {};
    deals.forEach(d => { map[d.id] = d.createdAt; });
    return map;
  }, [deals]);

  const allDealIds = useMemo(() => deals.map(d => d.id), [deals]);

  const { configs, isLoading, updateStageWeeks, updateStartDate, updateStageName, addStage, removeStage } = useMultiDealPipelineConfigs(
    allDealIds,
    dealCreatedAtMap
  );

  const toggleDealVisibility = (dealId: string) => {
    setVisibleDealIds(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      localStorage.setItem('timeline-visible-deals', JSON.stringify([...next]));
      return next;
    });
  };

  const showAll = () => {
    const all = new Set(deals.map(d => d.id));
    setVisibleDealIds(all);
    localStorage.setItem('timeline-visible-deals', JSON.stringify([...all]));
  };

  const hideAll = () => {
    setVisibleDealIds(new Set());
    localStorage.setItem('timeline-visible-deals', JSON.stringify([]));
  };

  const ganttAreaRef = useRef<HTMLDivElement>(null);
  const globalInfoRef = useRef({ globalWeeks: 16, globalStart: new Date() });

  const handleDragStart = useCallback((e: React.MouseEvent, dealId: string, containerEl: HTMLDivElement) => {
    e.preventDefault();
    const cfg = configs[dealId];
    if (!cfg) return;
    setDraggingDealId(dealId);
    const info = globalInfoRef.current;
    dragRef.current = {
      startX: e.clientX,
      origStartDate: cfg.startDate,
      containerWidth: containerEl.getBoundingClientRect().width,
      globalWeeks: info.globalWeeks,
      globalStartDate: info.globalStart,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const pxPerWeek = dragRef.current.containerWidth / Math.max(dragRef.current.globalWeeks, 1);
      const deltaWeeks = Math.round(dx / pxPerWeek);
      if (deltaWeeks === 0) return;
      const origDate = new Date(dragRef.current.origStartDate + 'T00:00:00');
      const newDate = addDays(origDate, deltaWeeks * 7);
      const newDateStr = newDate.toISOString().split('T')[0];
      updateStartDate(dealId, newDateStr);
    };

    const onMouseUp = () => {
      setDraggingDealId(null);
      dragRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [configs, updateStartDate]);

  const visibleDeals = deals.filter(d => visibleDealIds.has(d.id));

  // Compute global date range across all visible deals for a unified Gantt axis
  const { globalStart, globalEnd, globalWeeks, weekTicks } = useMemo(() => {
    if (visibleDeals.length === 0 || isLoading) {
      const now = new Date();
      return { globalStart: now, globalEnd: addDays(now, 7 * 16), globalWeeks: 16, weekTicks: [] as Date[] };
    }

    let earliest = new Date('2099-01-01');
    let latest = new Date('2000-01-01');

    for (const deal of visibleDeals) {
      const cfg = configs[deal.id];
      if (!cfg) continue;
      const start = new Date(cfg.startDate + 'T00:00:00');
      const totalW = getTotalWeeks(cfg);
      const end = addDays(start, totalW * 7);
      if (start < earliest) earliest = start;
      if (end > latest) latest = end;
    }

    const weeks = Math.max(differenceInCalendarWeeks(latest, earliest, { weekStartsOn: 1 }), 1);
    const ticks = Array.from({ length: weeks + 1 }, (_, i) => addDays(earliest, i * 7));

    return { globalStart: earliest, globalEnd: latest, globalWeeks: weeks, weekTicks: ticks };
  }, [visibleDeals, configs, isLoading]);

  // Keep ref in sync for drag handler
  globalInfoRef.current = { globalWeeks, globalStart };

  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No deals to display on timeline.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Deal visibility controls */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Deals on Timeline</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={showAll}>Show All</Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={hideAll}>Hide All</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex flex-wrap gap-2">
            {deals.map((deal, idx) => {
              const isVisible = visibleDealIds.has(deal.id);
              const cfg = configs[deal.id];
              const totalW = cfg ? getTotalWeeks(cfg) : 0;
              return (
                <button
                  key={deal.id}
                  onClick={() => toggleDealVisibility(deal.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                    isVisible
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-muted/40 text-muted-foreground opacity-60'
                  )}
                >
                  {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  <span className="truncate max-w-[140px]">{deal.name || deal.company}</span>
                  {isVisible && cfg && (
                    <span className="text-muted-foreground ml-1">{totalW}w</span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : visibleDeals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select deals above to display on the timeline.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Multi-deal Gantt Chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full pb-4">
                <div style={{ minWidth: Math.max(600, globalWeeks * 50) }}>
                  {/* Week tick headers */}
                  <div className="flex border-b border-border mb-1">
                    <div className="w-40 shrink-0 text-[10px] text-muted-foreground px-2">Deal</div>
                    <div className="flex-1 flex">
                      {weekTicks.map((tick, i) => (
                        <div
                          key={i}
                          className="text-[10px] text-muted-foreground text-center shrink-0"
                          style={{ width: `${100 / Math.max(globalWeeks, 1)}%` }}
                        >
                          {format(tick, 'MMM d')}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deal rows */}
                  {visibleDeals.map((deal, dealIdx) => {
                    const cfg = configs[deal.id];
                    if (!cfg) return null;
                    const dealStart = new Date(cfg.startDate + 'T00:00:00');
                    const totalW = getTotalWeeks(cfg);
                    const estimatedClose = addDays(dealStart, totalW * 7);
                    const stageRanges = computeStageRanges(cfg);

                    // Position relative to globalStart
                    const offsetWeeks = differenceInCalendarWeeks(dealStart, globalStart, { weekStartsOn: 1 });
                    const offsetPct = (offsetWeeks / Math.max(globalWeeks, 1)) * 100;
                    const widthPct = (totalW / Math.max(globalWeeks, 1)) * 100;

                    return (
                      <div
                        key={deal.id}
                        className={cn(
                          'flex items-center border-b border-border/50 last:border-b-0 group',
                          'hover:bg-muted/30 transition-colors'
                        )}
                      >
                        {/* Deal name label */}
                        <button
                          className={cn(
                            'w-40 shrink-0 px-2 py-2 text-left text-xs font-medium truncate border-l-2',
                            DEAL_ROW_COLORS[dealIdx % DEAL_ROW_COLORS.length],
                            expandedDealId === deal.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                          )}
                          onClick={() => setExpandedDealId(expandedDealId === deal.id ? null : deal.id)}
                          title={`Click to edit stages for ${deal.name || deal.company}`}
                        >
                          <span className="flex items-center gap-1">
                            <Settings2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            {deal.name || deal.company}
                          </span>
                          <span className="block text-[10px] text-muted-foreground font-normal">
                            {totalW}w · Close {format(estimatedClose, 'MMM d')}
                          </span>
                        </button>

                        {/* Gantt bar area */}
                        <div className="flex-1 h-10 relative" ref={ganttAreaRef}>
                          <div
                            className={cn(
                              'absolute top-1 h-8 flex rounded overflow-hidden cursor-grab active:cursor-grabbing',
                              draggingDealId === deal.id && 'ring-2 ring-primary/50 shadow-lg'
                            )}
                            style={{ left: `${offsetPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                            onMouseDown={(e) => {
                              const container = e.currentTarget.parentElement;
                              if (container) handleDragStart(e, deal.id, container as HTMLDivElement);
                            }}
                            title="Drag to move timeline"
                          >
                            <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-40 hover:opacity-80">
                              <GripHorizontal className="h-3 w-3 text-primary-foreground" />
                            </div>
                            {stageRanges.map((stage, i) => {
                              if (stage.weeks === 0) return null;
                              const stagePct = (stage.weeks / Math.max(totalW, 1)) * 100;
                              return (
                                <div
                                  key={stage.id}
                                  className={cn(
                                    'flex items-center justify-center text-[10px] font-medium text-primary-foreground transition-all',
                                    STAGE_COLORS[i % STAGE_COLORS.length]
                                  )}
                                  style={{ width: `${stagePct}%` }}
                                  title={`${stage.name}: ${stage.weeks}w (${format(stage.startDate, 'MMM d')} – ${format(stage.endDate, 'MMM d')})`}
                                >
                                  <span className="truncate px-0.5">
                                    {stagePct > 18 ? stage.name : stagePct > 10 ? `${stage.weeks}w` : ''}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Expanded stage editor for selected deal */}
          {expandedDealId && configs[expandedDealId] && (() => {
            const deal = deals.find(d => d.id === expandedDealId);
            const cfg = configs[expandedDealId];
            if (!deal || !cfg) return null;
            const stageRanges = computeStageRanges(cfg);
            const totalW = getTotalWeeks(cfg);
            const startDate = new Date(cfg.startDate + 'T00:00:00');
            const estimatedClose = addDays(startDate, totalW * 7);

            return (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      {deal.name || deal.company} — Stage Editor
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {totalW} weeks
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Close: {format(estimatedClose, 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Start date */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-muted-foreground">Start Date:</span>
                    <Input
                      type="date"
                      className="h-7 w-40 text-xs"
                      value={cfg.startDate}
                      onChange={e => updateStartDate(expandedDealId, e.target.value)}
                    />
                  </div>

                  {stageRanges.map((stage, i) => (
                    <div
                      key={stage.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <div className={cn('h-3 w-3 rounded-full shrink-0', STAGE_COLORS[i % STAGE_COLORS.length])} />
                      <div className="flex-1 min-w-0">
                        <InlineEditField
                          value={stage.name}
                          onSave={(newName) => updateStageName(expandedDealId, stage.id, newName)}
                          placeholder="Stage name"
                          displayClassName="text-sm font-medium"
                          inputClassName="h-7 text-sm"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">
                        {format(stage.startDate, 'MMM d')}
                        {stage.weeks > 0 && (
                          <>
                            <ArrowRight className="inline h-3 w-3 mx-1" />
                            {format(stage.endDate, 'MMM d')}
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateStageWeeks(expandedDealId, stage.id, -1)}
                          disabled={stage.weeks <= 0}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-mono tabular-nums">{stage.weeks}w</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => updateStageWeeks(expandedDealId, stage.id, 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeStage(expandedDealId, stage.id)}
                        disabled={cfg.stages.length <= 1}
                        title="Remove stage"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-xs"
                    onClick={() => addStage(expandedDealId)}
                  >
                    <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                    Add Stage
                  </Button>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
