import { useState, useMemo } from 'react';
import { Clock, ChevronUp, ChevronDown, ArrowRight, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWeeklyHours, formatWeekLabel } from '@/hooks/useWeeklyHours';
import { WeeklyHoursModal } from '@/components/weekly-hours/WeeklyHoursModal';

export function WeeklyHoursWidget() {
  const { deals, week, task, isLoading } = useWeeklyHours();
  const [isOpen, setIsOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const savedCount = useMemo(() => deals.filter(d => d.existingHours !== null).length, [deals]);
  const totalDeals = deals.length;
  const totalHours = useMemo(() => deals.reduce((sum, d) => sum + (d.existingHours || 0), 0), [deals]);
  const isComplete = task?.status === 'completed';
  const progress = totalDeals > 0 ? (savedCount / totalDeals) * 100 : 0;

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Don't show widget if user has no active deals
  if (totalDeals === 0) return null;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="h-full">
        <Card className="h-full flex flex-col">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-base font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Weekly Hours
                  {isComplete ? (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Check className="h-3 w-3" /> Done
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      {savedCount}/{totalDeals}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent className="flex-1 min-h-0 flex flex-col">
            <CardContent className="pt-0 space-y-3 flex-1 min-h-0">
              <p className="text-xs text-muted-foreground">
                {formatWeekLabel(week)}
              </p>

              {/* Progress */}
              <div className="space-y-1.5">
                <Progress value={progress} className="h-1.5" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{savedCount} of {totalDeals} deals logged</span>
                  <span className="font-medium">{totalHours}h total</span>
                </div>
              </div>

              {/* Deal list preview */}
              <div className="space-y-1">
                {deals.slice(0, 4).map(deal => (
                  <div key={deal.dealId} className="flex items-center gap-2 py-1.5 text-sm">
                    {deal.existingHours !== null ? (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 shrink-0" />
                    )}
                    <span className="truncate flex-1 text-foreground">{deal.dealName}</span>
                    {deal.existingHours !== null && (
                      <span className="text-xs text-muted-foreground font-medium shrink-0">{deal.existingHours}h</span>
                    )}
                  </div>
                ))}
                {deals.length > 4 && (
                  <p className="text-xs text-muted-foreground pl-5">
                    +{deals.length - 4} more
                  </p>
                )}
              </div>

              {/* Action button */}
              <Button
                onClick={() => setModalOpen(true)}
                size="sm"
                variant={isComplete ? 'outline' : 'default'}
                className="w-full"
              >
                {isComplete ? 'Review Hours' : 'Log Hours'}
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <WeeklyHoursModal open={modalOpen} onOpenChange={setModalOpen} week={week} />
    </>
  );
}
