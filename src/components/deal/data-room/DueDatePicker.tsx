import { useState } from 'react';
import { Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isPast, isToday, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface DueDatePickerProps {
  dueDate: string | null | undefined;
  onSetDueDate: (date: string | null) => void;
  compact?: boolean;
}

export function DueDatePicker({ dueDate, onSetDueDate, compact }: DueDatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = dueDate ? new Date(dueDate) : undefined;
  const isOverdue = date && isPast(date) && !isToday(date);
  const isDueToday = date && isToday(date);

  const handleSelect = (selected: Date | undefined) => {
    onSetDueDate(selected ? format(selected, 'yyyy-MM-dd') : null);
    setOpen(false);
  };

  if (compact && !dueDate) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] text-muted-foreground gap-0.5">
            <CalendarIcon className="h-2.5 w-2.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={date} onSelect={handleSelect} initialFocus disabled={(d) => isPast(d) && !isToday(d)} />
          <div className="px-3 pb-2 flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 7))}>+7d</Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 14))}>+14d</Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 30))}>+30d</Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-6 px-2 text-[10px] gap-1",
            isOverdue && "border-destructive/50 text-destructive",
            isDueToday && "border-amber-500/50 text-amber-600",
          )}
        >
          {isOverdue && <AlertTriangle className="h-2.5 w-2.5" />}
          <CalendarIcon className="h-2.5 w-2.5" />
          {date ? format(date, 'MMM d') : 'Set due date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={handleSelect} initialFocus />
        <div className="px-3 pb-2 flex gap-1">
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 7))}>+7d</Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 14))}>+14d</Button>
          <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => handleSelect(addDays(new Date(), 30))}>+30d</Button>
          {date && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => handleSelect(undefined)}>Clear</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DueDateBadge({ dueDate }: { dueDate: string | null | undefined }) {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  const isOverdue = isPast(date) && !isToday(date);
  const isDueToday = isToday(date);

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[9px] h-4 px-1 gap-0.5",
        isOverdue && "border-destructive/50 text-destructive bg-destructive/5",
        isDueToday && "border-amber-500/50 text-amber-600 bg-amber-500/5",
        !isOverdue && !isDueToday && "text-muted-foreground",
      )}
    >
      {isOverdue && <AlertTriangle className="h-2 w-2" />}
      <CalendarIcon className="h-2 w-2" />
      {format(date, 'MMM d')}
    </Badge>
  );
}
