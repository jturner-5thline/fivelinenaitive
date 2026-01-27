import { useState } from "react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subYears } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FinancePeriodType } from "@/hooks/useFinanceDataRange";

interface FinanceDateRangePickerProps {
  periodType: FinancePeriodType;
  setPeriodType: (type: FinancePeriodType) => void;
  startDate: Date;
  setStartDate: (date: Date) => void;
  endDate: Date;
  setEndDate: (date: Date) => void;
}

const presetRanges = [
  { label: "Last 3 months", months: 3 },
  { label: "Last 6 months", months: 6 },
  { label: "Last 12 months", months: 12 },
  { label: "YTD", months: 0, isYTD: true },
  { label: "Last year", months: 0, isLastYear: true },
];

export function FinanceDateRangePicker({
  periodType,
  setPeriodType,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: FinanceDateRangePickerProps) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const handlePeriodTypeChange = (value: string) => {
    if (value) {
      setPeriodType(value as FinancePeriodType);
      // Adjust dates to align with period boundaries
      if (value === 'monthly') {
        setStartDate(startOfMonth(startDate));
        setEndDate(endOfMonth(endDate));
      } else if (value === 'quarterly') {
        setStartDate(startOfQuarter(startDate));
        setEndDate(endOfQuarter(endDate));
      } else {
        setStartDate(startOfYear(startDate));
        setEndDate(endOfYear(endDate));
      }
    }
  };

  const handlePresetSelect = (preset: typeof presetRanges[0]) => {
    const now = new Date();
    
    if (preset.isYTD) {
      setStartDate(startOfYear(now));
      setEndDate(endOfMonth(now));
    } else if (preset.isLastYear) {
      const lastYear = subYears(now, 1);
      setStartDate(startOfYear(lastYear));
      setEndDate(endOfYear(lastYear));
    } else {
      setStartDate(startOfMonth(subMonths(now, preset.months - 1)));
      setEndDate(endOfMonth(now));
    }
  };

  const handleStartDateSelect = (date: Date | undefined) => {
    if (date) {
      let adjustedDate = date;
      if (periodType === 'monthly') {
        adjustedDate = startOfMonth(date);
      } else if (periodType === 'quarterly') {
        adjustedDate = startOfQuarter(date);
      } else {
        adjustedDate = startOfYear(date);
      }
      setStartDate(adjustedDate);
      setStartOpen(false);
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date) {
      let adjustedDate = date;
      if (periodType === 'monthly') {
        adjustedDate = endOfMonth(date);
      } else if (periodType === 'quarterly') {
        adjustedDate = endOfQuarter(date);
      } else {
        adjustedDate = endOfYear(date);
      }
      setEndDate(adjustedDate);
      setEndOpen(false);
    }
  };

  const getDateFormat = () => {
    if (periodType === 'monthly') return 'MMM yyyy';
    if (periodType === 'quarterly') return 'QQQ yyyy';
    return 'yyyy';
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        type="single"
        value={periodType}
        onValueChange={handlePeriodTypeChange}
        className="bg-muted/50 rounded-lg p-1"
      >
        <ToggleGroupItem value="monthly" className="px-3 py-1.5 text-sm">
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem value="quarterly" className="px-3 py-1.5 text-sm">
          Quarterly
        </ToggleGroupItem>
        <ToggleGroupItem value="annual" className="px-3 py-1.5 text-sm">
          Annual
        </ToggleGroupItem>
      </ToggleGroup>

      <Select onValueChange={(value) => {
        const preset = presetRanges.find(p => p.label === value);
        if (preset) handlePresetSelect(preset);
      }}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Quick select" />
        </SelectTrigger>
        <SelectContent>
          {presetRanges.map((preset) => (
            <SelectItem key={preset.label} value={preset.label}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Popover open={startOpen} onOpenChange={setStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, getDateFormat()) : "Start date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={handleStartDateSelect}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground">to</span>

        <Popover open={endOpen} onOpenChange={setEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[140px] justify-start text-left font-normal",
                !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, getDateFormat()) : "End date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={handleEndDateSelect}
              disabled={(date) => date < startDate}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
