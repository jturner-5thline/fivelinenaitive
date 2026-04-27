import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, Loader2 } from "lucide-react";
import { useIsFetching } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  buildCustomPeriod,
  type QuarterOption,
} from "@/hooks/useQBQuarterlyRevenue";

interface PeriodPickerProps {
  quarterOptions: QuarterOption[];
  selected: QuarterOption;
  onChange: (next: QuarterOption) => void;
  className?: string;
}

/**
 * Unified period picker for the Insights header.
 * - "Quarter" tab: pick from Q1–Q4 across recent years (uses provided quarterOptions).
 * - "Custom" tab: pick an arbitrary start/end date range.
 *
 * Returns a QuarterOption-shaped object so downstream charts that group by
 * `selectedQuarter.months` (stage-entry month buckets) keep working unchanged.
 */
export function PeriodPicker({
  quarterOptions,
  selected,
  onChange,
  className,
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const isCustom = selected.value.startsWith("custom-");

  // Shows a spinner in the trigger whenever ANY quarter-driven query is
  // refetching, so the user gets immediate "we heard you" feedback the
  // moment they switch periods — even if a particular chart's cache hits.
  const fetchingCount = useIsFetching({
    predicate: (q) => {
      const key = q.queryKey;
      if (!Array.isArray(key)) return false;
      const prefix = String(key[0] ?? '');
      return (
        prefix.startsWith('qb-') ||
        prefix.startsWith('stage-entry') ||
        prefix.startsWith('pipeline-') ||
        prefix.startsWith('entity-profit')
      );
    },
  });
  const isRefreshing = fetchingCount > 0;

  // Group quarters by year for a tidy Q1/Q2/Q3/Q4 grid
  const quartersByYear = useMemo(() => {
    const byYear = new Map<number, QuarterOption[]>();
    for (const q of quarterOptions) {
      const yMatch = q.value.match(/^(\d{4})-Q[1-4]$/);
      if (!yMatch) continue;
      const y = Number(yMatch[1]);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(q);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, qs]) => ({
        year,
        quarters: [1, 2, 3, 4].map(
          n => qs.find(q => q.value === `${year}-Q${n}`) ?? null,
        ),
      }));
  }, [quarterOptions]);

  const [customStart, setCustomStart] = useState<Date | undefined>(
    isCustom ? new Date(selected.startDate) : undefined,
  );
  const [customEnd, setCustomEnd] = useState<Date | undefined>(
    isCustom ? new Date(selected.endDate) : undefined,
  );

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    const [s, e] = customStart <= customEnd
      ? [customStart, customEnd]
      : [customEnd, customStart];
    onChange(buildCustomPeriod(s, e));
    setOpen(false);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs justify-between min-w-[160px]"
          >
            <span className="truncate">{selected.label}</span>
            <ChevronDown className="h-3.5 w-3.5 ml-2 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 pointer-events-auto" align="end">
          <Tabs defaultValue={isCustom ? "custom" : "quarter"} className="w-[320px]">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="quarter" className="text-xs">Quarter</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs">Custom range</TabsTrigger>
            </TabsList>

            <TabsContent value="quarter" className="space-y-3">
              {quartersByYear.map(({ year, quarters }) => (
                <div key={year} className="space-y-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {year}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {quarters.map((q, idx) => {
                      const label = `Q${idx + 1}`;
                      if (!q) {
                        return (
                          <Button
                            key={`${year}-${idx}`}
                            variant="ghost"
                            size="sm"
                            disabled
                            className="h-8 text-xs opacity-30"
                          >
                            {label}
                          </Button>
                        );
                      }
                      const active = q.value === selected.value;
                      return (
                        <Button
                          key={q.value}
                          variant={active ? "default" : "outline"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            onChange(q);
                            setOpen(false);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="custom" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Start
                  </div>
                  <Calendar
                    mode="single"
                    selected={customStart}
                    onSelect={setCustomStart}
                    className={cn("p-2 pointer-events-auto rounded-md border")}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    End
                  </div>
                  <Calendar
                    mode="single"
                    selected={customEnd}
                    onSelect={setCustomEnd}
                    className={cn("p-2 pointer-events-auto rounded-md border")}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="text-[11px] text-muted-foreground">
                  {customStart && customEnd
                    ? `${format(customStart, "MMM d, yyyy")} – ${format(customEnd, "MMM d, yyyy")}`
                    : "Pick a start and end date"}
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!customStart || !customEnd}
                  onClick={applyCustom}
                >
                  Apply
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
    </div>
  );
}