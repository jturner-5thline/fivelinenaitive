import { useState } from 'react';
import { Deal } from '@/types/deal';
import { useDealPipelineConfig } from '@/hooks/useDealPipelineConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { CalendarDays, ChevronLeft, Minus, Plus, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

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

export function DealsTimelineView({ deals }: DealsTimelineViewProps) {
  const [selectedDealId, setSelectedDealId] = useState<string>(deals[0]?.id || '');
  const selectedDeal = deals.find(d => d.id === selectedDealId);

  const { config, isLoading, isSaving, updateStageWeeks, updateStartDate } = useDealPipelineConfig(
    selectedDealId || null,
    selectedDeal?.createdAt
  );

  if (deals.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No deals to display on timeline.
        </CardContent>
      </Card>
    );
  }

  const totalWeeks = config?.stages.reduce((sum, s) => sum + s.weeks, 0) ?? 0;
  const startDate = config?.startDate ? new Date(config.startDate + 'T00:00:00') : new Date();
  const estimatedCloseDate = addDays(startDate, totalWeeks * 7);

  // Compute per-stage date ranges
  const stageRanges = config?.stages.map((stage, i) => {
    const prevWeeks = config.stages.slice(0, i).reduce((sum, s) => sum + s.weeks, 0);
    const stageStart = addDays(startDate, prevWeeks * 7);
    const stageEnd = addDays(stageStart, stage.weeks * 7);
    return { ...stage, startDate: stageStart, endDate: stageEnd };
  }) ?? [];

  // Build week tick marks for the Gantt strip
  const weekTicks = Array.from({ length: Math.max(totalWeeks, 1) }, (_, i) =>
    addDays(startDate, i * 7)
  );

  return (
    <div className="space-y-4">
      {/* Deal Selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedDealId} onValueChange={setSelectedDealId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a deal..." />
          </SelectTrigger>
          <SelectContent>
            {deals.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.name || d.company}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isSaving && <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : config ? (
        <>
          {/* A. Header / Summary */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Deal</p>
                  <p className="font-semibold text-lg">{selectedDeal?.name || selectedDeal?.company}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Start Date</p>
                  <Input
                    type="date"
                    className="h-8 w-40 text-sm"
                    value={config.startDate}
                    onChange={e => updateStartDate(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Duration</p>
                    <p className="font-semibold">{totalWeeks} weeks</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Close</p>
                    <p className="font-semibold">{format(estimatedCloseDate, 'EEE, MMM d, yyyy')}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* B. Stage Editor List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Stage Durations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stageRanges.map((stage, i) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  {/* Color dot */}
                  <div className={cn('h-3 w-3 rounded-full shrink-0', STAGE_COLORS[i % STAGE_COLORS.length])} />

                  {/* Stage name */}
                  <span className="text-sm font-medium flex-1 min-w-0 truncate">{stage.name}</span>

                  {/* Date range */}
                  <span className="text-xs text-muted-foreground hidden sm:block whitespace-nowrap">
                    {format(stage.startDate, 'MMM d')}
                    {stage.weeks > 0 && (
                      <>
                        <ArrowRight className="inline h-3 w-3 mx-1" />
                        {format(stage.endDate, 'MMM d')}
                      </>
                    )}
                  </span>

                  {/* Weeks control */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateStageWeeks(stage.id, -1)}
                      disabled={stage.weeks <= 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-mono tabular-nums">{stage.weeks}w</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => updateStageWeeks(stage.id, 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* C. Timeline Strip (Gantt) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="w-full pb-4">
                <div className="min-w-[600px]">
                  {/* Week tick headers */}
                  <div className="flex border-b border-border mb-2">
                    {weekTicks.map((tick, i) => (
                      <div
                        key={i}
                        className="text-[10px] text-muted-foreground text-center shrink-0"
                        style={{ width: `${100 / Math.max(totalWeeks, 1)}%` }}
                      >
                        {format(tick, 'MMM d')}
                      </div>
                    ))}
                  </div>

                  {/* Stage bars */}
                  <div className="flex h-12 rounded-md overflow-hidden">
                    {stageRanges.map((stage, i) => {
                      if (stage.weeks === 0) return null;
                      const pct = (stage.weeks / Math.max(totalWeeks, 1)) * 100;
                      return (
                        <div
                          key={stage.id}
                          className={cn(
                            'flex items-center justify-center text-[11px] font-medium text-primary-foreground transition-all duration-300',
                            STAGE_COLORS[i % STAGE_COLORS.length]
                          )}
                          style={{ width: `${pct}%` }}
                          title={`${stage.name}: ${stage.weeks}w (${format(stage.startDate, 'MMM d')} – ${format(stage.endDate, 'MMM d')})`}
                        >
                          <span className="truncate px-1">
                            {pct > 12 ? stage.name : ''}{pct > 8 ? ` (${stage.weeks}w)` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
