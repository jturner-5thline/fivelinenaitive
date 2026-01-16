import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameDay, startOfMonth, endOfMonth, isWithinInterval, addMonths, subMonths } from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { DayPicker, DayContentProps } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useAllMilestones, MilestoneWithDeal } from '@/hooks/useAllMilestones';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

export function DealsCalendar() {
  const navigate = useNavigate();
  const { milestones, isLoading } = useAllMilestones();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  // Get milestones for a specific date
  const getMilestonesForDate = (date: Date): MilestoneWithDeal[] => {
    return milestones.filter(m => m.due_date && isSameDay(new Date(m.due_date), date));
  };

  // Get dates that have milestones for the current month view
  const milestoneDates = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    
    return milestones
      .filter(m => m.due_date && isWithinInterval(new Date(m.due_date), { start: monthStart, end: monthEnd }))
      .reduce((acc, m) => {
        const dateKey = format(new Date(m.due_date!), 'yyyy-MM-dd');
        if (!acc[dateKey]) {
          acc[dateKey] = { completed: 0, pending: 0, overdue: 0 };
        }
        if (m.completed) {
          acc[dateKey].completed++;
        } else if (new Date(m.due_date!) < new Date()) {
          acc[dateKey].overdue++;
        } else {
          acc[dateKey].pending++;
        }
        return acc;
      }, {} as Record<string, { completed: number; pending: number; overdue: number }>);
  }, [milestones, currentMonth]);

  // Selected date milestones
  const selectedMilestones = selectedDate ? getMilestonesForDate(selectedDate) : [];

  // Custom day content renderer
  const renderDayContent = (props: DayContentProps) => {
    const dateKey = format(props.date, 'yyyy-MM-dd');
    const counts = milestoneDates[dateKey];

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <span>{props.date.getDate()}</span>
        {counts && (
          <div className="absolute -bottom-0.5 flex gap-0.5">
            {counts.overdue > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
            )}
            {counts.pending > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
            {counts.completed > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Deals Calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-primary" />
          Deals Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-[1fr,280px] gap-4">
          {/* Calendar */}
          <div className="flex justify-center">
            <DayPicker
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              showOutsideDays
              className="p-3 pointer-events-auto"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium",
                nav: "space-x-1 flex items-center",
                nav_button: cn(
                  buttonVariants({ variant: "outline" }),
                  "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                ),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-muted-foreground rounded-md w-10 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-10 w-10 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(buttonVariants({ variant: "ghost" }), "h-10 w-10 p-0 font-normal aria-selected:opacity-100"),
                day_range_end: "day-range-end",
                day_selected:
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground",
                day_outside:
                  "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
                day_disabled: "text-muted-foreground opacity-50",
                day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                day_hidden: "invisible",
              }}
              components={{
                IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                IconRight: () => <ChevronRight className="h-4 w-4" />,
                DayContent: renderDayContent,
              }}
            />
          </div>

          {/* Selected Date Details */}
          <div className="border-l border-border pl-4">
            <div className="mb-3">
              <h4 className="text-sm font-medium">
                {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a date'}
              </h4>
              <p className="text-xs text-muted-foreground">
                {selectedMilestones.length} milestone{selectedMilestones.length !== 1 ? 's' : ''}
              </p>
            </div>

            <ScrollArea className="h-[220px]">
              {selectedDate ? (
                selectedMilestones.length > 0 ? (
                  <div className="space-y-2 pr-2">
                    {selectedMilestones.map((milestone) => {
                      const isOverdue = !milestone.completed && new Date(milestone.due_date!) < new Date();
                      
                      return (
                        <button
                          key={milestone.id}
                          onClick={() => navigate(`/deal/${milestone.deal_id}`)}
                          className="w-full text-left p-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            {milestone.completed ? (
                              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                            ) : isOverdue ? (
                              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                            ) : (
                              <Circle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={cn(
                                "text-sm font-medium line-clamp-1",
                                milestone.completed && "line-through text-muted-foreground"
                              )}>
                                {milestone.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {milestone.deal_company}
                              </p>
                            </div>
                          </div>
                          {isOverdue && !milestone.completed && (
                            <Badge variant="destructive" className="mt-1 text-xs">
                              Overdue
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No milestones on this date
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Click a date to view milestones
                </p>
              )}
            </ScrollArea>

            {/* Legend */}
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Legend</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Pending</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-muted-foreground">Complete</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">Overdue</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}