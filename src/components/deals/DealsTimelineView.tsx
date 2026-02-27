import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Deal } from '@/types/deal';
import { useMultiDealPipelineConfigs, DealPipelineConfig } from '@/hooks/useDealPipelineConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InlineEditField } from '@/components/ui/inline-edit-field';
import { CalendarDays, Minus, Plus, Clock, ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff, Settings2, Trash2, PlusCircle, GripHorizontal, Undo2, Redo2, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, differenceInCalendarWeeks, min as dateMin, max as dateMax } from 'date-fns';

interface DealsTimelineViewProps {
  deals: Deal[];
}

const STAGE_STYLES = [
  { bg: 'bg-blue-500/20 backdrop-blur-sm', border: 'border border-blue-400/50', text: 'text-blue-200', glow: 'shadow-[inset_0_1px_1px_rgba(96,165,250,0.2)]' },
  { bg: 'bg-violet-500/20 backdrop-blur-sm', border: 'border border-violet-400/50', text: 'text-violet-200', glow: 'shadow-[inset_0_1px_1px_rgba(167,139,250,0.2)]' },
  { bg: 'bg-emerald-500/20 backdrop-blur-sm', border: 'border border-emerald-400/50', text: 'text-emerald-200', glow: 'shadow-[inset_0_1px_1px_rgba(52,211,153,0.2)]' },
  { bg: 'bg-amber-500/20 backdrop-blur-sm', border: 'border border-amber-400/50', text: 'text-amber-200', glow: 'shadow-[inset_0_1px_1px_rgba(251,191,36,0.2)]' },
  { bg: 'bg-rose-500/20 backdrop-blur-sm', border: 'border border-rose-400/50', text: 'text-rose-200', glow: 'shadow-[inset_0_1px_1px_rgba(251,113,133,0.2)]' },
  { bg: 'bg-cyan-500/20 backdrop-blur-sm', border: 'border border-cyan-400/50', text: 'text-cyan-200', glow: 'shadow-[inset_0_1px_1px_rgba(103,232,249,0.2)]' },
  { bg: 'bg-indigo-500/20 backdrop-blur-sm', border: 'border border-indigo-400/50', text: 'text-indigo-200', glow: 'shadow-[inset_0_1px_1px_rgba(129,140,248,0.2)]' },
  { bg: 'bg-pink-500/20 backdrop-blur-sm', border: 'border border-pink-400/50', text: 'text-pink-200', glow: 'shadow-[inset_0_1px_1px_rgba(244,114,182,0.2)]' },
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

  // Fullscreen / expanded mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drag state
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; origStartDate: string; containerWidth: number; globalWeeks: number; globalStartDate: Date } | null>(null);

  const dealCreatedAtMap = useMemo(() => {
    const map: Record<string, string> = {};
    deals.forEach(d => { map[d.id] = d.createdAt; });
    return map;
  }, [deals]);

  const allDealIds = useMemo(() => deals.map(d => d.id), [deals]);

  const { configs, isLoading, updateStageWeeks, updateStartDate, updateStageName, addStage, removeStage, undo, redo, canUndo, canRedo } = useMultiDealPipelineConfigs(
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
  const configsRef = useRef(configs);
  configsRef.current = configs;

  const handleDragStart = useCallback((e: React.MouseEvent, dealId: string, containerEl: HTMLDivElement) => {
    e.preventDefault();
    const cfg = configsRef.current[dealId];
    if (!cfg) return;
    setDraggingDealId(dealId);
    const info = globalInfoRef.current;
    const startX = e.clientX;
    const origStartDate = cfg.startDate;
    const containerWidth = containerEl.getBoundingClientRect().width;
    const gWeeks = info.globalWeeks;
    let lastDelta = 0;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const pxPerWeek = containerWidth / Math.max(gWeeks, 1);
      const deltaWeeks = Math.round(dx / pxPerWeek);
      if (deltaWeeks === lastDelta) return;
      lastDelta = deltaWeeks;
      const origDate = new Date(origStartDate + 'T00:00:00');
      const newDate = addDays(origDate, deltaWeeks * 7);
      updateStartDate(dealId, newDate.toISOString().split('T')[0]);
    };

    const onMouseUp = () => {
      setDraggingDealId(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateStartDate]);

  // Resize handler for individual stage edges
  const handleResizeStart = useCallback((e: React.MouseEvent, dealId: string, stageId: string, barEl: HTMLDivElement) => {
    e.preventDefault();
    e.stopPropagation();
    const cfg = configsRef.current[dealId];
    if (!cfg) return;
    const stage = cfg.stages.find(s => s.id === stageId);
    if (!stage) return;
    const totalW = getTotalWeeks(cfg);
    const startX = e.clientX;
    const origWeeks = stage.weeks;
    const barWidth = barEl.getBoundingClientRect().width;
    let lastNewWeeks = origWeeks;

    document.body.style.cursor = 'col-resize';

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const pxPerWeek = barWidth / Math.max(totalW, 1);
      const newWeeks = Math.max(0, origWeeks + Math.round(dx / pxPerWeek));
      if (newWeeks === lastNewWeeks) return;
      const delta = newWeeks - lastNewWeeks;
      lastNewWeeks = newWeeks;
      updateStageWeeks(dealId, stageId, delta);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [updateStageWeeks]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [undo, redo]);

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
          {(() => {
            const ganttContent = (expanded: boolean) => (
              <ScrollArea className={cn('w-full pb-4', expanded && 'h-[70vh]')}>
                <div style={{ minWidth: Math.max(600, globalWeeks * (expanded ? 80 : 50)) }}>
                  {/* Week tick headers */}
                  <div className="flex border-b border-border mb-1">
                    <div className={cn('shrink-0 text-[10px] text-muted-foreground px-2 sticky left-0 z-10 bg-card', expanded ? 'w-52' : 'w-40')}>Deal</div>
                    <div className="flex-1 flex">
                      {weekTicks.map((tick, i) => (
                        <div
                          key={i}
                          className={cn('text-muted-foreground text-center shrink-0', expanded ? 'text-xs' : 'text-[10px]')}
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
                        <button
                          className={cn(
                            'shrink-0 px-2 text-left text-xs font-medium truncate border-l-2 sticky left-0 z-10 bg-card',
                            expanded ? 'w-52 py-3' : 'w-40 py-2',
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

                        <div className={cn('flex-1 relative', expanded ? 'h-14' : 'h-10')} ref={ganttAreaRef}>
                          <div
                            className={cn(
                              'absolute flex rounded-md cursor-grab active:cursor-grabbing',
                              'bg-background/5 shadow-[0_0_15px_rgba(139,92,246,0.08)]',
                              expanded ? 'top-2 h-10' : 'top-1 h-8',
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
                              const isLast = i === stageRanges.length - 1;
                              return (
                                <div
                                  key={stage.id}
                                  className={cn(
                                    'relative flex items-center justify-center font-semibold',
                                    expanded ? 'text-xs' : 'text-[10px]',
                                    STAGE_STYLES[i % STAGE_STYLES.length].bg,
                                    STAGE_STYLES[i % STAGE_STYLES.length].border,
                                    STAGE_STYLES[i % STAGE_STYLES.length].text,
                                    STAGE_STYLES[i % STAGE_STYLES.length].glow,
                                    i === 0 && 'rounded-l-md',
                                    isLast && 'rounded-r-md'
                                  )}
                                  style={{ width: `${stagePct}%` }}
                                  title={`${stage.name}: ${stage.weeks}w (${format(stage.startDate, 'MMM d')} – ${format(stage.endDate, 'MMM d')})`}
                                >
                                  <span className="truncate px-1">
                                    {stagePct > 18 ? `${stage.name} (${stage.weeks}w)` : `${stage.weeks}w`}
                                  </span>
                                  <div
                                    className={cn(
                                      'absolute top-0 h-full cursor-col-resize z-20 group/resize hover:bg-background/30',
                                      isLast ? 'right-0 w-3 rounded-r-md' : 'right-0 w-2'
                                    )}
                                    onMouseDown={(e) => {
                                      const barEl = e.currentTarget.parentElement?.parentElement as HTMLDivElement | null;
                                      if (barEl) handleResizeStart(e, deal.id, stage.id, barEl);
                                    }}
                                  >
                                    <div className="absolute right-[3px] top-1/2 -translate-y-1/2 w-[2px] h-4 bg-primary-foreground/40 rounded-full group-hover/resize:bg-primary-foreground/80" />
                                  </div>
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
            );

            const toolbarButtons = (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                  <Undo2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                  <Redo2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsFullscreen(f => !f)}
                  title={isFullscreen ? 'Exit fullscreen' : 'Expand timeline'}
                >
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            );

            return (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">Timeline</CardTitle>
                      {toolbarButtons}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {ganttContent(false)}
                  </CardContent>
                </Card>

                <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
                  <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] p-0">
                    <DialogHeader className="px-6 pt-6 pb-2">
                      <div className="flex items-center justify-between">
                        <DialogTitle className="text-base font-medium">Deal Timeline</DialogTitle>
                        {toolbarButtons}
                      </div>
                    </DialogHeader>
                    <div className="px-6 pb-6 overflow-auto max-h-[calc(90vh-5rem)]">
                      {ganttContent(true)}
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            );
          })()}

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
                      <div className={cn('h-3 w-3 rounded-full shrink-0', STAGE_STYLES[i % STAGE_STYLES.length].bg, STAGE_STYLES[i % STAGE_STYLES.length].border)} />
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
